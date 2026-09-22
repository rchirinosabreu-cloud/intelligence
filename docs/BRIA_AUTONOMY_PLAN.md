# Plan de autonomía de Bria

Documento vivo. Arranca el 20 de septiembre de 2026 sobre la [auditoría del 19 de septiembre](BRIA_AUTONOMY_AUDIT_2026-09-19.md). Se actualiza al cerrar cada ítem del backlog (sección 6). Las reglas de `AGENTS.md` y los contratos del código mandan sobre este plan.

Ruta aprobada por Rodny el 20 de septiembre: A0 → A1 → A2 → A3 → B → C → D, con una corrección suya: el sondeo de minutas cada 10 minutos no tiene sentido para una agencia con una reunión al día o menos. La sección 2 lo rediseña.

**Regla fija, decidida por Rodny el 21 de septiembre: la decisión final siempre es humana.** Bria puede preparar borradores completos (una tarea con toda su información, un mensaje, un cambio) y una persona los acepta o los rechaza. Eso vale para cualquier decisión. Nada se ejecuta solo, ni siquiera acciones internas reversibles: el techo de autonomía de todos los flujos es «preparar», y el nivel «ejecutar» queda fuera del plan hasta que él lo pida.

## 1. Lo consultado el 20 de septiembre

### Railway (leído con la CLI autenticada, `railway status --json`)

| Servicio | Réplicas | Región | Build | Healthcheck | Reinicio | Último despliegue |
|---|---|---|---|---|---|---|
| Intelligence | 1 | us-west2 | Dockerfile | ninguno | ON_FAILURE | 19-sep-2026 21:53 |
| Postgres 17 | 1 | us-west2 | imagen Railway | ninguno | ON_FAILURE | 29-ago-2026 |

Consecuencias: con una réplica, los candados en memoria del proceso solo fallan durante la ventana de solape de un despliegue, cuando el contenedor nuevo ya arrancó y el viejo aún no se detuvo. Los retrasos de arranque de los schedulers (15 a 90 segundos) reducen esa ventana pero no la cierran. Sin healthcheck, Railway cambia el tráfico al contenedor nuevo en cuanto escucha el puerto, antes de que Prisma y la IA estén listos. Existe un bucket `Postgres-PITR`, es decir, hay respaldo con recuperación a un punto en el tiempo.

Dos ajustes baratos que no son código de Bria: definir `healthcheckPath` (`/api/health` si existe, o crearlo) y revisar `drainingSeconds` en el panel del servicio.

### Fireflies (documentación oficial)

- **Webhook.** Un solo evento, `Transcription completed`, con carga `{ meetingId, eventType, clientReferenceId }` y firma HMAC-SHA256 en la cabecera `x-hub-signature`, con secreto de 16 a 32 caracteres configurado en Developer Settings. Solo dispara para reuniones cuyo dueño es la cuenta de la clave; el webhook de todo el equipo exige plan Enterprise con Super Admin. La documentación no describe reintentos.
- **Consulta `transcripts`.** Acepta `fromDate` y `toDate` en milisegundos, `limit` con máximo 50, `skip`, y filtros `organizers[]` y `participants[]`. Hoy el código solo usa `limit` y `skip = 0` ([firefliesService.js:26](../src/services/firefliesService.js:26)).
- **Campos del transcript.** `calendar_id` (id del evento de Google Calendar o iCalUID de Outlook), `cal_id`, `meeting_link`, `participants`, `dateString`, `transcript_url`. Hoy el código pide solo `id title date duration organizer_email` en la lista.

