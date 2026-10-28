# Historial de actividad del equipo

- El panel administrativo conserva los filtros de miembro y período y la actualización manual; no incluye búsqueda por tarea. La API conserva compatibilidad con ese parámetro para consumidores anteriores.
- `src/lib/operationalMutationLabels.js` centraliza un catálogo explícito de acciones y frases cotidianas: «Helen envió un comentario», «Helen actualizó los datos de un cliente». Al añadir rutas, revisar su significado y añadir pruebas; no convertir un endpoint desconocido en «creó o ejecutó un registro». Los nombres internos nunca se muestran como módulos.
- Un POST no demuestra que se creó un registro. `/recognitions/claim` es una comprobación automática; puede no encontrar ningún premio. `/recognitions/:id/acknowledge` confirma la preparación del aviso, no prueba que la persona lo vio. `/fireflies/graphql` registra una solicitud de Minutas: el historial no conserva la operación GraphQL ni su resultado, por lo que no se infiere creación, lectura ni éxito editorial.
- Las consultas de reconocimientos/Minutas, reservas de avisos, suscripciones push y duplicados de aperturas/confirmaciones dejan de generar entradas en el middleware. Los demás registros técnicos históricos no se borran con este cambio: se excluyen de esta vista y sus contadores. No se alteran los registros específicos de seguridad/finanzas ni la retención existente de 365 días.
- La selección de acciones visibles ocurre en PostgreSQL **antes** del límite. Un volumen alto de comprobaciones no debe desplazar las acciones reales. La vista admite hasta 120 entradas; sus contadores corresponden a esa lista, no a la totalidad histórica. Cambios sin actor y operaciones sin significado conocido no se atribuyen a personas.
- Gestión envía `syncSource=MANUAL` solo desde su botón; carga inicial, polling y recargas por foco usan `AUTOMATIC`. Solo MANUAL, tras la lectura exitosa, escribe «Helen actualizó la lista de tareas». Los orígenes desconocidos no se reinterpretan. La fuente es información de interfaz, no un permiso de seguridad.

## Reconocimientos y respuestas a avisos

- `RECOGNITION_GRANTED` se guarda con la concesión del premio en la misma transacción. Solo una inserción nueva genera la entrada, con persona, categoría e identidad del reconocimiento. «Helen recibió el reconocimiento “Buen comienzo”» significa que se otorgó, **no** que leyó o vio su popup. No se reconstruyen premios antiguos desde consultas ni se generan premios retroactivos.
- `TASK_ALERT_SHOWN` procede del reporte del navegador cuando la tarjeta está visible en el diálogo frontal y la página está visible. No basta obtener la lista de alertas. El servidor comprueba usuario activo, permiso de Gestión, titularidad y umbral de la tarea (15 horas de trabajo o una hora devuelta).
- `TASK_ALERT_REVIEWED` y `TASK_ALERT_DISMISSED` refieren al aviso mostrado mediante su `noticeId`. El servidor no acepta destinatarios, títulos ni descripciones libres enviados por el navegador. Se deduplican por aviso/acción con un bloqueo de transacción por aviso y la clave única del registro. La confirmación de «Sigo trabajando» y «Recordarme más tarde» conserva sus eventos específicos, generados solo después de persistir la acción.
- Esto acredita un reporte de interfaz y la elección comunicada, no que la persona haya leído o corregido la tarea. «Marcó como leída» tampoco equivale a haber leído el contenido.
- Fallos temporales al reportar visibilidad/elección se reintentan una vez con la misma identidad. Si fallan, se conserva el error en consola y no se inventa una entrada; abrir la tarea no queda bloqueado. Las muestras explícitas no reportan acciones productivas.
- La muestra y las pruebas no conectan a producción. `tests/browser/operationalTrace.mjs` usa el panel real y el servicio real con persistencia simulada. Comprueba filtros, errores de API, ausencia de búsqueda y móvil táctil; las capturas quedan en `output/operational-trace/`.
- Pruebas de lógica y permisos: `node --test tests/humanOperationalTrace.test.js tests/taskAlertInteraction.test.js tests/operationalMutationLabels.test.js tests/operationalTraceService.test.js tests/operationalTraceUi.test.js`.
- Pruebas de interfaz: `node --test --test-concurrency=1 tests/browser/taskAlertTrace.mjs tests/browser/operationalTrace.mjs tests/browser/taskRefreshOrigin.mjs`. Incluyen pestaña oculta, reintentos, cierre, navegación, ambos avisos, modo oscuro y móvil táctil.
- PostgreSQL real: `tests/recognitionPostgres.integration.mjs` comprueba el filtrado antes del límite, peticiones simultáneas, rollback de reconocimiento/historial y entrega autenticada. Solo permite `TEST_DATABASE_URL` en `127.0.0.1:55448/recognition_test`, con usuario `recognition_test`; valida el destino antes de importar servicios con cliente compartido. No usar `.env` productivo ni otro clúster para estas pruebas.
- No requiere cambios de esquema. Verificación local no equivale a despliegue productivo; nuevos eventos de concesión/visibilidad empiezan al publicar esta versión.

