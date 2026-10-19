# Base de datos lateral (fuera de Prisma)

9 de octubre de 2026. La plataforma usa una sola base PostgreSQL. **Prisma administra únicamente el esquema `public`**, que es la operación: tareas, clientes, parrillas, finanzas. Bria y la bóveda guardan lo suyo en dos esquemas aparte, creados con SQL aditivo e idempotente que se aplica al arrancar.

## Por qué no están en Prisma
Para que Prisma los conociera habría que activar su modo de varios esquemas y listarlos en `schema.prisma`. Desde ese momento, `prisma db push` compararía también `bria_memory` y `vault`, y querría **borrar** cualquier tabla que no estuviera modelada, con datos o sin ellos. Mantenerlos fuera es lo que los protege: `db push` nunca los toca.

Lo que sí se exige:
- Las tablas están listadas aquí y en el encabezado de `schema.prisma`. `tests/sidecarSchemaRegistry.test.js` falla si se crea una tabla lateral sin documentarla o si alguien activa el modo de varios esquemas.
- Cada esquema tiene **una sola capa de acceso** por dominio (los repositorios de abajo), con SQL parametrizado; nadie escribe en estas tablas desde otro lado.

## Esquemas y tablas

### `bria_memory` (Bria)
| Tabla | Qué guarda | Archivo | Acceso |
|---|---|---|---|
| `learnings`, `learning_events` | Aprendizajes y preferencias enseñados conversando, con su historial | `scripts/sql/bria-knowledge.sql` | `briaKnowledgeRepository.js` |
| `sources`, `source_versions`, `source_search`, `import_runs` | Archivo importado de Drive y correo (solo lectura para administradores designados) | `scripts/sql/bria-knowledge.sql` | `briaKnowledgeRepository.js` |
| `conversations`, `conversation_turns`, `conversation_attachments`, `conversation_purges` | Conversaciones con Bria, sus adjuntos y el borrado pendiente de archivos | `scripts/sql/bria-conversations.sql` | `briaConversationRepository.js` |
| `agency_facts`, `agency_fact_events`, `agency_questions` | Memoria de la agencia: hechos con certeza y fuente, su historial y las dudas abiertas | `scripts/sql/bria-agency-facts.sql` | `briaAgencyFactRepository.js` |
| `sync_state` | Prototipo de sincronización continua de Drive y correo. **No se aplica todavía.** | `scripts/sql/bria-source-sync.sql` | ninguno |
| `rhythm_readings` | Lecturas de la semana que Bria escribe para la dirección desde Ritmo y el mapa de carga, con su resumen de datos y su modelo; una fila por generación | `scripts/sql/bria-rhythm-readings.sql` | `weeklyReadingRepository.js` |
| `nudge_dismissals` | Avisos de «Bria se adelanta» que una persona ocultó, con su clave y hasta cuándo | `scripts/sql/bria-proactive.sql` | `briaProactiveRepository.js` |
| `weekly_focus_deliveries` | El foco de la semana que Bria dejó en el chat de cada persona: semana, persona y conversación | `scripts/sql/bria-proactive.sql` | `briaProactiveRepository.js` |
| `daily_close_deliveries` | El cierre del día que Bria dejó en el chat de cada persona a las 5 de la tarde: día, persona y conversación | `scripts/sql/bria-proactive.sql` | `briaProactiveRepository.js` |
| `pulse_runs`, `pulse_messages` | El pulso de Bria: qué tramos ya leyó y qué le dijo a cada persona (hechos, texto, origen, si lo ocultó, y el seguimiento: desenlace o «sigue igual») | `scripts/sql/bria-proactive.sql` | `briaProactiveRepository.js` |
| `permission_requests` | Pedidos de acceso a un módulo que Bria hace por una persona: módulo, quién pidió, para qué en pocas palabras, quién decidió y cuándo | `scripts/sql/bria-proactive.sql` | `permissionRequestRepository.js` |
| `agency_snapshots` | La memoria del tiempo: una foto por día de cada cuenta (color de la operación, piezas, aprobaciones que esperan, devoluciones, tareas, horas del día anterior) y de cada persona del equipo (abiertas, en proceso, vencidas, devueltas, cerradas y horas del día anterior). Números de trabajo, nunca una calificación; sin llave hacia el cliente a propósito, para que la historia sobreviva a la ficha | `scripts/sql/bria-daily-reading.sql` | `dailyReadingRepository.js` |
| `daily_readings` | La lectura de cada día hábil: señales, lo que Bria haría y no haría con la evidencia que lo sostiene, y si la escribió el modelo o las reglas | `scripts/sql/bria-daily-reading.sql` | `dailyReadingRepository.js` |
| `morning_brief_deliveries` | La lectura de la mañana que Bria dejó en el chat de cada persona de dirección a las 7:30: día, persona y conversación | `scripts/sql/bria-proactive.sql` | `briaProactiveRepository.js` |
| `mail_accounts`, `mail_seen` | Buzones compartidos conectados por un administrador (contraseña de aplicación sellada con la llave de la bóveda) y lo ya visto en cada uno: remitente, asunto, fecha y decisión, nunca el cuerpo | `scripts/sql/bria-mail.sql` | `mailAccountRepository.js` |

### `vault` (bóveda de accesos)
| Tabla | Qué guarda | Archivo | Acceso |
|---|---|---|---|
| `credentials` | Accesos cifrados con AES-256-GCM | `scripts/sql/vault.sql` | `vaultRepository.js` |
| `credential_events` | Qué campos cambiaron y quién, nunca los valores | `scripts/sql/vault.sql` | `vaultRepository.js` |
| `reveal_events` | Quién vio cada acceso, cuándo y desde dónde | `scripts/sql/vault.sql` | `vaultRepository.js` |
| `access_requests` | Pedidos de un project manager para ver un acceso: quién pidió, para qué, quién decidió y cuándo; nunca un valor | `scripts/sql/vault.sql` | `vaultRepository.js` |

## Reglas
- **Aditivo e idempotente.** `CREATE … IF NOT EXISTS` y bloques `DO` que comprueban antes de crear. Se aplica en cada arranque: `ensure-bria-knowledge-schema.js` y `ensure-vault-schema.js`, encadenados en `npm start`. Un cambio de columnas se escribe como `ALTER … IF NOT EXISTS` en el mismo archivo.
- **Vínculo con el cliente.** `agency_facts`, `agency_questions` y `credentials` apuntan a `public."Client"(id)` con `ON DELETE SET NULL`. Si una ficha se borra, el hecho se conserva sin cliente y el acceso pasa a ser de la agencia, visible solo para administradores. Antes de crear cada llave, el arranque deja sin cliente lo que apunte a una ficha inexistente, para no fallar nunca por un dato viejo.
- **Nada se borra para «limpiar».** Hechos, accesos y aprendizajes se reemplazan, retiran o revocan con su evento. Solo se borran las conversaciones, cuando su autor lo pide.
- **Una sola reserva de conexiones** (`src/lib/sidecarPool.js`, 6 conexiones, con manejador de errores) para memoria, conversaciones, aprendizajes y bóveda. La del archivo de Drive y correo va aparte porque abre sus conexiones en modo de solo lectura.
- **Pruebas reales** solo contra `TEST_DATABASE_URL` aislada, nunca contra la base que indica `.env`.