Fuentes: [webhooks](https://docs.fireflies.ai/graphql-api/webhooks), [Transcript](https://docs.fireflies.ai/schema/transcript), [consulta transcripts](https://docs.fireflies.ai/graphql-api/query/transcripts).

### Lo que Intelligence ya sabe de sus reuniones

`OperationalEvent` marca `captureWithFireflies = true` cuando `fred@fireflies.ai` está invitado ([operationalEventService.js:265](../src/services/operationalEventService.js:265)) y guarda `googleEventId`, `googleICalUID`, `meetingLink`, `startAt` y `endAt` ([schema.prisma:741](../prisma/schema.prisma:741)). Es decir, la plataforma sabe de antemano qué reuniones tendrán transcripción y cuándo terminan. Además ya recibe webhooks de Google Calendar con validación de canal y token ([operationalEventService.js:980](../src/services/operationalEventService.js:980)); el de Fireflies puede seguir el mismo patrón.

### Producción

El guardarraíl del entorno bloquea cualquier lectura contra la base productiva desde esta sesión, incluso en transacción de solo lectura. Queda listo `scripts/bria-readonly-diagnostics.mjs`: una transacción `REPEATABLE READ READ ONLY` con timeout que cuenta minutas por estado y por semana, reuniones del calendario con Fireflies por semana, retraso entre reunión y minuta, `actionItems` con responsable y fecha, señales de Observer con y sin acción humana, fuentes y fragmentos de memoria, estados de revisión de parrillas, hallazgos, criterios y contexto heredado. No escribe nada.

```bash
node scripts/bria-readonly-diagnostics.mjs --brief
```

Lo corre Rodny y pega la salida; con eso se rellena la línea base de la sección 6 y se responde con datos, no con supuestos, a la cadencia real de reuniones.

## 2. Rediseño del sondeo de minutas

### Diagnóstico

Hoy el servidor pregunta a Fireflies 144 veces al día por las 50 transcripciones más recientes ([automatedMinutesScheduler.js:3](../src/services/automatedMinutesScheduler.js:3), [minuteAutomationService.js:352](../src/services/minuteAutomationService.js:352)). La IA solo corre para transcripciones nuevas, así que el coste de IA no es el problema. Los problemas son otros:

- Ruido: 144 llamadas para encontrar, en el mejor caso, una reunión.
- Ceguera: la ventana de 50 sin cursor pierde reuniones tras una parada larga y no sabe que perdió nada.
- Sin relación con la agenda: la plataforma sabe cuándo termina cada reunión con Fireflies y no usa ese dato.
- Nadie se entera cuando una reunión que debía grabarse no produjo transcripción. Ese es el aviso que sí vale.

**Corrección del 22 de septiembre.** La medición de «39 minutos de mediana» era desde el **inicio** de la reunión (`meetingAt` es la hora de inicio), así que incluía la propia reunión y no medía a Fireflies. Rodny confirmó que la transcripción tarda unos cinco minutos. El retraso real tras terminar una reunión era de cinco a quince minutos, y **hasta diez de ellos eran nuestro sondeo**: la espera propia era casi la mitad del total, no una parte menor. El diagnóstico añade `lag_after_meeting_ends_since_live`, que suma la duración antes de comparar, para medirlo bien. Lo que el rediseño no cambia es el tiempo de transcripción, que es de Fireflies.

### Diseño en tres capas

1. **Evento primero: webhook de Fireflies.** `POST /api/minutes/fireflies/webhook`, firma HMAC verificada con `FIREFLIES_WEBHOOK_SECRET`, responde 202 y encola el procesamiento de ese `meetingId`. Activo solo si el secreto está configurado. Cubre las reuniones cuyo dueño es la cuenta de la clave; la salida `minutes_organizers` del diagnóstico dirá si eso es todo el equipo o no.
2. **El calendario como reloj.** El equipo decide qué reuniones se graban invitando al bot, desde la plataforma o a mano en Google Calendar. Al terminar un `OperationalEvent` con el bot invitado, programar una comprobación a `endAt + 20 min` con reintentos a 45 min, 90 min, 3 h, 6 h y 24 h. Si a las 24 horas no hay transcripción, aviso «Reunión grabada sin minuta» a quien la organizó. Detalle técnico: la plataforma solo tiene registrada la invitación al bot en 3 de las 20 reuniones grabadas en 12 semanas, así que la sincronización de calendario no está viendo esa invitación en la mayoría de los casos; A1-3 debe corregir eso y, además, marcar el evento cuando el `calendar_id` de la transcripción coincida. Cada comprobación consulta `transcripts(fromDate, toDate)` acotado a la ventana de la reunión y empareja por `calendar_id` contra `googleEventId` o `googleICalUID`, después por `meeting_link`, y por último por título y hora. Si a las 24 horas no hay transcripción, señal de Observer «Reunión sin transcripción» con el evento, sus asistentes y el enlace: el bot no entró, la grabación no se compartió o la reunión no ocurrió.
3. **Barrido de seguridad.** Dos veces al día, a las 07:00 y 19:00 de Bogotá, `transcripts` con `fromDate` igual al último barrido correcto menos 48 horas, paginando con `skip` hasta agotar. Cubre reuniones fuera del calendario, subidas manuales y webhooks perdidos. El botón «Sincronizar ahora» se conserva.

Cadencias resultantes:

| Flujo | Hoy | Propuesta |
|---|---|---|
| Sondeo Fireflies | cada 10 min, 50 últimas | webhook + comprobación por reunión + barrido 2 veces al día |
| Llamadas a Fireflies por día | 144 | entre 2 y 10 |
| Índice de memoria | cada 10 min, 500 filas | en cadena al quedar READY la minuta, barrido cada 6 h |
| Observer, señales de minutas | cada 10 min, 500 minutas | en cadena tras indexar, barrido cada 6 h |
| Observer, analítica de tareas | cada 10 min | cada hora (solo base de datos) |
| Clasificación de tareas | cada hora, sin candado | cada hora, con candado |
| Revisión de parrillas | cada minuto, 45 s de espera | sin cambio: ahí sí hay actividad continua |

La capa 1 y el barrido caben en A0. La capa 2 necesita programar trabajos diferidos, así que entra con el runtime de A1.

## 3. Cómo trabajamos

- **Un PR por ítem del backlog**, rama `feat/bria-…` o `fix/bria-…`, con el ID del ítem en el título. Claude abre el PR, lee CI y fusiona cuando Rodny lo indique; Rodny frena solo ante borrados o cambios irreversibles en producción.
- **TDD obligatorio** (`AGENTS.md` §6): prueba primero, en rojo, luego código. Backend con `node --test`; lo que toque base de datos corre contra el clúster local `127.0.0.1:55439` (`brainstudio_test`), nunca contra `.env`. Todo parseo de IA incluye el caso con fences markdown.
- **Los ítems de fiabilidad se prueban como parrillas**: dos trabajadores compitiendo, caída a medias, reinicio, edición durante el análisis, versión superada. La referencia es [briaReviewJobsDatabase.test.js](../tests/briaReviewJobsDatabase.test.js).
- **Todo comportamiento nuevo nace apagado** detrás de una variable de entorno, como hizo la retención de adjuntos. Se enciende en Railway cuando el diagnóstico confirma que la versión anterior sigue sana.
- **Definición de hecho:** pruebas verdes, CI verde, documento del módulo actualizado, regla nueva en `AGENTS.md` si introduce un invariante, captura de pantalla si toca interfaz, fila de la sección 6 actualizada.
- **Puertas entre bloques:** no se empieza B sin la puerta de A1 y A2. Las puertas están en la sección 6 de la auditoría.
- **Revisión semanal:** Rodny corre el diagnóstico, se comparan cifras con la semana anterior y se decide qué sigue. Las metas se fijan tras dos semanas de línea base, no antes. Tres cifras se miran siempre: reuniones grabadas sin minuta, utilidad de hallazgos (corregidos y verificados frente a abiertos más de 14 días frente a descartados) y coste por flujo.
- **Reparto:** Claude construye, prueba, documenta y abre PR. Rodny decide, configura secretos en Railway y Fireflies, fusiona, corre el diagnóstico y valida con el equipo.

## 4. Backlog

Tamaños en días de trabajo enfocado, estimados. Los ítems de un mismo bloque marcados con ∥ son independientes y pueden ir en paralelo.

### A0. Arreglos que no esperan

| ID | Qué | Dónde | Prueba clave | Tamaño |
|---|---|---|---|---|
| A0-1 ∥ | Observer: `RESOLVED` no vuelve a `OPEN` sin `evidenceVersion` distinta; `resolveMissing` solo sobre el alcance leído completo; `ARCHIVED` en `VALID_STATUSES`. **Hecho el 21-sep**, ver `docs/BRIA_OBSERVER_SIGNALS.md`; también se protegen los descartes | `briaObserverService.js` | una señal resuelta releída sigue resuelta; cambia solo con evidencia nueva | 0,5 |
| A0-2 ∥ | Observer: cita literal obligatoria; sin cita → `UNVERIFIED`, fuera de la lista activa y contada aparte; sin relleno con el resumen. **Hecho el 21-sep** | `briaObserverService.js`, `BriaObserverInbox.jsx` | señal cuya evidencia no está en la transcripción no llega como accionable | 0,5 |
| A0-3 ∥ | Fireflies: timeout de 30 s con `AbortController`; `fromDate`/`toDate`; paginación con `skip`; campos `calendar_id`, `meeting_link`, `participants` | `firefliesService.js` | petición colgada se corta; ventana de 3 días trae más de 50 sin perder ninguna | 0,5 |
| A0-4 ∥ | Minutas: barredor de `PROCESSING` con más de 15 min; `usage` (tokens, latencia, modelo) y `errorCode` guardados; `READY` sin títulos editoriales no se reanaliza entero | `minuteAutomationService.js:237`, `:257`, `:298`; `openAIClient.js:229`; script `ensure-meeting-minutes-schema.js` | caída a medias se recupera en el siguiente ciclo sin doble análisis | 1 |
| A0-5 ∥ | Memoria: búsqueda del panel con `clientId` obligatorio o `scope=ALL` solo ADMIN y registrada; quitar las dos lecturas muertas de `minute.clientId`; «Fuentes pendientes» sin Drive | `briaMemoryController.js:20`, `briaMemoryService.js:94`, `:256`; `briaObserverService.js:59` | responsable sin ADMIN no puede buscar sin cliente | 0,5 |
| A0-6 ∥ | Parrillas: persistir `calls[]` (tokens, latencia, modelo, rechazos) en `ContentPlanReview.usage` | `briaContentPlanReviewGenerator.js:60`, `briaContentPlanReviewService.js:325` | la revisión guardada trae coste | 0,5 |
| A0-7 ∥ | Candado compartido: `withAdvisoryLock(key, fn)` reutilizando el patrón de calendario, aplicado a Fireflies, memoria, Observer y clasificación | `calendarSyncLock.js:33` como plantilla; los cuatro schedulers | dos procesos, una sola ejecución | 0,5 |
| A0-8 | Cadencias: sondeo de Fireflies a 2 barridos diarios con cursor persistido; memoria y Observer de minutas a 6 h; analítica de tareas a 1 h; cadena minuta READY → indexar → detectar esa minuta | los tres schedulers, `minuteAutomationService.js:325` | una minuta nueva queda indexada y con señales sin esperar al barrido | 1 |
| A0-9 | Webhook de Fireflies con HMAC y `FIREFLIES_WEBHOOK_SECRET`; 202 y encolado; rechazo de firma inválida; idempotente por `meetingId`. **Hecho el 22-sep**, ver `docs/FIREFLIES_WEBHOOK.md`; el sondeo de 10 min se conserva como red de seguridad hasta ver avisos reales en producción | ruta pública en `routes/index.js`, `firefliesWebhookService.js` | firma mala → 401 sin efecto; misma llamada dos veces → un solo procesamiento | 1 |
| A0-10 ∥ | Parrillas: reintento dirigido de las tres revisiones `FAILED` con causa técnica guardada por intento (`errorCode`, no solo el mensaje humano); las finalizadas con `PENDING` pasan a un estado honesto | `briaContentPlanReviewState.js:42`, `briaContentPlanReviewScheduler.js:54` | una revisión agotada muestra causa y se puede relanzar desde la interfaz | 1 |
| A0-11 ∥ | Parrillas: un lote que el modelo no confirma se parte en dos mitades y se revisa completo en vez de fallar toda la revisión; el intento descartado sigue contando en el coste; el intento manual responde con un mensaje legible y el panel nunca muestra códigos crudos | `briaReviewBatches.js`, `briaContentPlanReviewGenerator.js`, `routes/api/content.js`, panel | una parrilla grande con un lote rebelde se revisa entera sin puntaje parcial; «Revisar nuevamente» explica el resultado | 1 |

| A0-12 ∥ | Verificación acotada por ejecución (`VERIFICATION_BUDGET`, rotación por `lastVerifiedAt`) y caídas del proveedor que no gastan reintentos en revisiones ni en minutas (`isProviderUnavailable`, estado `PENDING_PROVIDER`). **Hecho el 21-sep**, ver `docs/BRIA_PHASE_1_REVIEW_RELIABILITY.md` | `briaContentPlanReviewService.js`, `briaContentPlanReviewState.js`, `minuteAutomationService.js`, `lib/aiAvailability.js` | una parrilla con 157 abiertos publica dentro del plazo; una reunión grabada durante una caída no se pierde | 1 |

| A0-13 ∥ | Rescate de minutas detenidas por una caída del proveedor (`errorCode`, `isProviderStalledMinute`, `scripts/recover-provider-stalled-minutes.js`) y **cita literal exigida** en el análisis de minutas, para que las señales de Observer vuelvan a ser comprobables. **Hecho el 21-sep**, ver `docs/BRIA_OBSERVER_SIGNALS.md` | `minuteAutomationService.js`, `briaObserverService.js`, script nuevo | la grabación perdida vuelve a la cola; una minuta con transcripción vacía no resucita | 1 |

Orden dentro de A0 tras la línea base del 20 de septiembre: primero A0-6 (parrillas es el ciclo que más gasta: unas 19 revisiones al día y 1.258 hallazgos abiertos, sin una sola cifra de coste), después A0-1 y A0-2, luego el resto.

Puerta A0: ninguna señal atendida reaparece por relectura; un fallo de minuta aparece con causa; el coste por minuta y por revisión existe en la base; Fireflies recibe menos de 10 llamadas al día.

### A1. Runtime de trabajo durable

| ID | Qué | Dónde | Prueba clave | Tamaño |
|---|---|---|---|---|
| A1-1 | Modelo `AutomationRun` (flujo, sujeto, clave de idempotencia única, `PENDING/RUNNING/COMPLETED/FAILED/SUPERSEDED`, `leaseToken`, `leaseExpiresAt`, `attempts`, `nextAttemptAt`, `runAfter`, `checkpoint`, `errorCode`, `lastError`, `usage`, `triggeredBy`) con script `ensure-automation-runtime-schema.js`; módulo `automationRuntime.js` con `enqueueRun`, `claimRun`, `checkpoint`, `completeRun`, `failRun` con backoff, `withDeadline`, `createScheduler` | nuevo | los 24 casos de parrillas, replicados sobre el runtime contra PostgreSQL real | 3 |
| A1-2 | Minutas sobre el runtime: un run por transcripción, el barrido como run, el webhook encola | `minuteAutomationService.js` | reinicio a medias no duplica análisis ni objetos en el bucket | 1,5 |
| A1-3 | Comprobación por reunión del calendario (`runAfter = endAt + 20 min`, reintentos 45m/90m/3h/6h/24h, emparejamiento por `calendar_id`, `meeting_link`, título y hora) y señal «Reunión sin transcripción» | nuevo servicio + `operationalEventService.js` | reunión terminada sin transcripción a las 24 h produce una señal con evidencia | 1,5 |
| A1-4 | Memoria y Observer sobre el runtime, con la cadena por minuta | los dos servicios | fallo de embedding queda como run FAILED visible, no como éxito silencioso | 1 |
| A1-5 | Salud operativa, pestaña «Automatizaciones»: última ejecución, fallos con causa, atascados, coste por flujo, tendencia de 7 días. **Pedido explícito de Rodny el 21 de septiembre**: «quiero que haya un lugar en la plataforma donde pueda ver esos informes y esas cosas, de todo lo que haga». Los datos ya se están guardando (recibo por revisión, causa por intento, estado de los trabajos); esto es la vista, no la recolección | `operationalHealthService.js`, componente de `/salud-operativa` | pantalla con datos reales y captura | 1,5 |

Puerta A1: dos procesos no ejecutan el mismo trabajo; una caída a medias se recupera sin duplicar efectos; los fallos se ven en Salud operativa.

### A2. Contexto autorizado

| ID | Qué | Dónde | Prueba clave | Tamaño |
|---|---|---|---|---|
| A2-1 | `MeetingMinute`: `clientId`, `clientIds`, `purpose` (`CLIENT_EDITORIAL / CLIENT_OPERATIONAL / INTERNAL / FINANCIAL / PEOPLE / PERSONAL`), `sensitivity` (`NORMAL / RESTRICTED`), `classificationStatus` (`PROPOSED / CONFIRMED`); `BriaMemorySource` hereda propósito y sensibilidad; script de backfill en simulación por defecto | `schema.prisma:146`, `:1106`; nuevo `ensure-*` | el backfill no reanaliza ni toca minutas confirmadas | 1,5 |
| A2-2 | Clasificación propuesta en el análisis (participantes, dominios de correo contra contactos de `Client`, roster, menciones) y confirmación en Minutas para casos ambiguos; permiso `minutas`, valida PM o admin | `minuteAutomationService.js`, `AutomaticMinutesPanel.jsx` | reunión multicliente queda `PROPOSED` hasta confirmar; una mención incidental solo sugiere | 2 |
| A2-3 | Política de indexación: `INTERNAL/FINANCIAL/PEOPLE/PERSONAL` sin transcripción, `RESTRICTED` sin nada; búsqueda filtra por propósito; la revisión de parrillas deja de admitir fuentes sin ámbito por coincidencia de nombre | `briaMemoryService.js:77`, `:266`; `briaContentPlanReviewService.js:91` | homónimos, multicliente, usuario sin permiso y mención incidental: cero exposición cruzada | 1,5 |
| A2-4 | El chat de Bria consulta esta memoria con ámbito de cliente; rutas de `AgencyContext` detrás de flag y marcadas heredadas | `chatController.js:3`, `brainCoreService.js` | misma pregunta, misma evidencia en chat y en revisión | 1 |

Puerta A2: una reunión de personas nunca entra en contexto editorial; ninguna fuente sin cliente confirmado entra en una revisión.

### A3. Actor, niveles y libro de acciones

| ID | Qué | Dónde | Prueba clave | Tamaño |
|---|---|---|---|---|
| A3-1 | `AutomationAction` (flujo, tipo, sujeto, nivel, `authorizedBy`, resultado, reversible, carga) y `AutomationPolicy` (flujo, nivel 0 observar o 1 preparar, ámbito opcional por cliente, historial); los niveles 2 y 3 no existen como opción configurable, por la regla de decisión humana; lista de solo lectura en Salud operativa | nuevo | ninguna acción se ejecuta sin la aceptación de una persona; toda propuesta y toda aceptación tienen fila con autorizador | 2 |

### B. Coordinación de compromisos

| ID | Qué | Dónde | Prueba clave | Tamaño |
|---|---|---|---|---|
| B-1 | `MeetingCommitment` según la sección 7 de la auditoría, más `ownerKind` (`TEAM / CLIENT / EXTERNAL`) para distinguir insumos que debe el cliente; extracción v2 con cita literal, responsable y cliente sugeridos con confianza; sin cita → `CANDIDATE UNVERIFIED` | nuevo modelo y `ensure-*`; `minuteAutomationService.js` | compromiso con cita inventada nunca se propone; JSON con fences se parsea | 3 |
| B-2 | Búsqueda de tarea existente (mismo cliente, no `REALIZADA`, ±30 días, similitud de título con FTS en español); tarjetas en Minutas con «Vincular», «Crear tarea», «No es compromiso» con motivo; idempotencia por `fingerprint`; fila en el libro por cada decisión | `AutomaticMinutesPanel.jsx:217`, nuevas rutas, `nativeTaskService.js` | doble clic no duplica; vincular no crea; la tarea creada lleva el `creatorId` del humano | 4 |
| B-3 | Seguimiento diario sobre el runtime: `TASK_DONE` con `REALIZADA` y `completedAt`; `OVERDUE` con señal `COMMITMENT:<id>:OVERDUE` y `evidenceVersion` por tramo; escalado a PM solo con vencimiento y sin sesión de trabajo en N días; `ownerKind = CLIENT` avisa al PM como insumo pendiente. Los avisos llegan por notificación al responsable y al PM, no solo a la bandeja de Observer, que nadie ha tocado desde que existe | nuevo servicio | señal atendida no reaparece hasta el siguiente tramo | 2 |
| B-4 | Medición del piloto: precisión, omisiones, duplicados evitados, tiempos y coste por compromiso aceptado, por cliente; procedimiento de revisión semanal | Salud operativa o Minutas | cifras reproducibles con el diagnóstico | 2 |

Piloto: reuniones nuevas desde la fecha de corte, dos o tres clientes, 20 a 30 compromisos, nivel 1. Los `actionItems` históricos no se convierten en tareas.

La cobertura no es un problema: el equipo elige qué grabar. Lo que sí hace falta antes de B es el aviso de A1-3, para que una reunión grabada que no produjo minuta no pase en silencio.

### C. Foco diario

| ID | Qué | Tamaño |
|---|---|---|
| C-1 | `Notification.dedupeKey` única y ventana de agrupación; aplazamiento persistido | 1,5 |
| C-2 | Panel «Foco de hoy» en el dashboard: compromisos que vencen o vencieron, insumos del cliente pendientes, tareas devueltas, señales de mis clientes, agrupados por causa | 3 |
| C-3 | Escalado a PM con evidencia y acción preparada, respetando aplazamientos | 1,5 |

### Pendiente inmediato: hallazgos duplicados entre dimensiones

Observado el 21 de septiembre en una parrilla de 18 piezas con 157 hallazgos abiertos: el mismo problema (usar fragmentos de una película comercial sin derechos) aparece cuatro veces, una por cada dimensión evaluada, con títulos distintos. Nueve hallazgos por pieza no son nueve problemas, y el equipo no los lee: en toda la historia de la plataforma solo se han descartado 26.

Dos cambios posibles, ambos en la generación y no en la verificación:

1. Instruir en el prompt que cada problema se reporte **una sola vez**, bajo la dimensión más pertinente, y que no se repita como hallazgo de otra dimensión.
2. Un techo por pieza en cada revisión, además del techo por lote que ya existe.

Los dos alteran el juicio editorial, así que según `AGENTS.md` §7 exigen **evaluación comparativa antes de promoverlos**, con el arnés `scripts/eval-bria-reviews.js` y casos aprobados por el equipo. No hacerlo a ciegas: primero medir cuántos hallazgos se pierden y si alguno era real. Requiere presupuesto de IA disponible.

## 5. Ideas para llevarlo a otro nivel

Todas reutilizan runtime, contexto, política y libro. Ninguna se monta antes de que B demuestre utilidad medida.

- **Insumos del cliente.** Un compromiso con `ownerKind = CLIENT` es un insumo que la agencia espera. Bria lo sigue y prepara el recordatorio para que el PM lo envíe. Buena parte de los retrasos nace ahí.
- **Reunión sin transcripción.** Ya viene en A1-3: la señal que hoy nadie recibe.
- **Tarjeta después de cada reunión.** En el dashboard de cada asistente: tres compromisos, dos decisiones, un botón para confirmar. Es la interfaz natural de B-2.
- **Bria pregunta en vez de adivinar.** Ante responsable o cliente ambiguo, prepara la pregunta para el PM en lugar de asignar. Nivel 1, sin envíos automáticos.
- **Pulso de cliente.** Resumen semanal por cuenta (compromisos, hallazgos abiertos, devoluciones, última reunión) y señal «cliente sin reunión ni entrega en 30 días».
- **Fábrica de reportes.** Trabajo mensual que recolecta evidencia, crea el `MetricReport` borrador y lista lo que falta; hoy la ingesta es síncrona ([reports.js:239](../src/routes/api/reports.js:239)).
- **Aprendizaje editorial continuo.** Barrido de descubrimiento tras cada `DEVUELTO`, con cola y presupuesto; minutas de propósito editorial como fuente de propuestas, nunca de reglas.
- **Calendario de contenido.** Pieza sin aprobación a N días de su fecha → señal con dueño.
- **Comercial.** Seguimientos del CRM vencidos en el foco diario; borrador de mensaje para aprobar.
- **Financiero.** Solo análisis y propuesta: cartera vencida, cobros sin aplicar. Nunca movimientos.

## 6. Estado

| Bloque | Ítems | Hechos | En curso | Puerta |
|---|---|---|---|---|
| A0 | 13 | 7 (A0-6 #919, A0-10 #920, A0-11 #921, A0-1 y A0-2 #929, A0-12 #935, 21-sep) | A0-13 | pendiente |
| A1 | 5 | 0 | — | pendiente |
| A2 | 4 | 0 | — | pendiente |
| A3 | 1 | 0 | — | pendiente |
| B | 4 | 0 | — | pendiente |
| C | 3 | 0 | — | pendiente |

### Línea base productiva del 20 de septiembre de 2026

Salida de `scripts/bria-readonly-diagnostics.mjs` corrida por Rodny a las 20:56 UTC contra `hopper.proxy.rlwy.net`. Entre paréntesis, el valor del 14 de septiembre cuando existe.

| Área | Cifra | Lectura |
|---|---|---|
| Reuniones | 20 minutas en las últimas 12 semanas; entre 1 y 5 por semana, mediana 2 | Unas 1,7 reuniones por semana. Con 144 sondeos diarios salen cerca de 590 llamadas a Fireflies por reunión encontrada. La cadencia de 10 minutos queda descartada con datos |
| Horario | Lunes a viernes, 08:00 a 17:00 Bogotá (corregida la zona horaria del script) | Barridos a las 07:00 y 19:00 Bogotá cubren el día completo |
| Organizador | 48 de 50 minutas con `coordinadorbrainstudio@gmail.com`; 2 con otra cuenta | El webhook de Fireflies cubriría el 96 % si la clave es de esa cuenta; el barrido cubre el resto |
| Calendario | 146 eventos con enlace en 12 semanas; 20 grabadas con Fireflies; ninguna grabada desde el 11-sep | Normal: el equipo decide qué reuniones se graban invitando al bot. No es un hueco de cobertura. Lo que sí falla es que la plataforma solo registra la invitación al bot en 3 de esas 20; A1-3 lo corrige |
| Retraso reunión → minuta | 57 min de mediana, 76 máximo, en las 2 minutas desde el 1-sep | Casi todo es Fireflies transcribiendo. El sondeo cada 10 minutos no es lo que retrasa |
| Minutas | 49 READY (49), 1 FAILED por `FIREFLIES_TRANSCRIPT_EMPTY` desde marzo, 3 en papelera; última minuta del 11-sep; 3 de 49 con los dos PDF | Sin cambios en seis días; el fallo no tiene salida ni aviso |
| Compromisos | 530 `actionItems` (530); mediana 10 por minuta, máximo 25; 506 con responsable (95 %), 87 con fecha (16 %) | El responsable casi siempre viene; la fecha casi nunca. B-1 debe tratar la fecha como propuesta |
| Observer | 8 OPEN (8), 284 archivadas, 2 resueltas automáticas; **cero acciones humanas en todas** | La bandeja no se usa. Ninguna señal nueva debe depender de ella sola |
| Memoria | 49 fuentes READY, las 49 sin cliente (49); 1.176 fragmentos (1.176), 0 sin embedding; 981 fragmentos son transcripción cruda (83 %); ~654.000 tokens estimados | La política de indexación por propósito (A2-3) afecta a cinco de cada seis fragmentos |
| Parrillas | 309 revisiones completadas en 30 días: 286 automáticas (181) y 23 manuales (11); unas 19 al día desde el 14-sep | Es el ciclo con más actividad y más gasto, y no hay una sola cifra de coste. A0-6 pasa a ser lo primero |
| Hallazgos | 1.258 OPEN (717), 1.012 RESOLVED con 629 verificados (321), 26 DISMISSED en total; 7,9 hallazgos por revisión, máximo 24 | Los abiertos crecen unos 90 al día y casi nadie descarta. Bria produce más de lo que el equipo procesa y no sabemos si lo que produce sirve |
| Dónde están los abiertos | 989 en 25 parrillas en planificación (unas 40 por parrilla), 177 en 6 parrillas finalizadas, 92 en 1 activa | Los 177 de parrillas finalizadas son peso muerto: A0-10 los pasa a `STALE`. Los 40 por parrilla activa piden medir utilidad antes de dar más autonomía en parrillas |
| Estados de parrilla | 23 CURRENT, 45 IDLE, 10 PENDING, 3 FAILED (3), 1 STALE | Las tres FAILED son las mismas del 14-sep, sin reintento en seis días |
| Criterios | 0 criterios (0); 1 descubrimiento FAILED | La memoria editorial sigue sin uso |
| Contexto heredado | 1 `AgencyContext` APPROVED sin vector | Retirar con A2-4 |
| Equipo y trabajo | 69 clientes; 126 tareas pendientes, 4.469 realizadas; 270 notificaciones en 7 días para 14 personas | Unas 3 notificaciones por persona y día; el foco diario (C) no debe sumar ruido encima |

Pendiente de la siguiente corrida: `findings_open_by_age` (cuántos abiertos llevan más de 30 días sin que nadie los toque). Las consultas de calendario por tipo y organizador sirven para entender por qué la invitación al bot no queda registrada en la plataforma.

## 7. Decisiones pendientes de Rodny

1. **Transcripciones.** Recomendación: indexar transcripción solo de reuniones de cliente; de personas, financieras o personales, nada.
2. **Búsqueda global de memoria.** Recomendación: solo ADMIN, con ámbito explícito y consulta registrada.
3. **Tiempo reservado** para A0 y A1 frente a los demás módulos.
4. **Piloto de compromisos:** qué dos o tres clientes y qué fecha de corte.
5. **Cumplimiento:** qué compromisos se cierran con la tarea y cuáles exigen evidencia.
6. **Fireflies:** configurar el webhook y su secreto en Developer Settings cuando A0-9 esté desplegado, y confirmar con `minutes_organizers` si todas las reuniones pertenecen a esa cuenta.
7. **Railway:** definir healthcheck y drenado del servicio.

Aclarado el 20 de septiembre: Fireflies entra solo a las reuniones a las que el equipo lo invita, desde la plataforma o a mano en el calendario; las demás reuniones del calendario no se graban a propósito. La expectativa de Rodny es que cada reunión grabada tenga resumen, análisis y transcripción en cuanto Fireflies termine.

Resueltas el 20 de septiembre: réplicas (una) y cadencia de minutas (sección 2).