## Alertas comerciales y la banda de avisos importantes (27 de octubre de 2026)

Rodny: «quiero que los logs guarden todos esos eventos». Seis eventos propios, con sus frases en un solo sitio, `src/lib/importantNoticeTrace.js`, que leen el servidor al registrar y el panel al mostrar:

| Evento | Autor | Cuándo |
| --- | --- | --- |
| `CRM_FOLLOW_UP_ALERTS_SENT` | la plataforma | Una entrada por persona y pase del reloj: cuántas revisiones y recordatorios, cuántos avisos salieron en la campana y cuántos quedaron en la banda. |
| `IMPORTANT_NOTICE_SHOWN` | la plataforma | La banda lo reporta con la pestaña visible (`POST /api/important-notices/:id/shown`). Una vez por aparición: la primera y cada vuelta después de «Recordarme» (llave fija por aviso y hora de vuelta). |
| `IMPORTANT_NOTICE_FOLLOWED_UP` | quien decide | «Ya hice seguimiento», con el canal. |
| `IMPORTANT_NOTICE_SNOOZED` | quien decide | «Recordarme», con la opción y la hora de vuelta. |
| `IMPORTANT_NOTICE_CLOSED` | quien decide | «No sigue», perdida o descartada. |
| `IMPORTANT_NOTICE_CLEARED` | la plataforma | El aviso salió solo de la banda, con el motivo: una gestión registrada en el CRM, la oportunidad ya no espera al cliente, ya no está activa, o pasó al equipo comercial (`REASIGNADO`, 28 de octubre de 2026: las alertas del CRM son solo de quien tiene rol comercial). |

- Cada entrada nombra la oportunidad y enlaza a ella en el CRM (`noticeTraceLink`, solo rutas `/crm/`). La metadata guarda aviso, tipo, oportunidad, texto del aviso y lo decidido; nada más.
- Las rutas de la banda están en `isInternalTraceRequest`: no dejan además un cambio genérico sin frase.
- «Se le mostró» acredita que la pantalla lo reportó con la pestaña visible, no que la persona lo leyó; lo que hizo queda aparte, con su decisión.
- Cada evento escribe también una línea en los registros de Railway (`[Avisos importantes] …` y, por pase, `[CRM] Alertas comerciales: …`). Un pase sin nada que avisar no escribe nada.
- Una traza que no se guarda nunca deshace una decisión ni frena las alertas: se anota en consola y sigue.
- Pruebas: `tests/importantNoticeTrace.test.js`; interfaz: `tests/browser/operationalTrace.mjs` (capturas `avisos-light.png` y `avisos-dark.png`) y `tests/browser/importantNotices.mjs`.

## Inmutabilidad en la base de datos (12 de octubre de 2026)

- `OperationalTraceEvent` está protegida por un trigger (`scripts/ensure-audit-immutability.js`, AGENTS.md §22): la base rechaza editar o borrar una entrada. La purga de 365 días sigue igual, pero corre en su propia transacción marcada con `SET LOCAL brainstudio.audit_purge = 'on'` (`purgeAuditRowsWithPrisma`) y la base solo le deja borrar lo vencido. Borrar a una persona sigue dejando sus entradas sin autor (`SetNull`), sin tocar nada más de la fila.
