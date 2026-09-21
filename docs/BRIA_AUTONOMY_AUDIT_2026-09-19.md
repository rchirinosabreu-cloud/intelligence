# Bria: auditoría de autonomía y plan del sistema nervioso operativo

Auditoría del 19 de septiembre de 2026 sobre el checkout local `ff6e1ec` (rama `main`, árbol limpio salvo `.claude/` y el documento de contexto). Cinco lecturas paralelas del código (minutas, memoria, Observer, parrillas y capa de automatizaciones), contrastadas con la auditoría del 14 de septiembre y con el historial de Git. No se consultó producción ni se ejecutaron modelos; los recuentos productivos que aparecen son los del 14 de septiembre y se indican como tales. El anexo trae SQL de solo lectura para refrescarlos.

Este documento no autoriza cambios ni constituye un despliegue. Es una fotografía y una propuesta de ruta.

## 0. Dictamen en una página

**La narrativa es correcta.** Intelligence ya tiene automatización real: escucha reuniones, construye memoria, detecta señales y revisa parrillas sin que nadie lo pida. La revisión de parrillas es un ciclo de inteligencia completo y bien construido. Eso no es una demostración.

**La narrativa también es correcta en lo que falta, y en cinco días no se movió nada.** Desde la auditoría del 14 de septiembre se fusionaron 25 pull requests (CRM, financiero, dashboard, catálogo, chat, retención de adjuntos). Ninguno tocó `briaObserverService.js`, `minuteAutomationService.js`, `briaMemoryService.js`, `firefliesService.js`, `brainCoreService.js` ni `chatController.js`. Los seis hallazgos P1 de esa auditoría siguen abiertos línea por línea. No es un reproche: es el dato que explica por qué la autonomía no avanza. Nadie la está construyendo.

**Hoy aparecen riesgos nuevos que van más allá de la "fragmentación":**

- La búsqueda de memoria del panel de Manager no filtra por cliente. Cualquier responsable con ese permiso busca en todas las transcripciones de todos los clientes ([briaMemoryController.js:20](../src/controllers/briaMemoryController.js:20)).
- La transcripción completa se indexa palabra por palabra sin ningún filtro de sensibilidad. Una reunión de salarios o de desempeño capturada por Fireflies queda embebida y recuperable. La regla de `AGENTS.md` que lo prohíbe existe solo como texto ([briaMemoryService.js:77](../src/services/briaMemoryService.js:77)).
- `minute.clientId` se lee en dos sitios, pero `MeetingMinute` no tiene esa columna. Siempre vale `null` ([briaMemoryService.js:94](../src/services/briaMemoryService.js:94), [briaObserverService.js:59](../src/services/briaObserverService.js:59)).
- Siete trabajos periódicos solo tienen un candado en memoria del proceso. Con dos réplicas o durante un despliegue solapado de Railway se ejecutan dos veces y pagan dos veces la IA.
- No existe ningún actor "Bria" ni política que consultar antes de actuar, ni registro de acciones automáticas. El historial operativo excluye a propósito lo que no tiene actor humano.
- El coste real de los ciclos es desconocido: minutas descarta el `usage` del proveedor y parrillas lo recoge y luego no lo guarda.

**Qué hacer.** No añadir otro flujo todavía. Construir cuatro órganos compartidos (trabajo durable, contexto autorizado, actor y política, medición), en ese orden, y después montar el primer producto nuevo: coordinación de compromisos, en modo borrador, con pocos clientes y reuniones nuevas. Tiempo estimado hasta tener el piloto en marcha: entre cinco y siete semanas de trabajo enfocado. Es una estimación, no un compromiso.

## 1. Qué cambió desde el 14 de septiembre

| Área | Commits desde el 14-sep que la tocan | Estado de los hallazgos de esa auditoría |
|---|---|---|
| Observer | Ninguno (último: 1-sep) | P1-03 abierto tal cual |
| Minutas / Fireflies | Ninguno (último: 6-sep) | P1-04, P1-06, P2-01, P2-05 abiertos |
| Memoria de Bria | Ninguno en el servicio; el 19-sep se movió el bucket de almacenamiento (`9d80fda`) | P1-01, P1-02, P1-05 abiertos |
| Parrillas | Ninguno | Sigue siendo el patrón de referencia; P2-02 y P2-04 abiertos |
| Esquema Prisma | Solo CRM, financiero y retención de adjuntos | Sin modelo de compromiso, sin `clientId` en minutas, sin tabla de trabajos |

Comando usado: `git log --since=2026-09-05 -- <archivos de Bria>`.

## 2. El algoritmo de Brain contra el código

El ciclo que describe la narrativa es: observar → comprender el contexto → detectar → decidir según reglas y permisos → actuar o preparar → comprobar → aprender o escalar. Esto es lo que existe para cada paso.

| Paso | Existe | Dónde | Lo que falta |
|---|---|---|---|
| Observar | Sí | Sondeo de Fireflies cada 10 min ([automatedMinutesScheduler.js:25](../src/services/automatedMinutesScheduler.js:25)); cambios de parrilla encolan revisión ([contentService.js:343](../src/services/contentService.js:343)); analítica de tareas | Sin webhook; sin cursor de paginación (solo las 50 transcripciones más recientes, [minuteAutomationService.js:352](../src/services/minuteAutomationService.js:352)); sin timeout HTTP en Fireflies |
| Comprender el contexto | Parcial | Memoria semántica con pgvector ([briaMemoryService.js:266](../src/services/briaMemoryService.js:266)) | Sin cliente, propósito ni sensibilidad en las fuentes; sin vigencia ni sustitución de decisiones; el chat de Bria no usa esta memoria ([chatController.js:3](../src/controllers/chatController.js:3)) |
| Detectar | Sí | Señales de Observer ([briaObserverService.js:166](../src/services/briaObserverService.js:166)); hallazgos de parrillas | Una señal resuelta vuelve a abrirse al releer la misma minuta ([briaObserverService.js:138](../src/services/briaObserverService.js:138)); evidencia rellenada con el resumen cuando el modelo no cita ([:51](../src/services/briaObserverService.js:51)) |
| Decidir según reglas y permisos | No | Solo middleware HTTP sobre `req.user` ([authMiddleware.js:176](../src/middlewares/authMiddleware.js:176)) | No hay función "¿puede Bria hacer X por Y?", ni niveles de autonomía por flujo, ni actor de sistema |
| Actuar o preparar | Solo en parrillas | Hallazgos con recomendación | Bria nunca crea tareas ni prepara borradores; los dos únicos `task.create` son humanos ([nativeTaskService.js:257](../src/services/nativeTaskService.js:257), [:873](../src/services/nativeTaskService.js:873)) |
| Comprobar | Solo en parrillas | Verificación explícita contra la versión actual ([briaFindingVerification.js:45](../src/services/briaFindingVerification.js:45)) | Nada comprueba si un compromiso se cumplió |
| Aprender o escalar | Parcial | Propuestas de criterios con aprobación humana ([briaClientCriterionService.js:37](../src/services/briaClientCriterionService.js:37)) | El descubrimiento es bajo demanda; no hay escalado estructurado a PM; no se mide precisión ni falsos positivos |

Conclusión: la plataforma tiene sentidos y algo de memoria. No tiene todavía sistema nervioso: ni decisión por política, ni acción preparada, ni comprobación fuera de parrillas.

## 3. Mapa por pieza: cuánto de esto es sólido

| Pieza | Candado entre réplicas | Reintentos | Recuperación tras caída | Métricas persistidas | Pruebas de fiabilidad |
|---|---|---|---|---|---|
| Revisión de parrillas | Sí, lease con CAS en `ContentPlan` ([briaContentPlanReviewState.js:26](../src/services/briaContentPlanReviewState.js:26)) | 3 con backoff exponencial | Sí: checkpoint por lote y reclamo de RUNNING vencido | No: `usage` y latencia se recogen y se descartan ([briaContentPlanReviewGenerator.js:60](../src/services/briaContentPlanReviewGenerator.js:60)) | 24 casos contra PostgreSQL real ([briaReviewJobsDatabase.test.js](../tests/briaReviewJobsDatabase.test.js)) |
| Minutas | No, solo `running` en proceso ([automatedMinutesScheduler.js:12](../src/services/automatedMinutesScheduler.js:12)) | 3 sin backoff, en el siguiente tick | No: `PROCESSING` sin vencimiento ni barredor; objetos huérfanos en el bucket si cae entre subida y escritura | No: `payload.usage` se descarta ([openAIClient.js:229](../src/services/openAIClient.js:229)) | Un solo proceso; sin prueba de caída a medias |
| Memoria | No | Ninguno en `embed` | Parcial: `INDEXING` huérfano invisible en el panel | No | SQL de búsqueda sin cobertura |
| Observer | No | n/a | n/a | Solo `lastScannedAt` | 7 casos; ninguno cubre la reapertura |
| Clasificación de tareas | Ninguno, ni siquiera en proceso ([taskClassificationService.js:75](../src/services/taskClassificationService.js:75)) | n/a | n/a | No | Solo la función pura |
| Calendario, retención, chat | Sí, advisory locks | Sí | Sí | Parcial | Sí |

Trabajos seguros bajo réplicas: parrillas, calendario, retención de adjuntos, mantenimiento de chat. Inseguros: Fireflies, memoria, Observer, clasificación, racha de calidad, renovación de canales de Google y poda de trazas. El número de réplicas no está fijado en el repositorio (solo `Dockerfile` con `npm start`); se decide en el panel de Railway.

## 4. Hallazgos

### 4.1 Confirmados del 14 de septiembre, sin cambios

P1-01 cliente y propósito no garantizados en memoria. P1-02 rutas de conocimiento con controles distintos. P1-03 Observer reabre lo resuelto. P1-04 minutas y memoria sin la robustez de parrillas. P1-05 una fuente nueva no invalida resultados. P1-06 JSON válido no es conocimiento validado. Las ubicaciones citadas allí siguen vigentes; el código no cambió.

### 4.2 Nuevos hoy

**N-01. Búsqueda global de transcripciones sin ámbito de cliente.** [briaMemoryController.js:20](../src/controllers/briaMemoryController.js:20) llama a `search({ query, limit })` sin `clientId`; el filtro SQL queda inerte. Ruta bajo permiso `manager` ([routes/index.js:147](../src/routes/index.js:147)). Impacto: exposición cruzada entre clientes y acceso a conversaciones internas por cualquier responsable. Corrección: exigir `clientId` o un `scope=ALL` explícito solo para ADMIN, y registrar la consulta.

**N-02. Contenido sensible en la memoria.** La sección `TRANSCRIPT` se fragmenta íntegra ([briaMemoryService.js:77](../src/services/briaMemoryService.js:77)). No hay clasificador, lista de participantes excluidos, ni marca de exclusión; solo la papelera manual. Corrección: clasificación de propósito y sensibilidad por minuta (propuesta por IA, confirmada por humano en casos ambiguos) y no indexar transcripción de reuniones internas, financieras o de personas. Decisión de Rodny pendiente (sección 9).

**N-03. Lectura muerta de `minute.clientId`.** `MeetingMinute` no tiene esa columna ([schema.prisma:146](../prisma/schema.prisma:146)); las dos lecturas siempre devuelven `null`. Todas las fuentes indexadas quedan sin cliente y entran en cualquier revisión mediante coincidencia de nombre ([briaContentPlanReviewService.js:91](../src/services/briaContentPlanReviewService.js:91)). Corrección: añadir `clientId` real a la minuta (Bloque A2).

**N-04. Evidencia rellenada en Observer.** Si el modelo no cita, se usa el resumen ejecutivo o un texto fijo ([briaObserverService.js:51](../src/services/briaObserverService.js:51)). Una señal sin respaldo llega a la bandeja pareciendo sustentada. Corrección: sin cita literal verificable, la señal se marca `UNGROUNDED` y no se muestra como accionable.

**N-05. `ARCHIVED` no es estado válido en la API de Observer.** Falta en `VALID_STATUSES` ([briaObserverService.js:9](../src/services/briaObserverService.js:9)); filtrar por archivadas cae en `OPEN`. Corrección de una línea con prueba.

**N-06. Coste de IA desconocido.** Minutas descarta `usage` ([openAIClient.js:229](../src/services/openAIClient.js:229)); parrillas lo recoge en `calls[]` y no lo persiste; memoria no cuenta embeddings. Otros flujos sí lo guardan ([reportEditorialService.js:168](../src/services/reportEditorialService.js:168)). Corrección: devolver `usage` desde el cliente y guardarlo por ejecución (Bloque A1).

**N-07. Siete trabajos sin candado compartido.** Ver sección 3. Impacto: gasto duplicado y, en minutas, doble descarga y doble análisis del mismo `externalId`. Corrección: runtime compartido con lease (Bloque A1) o, como mínimo, `pg_try_advisory_lock` por trabajo como ya hace calendario ([calendarSyncLock.js:33](../src/services/calendarSyncLock.js:33)).

**N-08. Sin actor de sistema ni registro de acciones automáticas.** No hay principal "Bria"; el historial operativo excluye eventos sin actor humano ([operationalTraceService.js:19](../src/services/operationalTraceService.js:19)); el seguimiento automático `[Publicar]` presta el id del humano que actualizó ([nativeTaskService.js:878](../src/services/nativeTaskService.js:878)). Corrección: libro de acciones automáticas con quién o qué política autorizó (Bloque A3).

**N-09. Salud operativa no mide salud de los trabajos.** Calcula adopción e higiene de tareas ([operationalHealthService.js:331](../src/services/operationalHealthService.js:331)); no muestra última ejecución, fallos, atascos ni coste de ningún ciclo. Una minuta `FAILED` tras tres intentos o una revisión agotada no aparecen en ningún sitio.

**N-10. "Fuentes pendientes" engañoso.** El panel de memoria suma subidas de Drive que nunca se indexan ([briaMemoryService.js:256](../src/services/briaMemoryService.js:256), [:260](../src/services/briaMemoryService.js:260)); el contador nunca baja a cero.

**N-11. Notificaciones sin clave de deduplicación.** `Notification.type` es texto libre, no hay `dedupeKey`, ni ventana de agrupación, ni outbox salvo el push del chat ([notificationService.js:37](../src/services/notificationService.js:37)). Un foco diario construido encima repetiría avisos.

**N-12. Estados como texto libre.** `MeetingMinute.status`, `BriaObserverSignal.status`, `ContentPlanReview.status` y `ContentPlanReviewFinding.status` son `String`, no enums. `ContentPlanReview.status` solo se escribe como `COMPLETED` y `errorMessage` nunca se rellena. No bloquea, pero dificulta consultas y salud operativa.

**N-13. Minutas: sin barredor de `PROCESSING` y sin transacción entre bucket y base.** Estado fijado en [minuteAutomationService.js:257](../src/services/minuteAutomationService.js:257); subidas en [:272-296](../src/services/minuteAutomationService.js:272) antes del `update` terminal en [:298](../src/services/minuteAutomationService.js:298). Además, una minuta `READY` sin los cuatro títulos editoriales se reanaliza entera ([:237](../src/services/minuteAutomationService.js:237)) y el modelo `AutomationConfig` está muerto (cero referencias).

## 5. Lo que sí es sólido y se puede reutilizar

Parrillas resuelve bien seis problemas que todo ciclo autónomo tiene. Hoy están escritos a medida sobre columnas de `ContentPlan`; el esqueleto del scheduler está copiado tres veces con constantes distintas ([briaContentPlanReviewScheduler.js:82](../src/services/briaContentPlanReviewScheduler.js:82), [briaObserverScheduler.js:7](../src/services/briaObserverScheduler.js:7), [briaMemoryScheduler.js](../src/services/briaMemoryScheduler.js)), y el descubrimiento de criterios tiene otro lease con otra duración y otro vocabulario.

Los seis primitivos a extraer, con su plantilla más limpia:

1. Reclamo con compare-and-set y token de lease ([briaContentPlanReviewState.js:26-62](../src/services/briaContentPlanReviewState.js:26)).
2. Frescura del lease comprobada en cada escritura ([:76-82](../src/services/briaContentPlanReviewState.js:76)).
3. Checkpoint ligado a la versión analizada; un checkpoint de otra versión se ignora ([briaReviewBatches.js:66](../src/services/briaReviewBatches.js:66)).
4. Guardia de publicación que recalcula el hash dentro de la transacción ([briaContentPlanReviewService.js:127](../src/services/briaContentPlanReviewService.js:127)).
5. Intentos acotados con backoff exponencial y errores permanentes sin reintento ([briaContentPlanReviewState.js:86-91](../src/services/briaContentPlanReviewState.js:86)).
6. Plazo con `AbortController` que libera el trabajo colgado ([briaContentPlanReviewScheduler.js:23](../src/services/briaContentPlanReviewScheduler.js:23)).

También reutilizables: la regla de citas literales de la verificación de hallazgos ([briaFindingVerification.js:24-43](../src/services/briaFindingVerification.js:24)), la idempotencia por `requestId` de criterios, el historial `history Json` con actor y versión, y el outbox de push del chat ([teamChatRuntime.js:93](../src/services/teamChatRuntime.js:93)).

## 6. Ruta propuesta

Orden: A0 → A1 → A2 → A3 → B → C → D. A0 puede empezar mañana; B no debe empezar antes de A1 y A2. Tamaños en días de trabajo enfocado con TDD; son estimaciones.

### Bloque A0. Arreglos pequeños que no esperan (2 a 3 días, unos ocho PR)

- Observer: `RESOLVED` no vuelve a `OPEN` sin evidencia nueva (versión de evidencia distinta); `resolveMissing` solo sobre el alcance leído por completo; `ARCHIVED` como estado válido. Pruebas para los tres.
- Observer: señal sin cita literal en la transcripción → `UNGROUNDED`, no accionable.
- Minutas: timeout en Fireflies; cursor de paginación persistido; barredor de `PROCESSING` vencido; `usage` devuelto y guardado por minuta; `errorCode` además de `errorMessage`.
- Memoria: búsqueda del panel con `clientId` obligatorio o `scope=ALL` solo ADMIN; eliminar las dos lecturas muertas de `minute.clientId`; "Fuentes pendientes" sin Drive.
- Parrillas: persistir `calls[]` (tokens, latencia, modelo) en `ContentPlanReview`.
- Candado mínimo: `pg_try_advisory_lock` en Fireflies, memoria, Observer y clasificación, como hace calendario.

Puerta: ninguna señal atendida reaparece por relectura; un fallo de minuta aparece con causa; el coste por minuta y por revisión existe en la base.

### Bloque A1. Runtime de trabajo durable (4 a 6 días)

Un modelo `AutomationRun` (flujo, sujeto, clave de idempotencia única, estado `PENDING | RUNNING | COMPLETED | FAILED | SUPERSEDED`, `leaseToken`, `leaseExpiresAt`, `attempts`, `nextAttemptAt`, `checkpoint`, `errorCode`, `lastError`, `usage`, `triggeredBy`) y un módulo `automationRuntime.js` con `claimRun`, `checkpoint`, `completeRun`, `failRun` con backoff, `withDeadline` y `createScheduler`. Se crea con un script `ensure-*` aditivo, como los existentes.

Migrar primero minutas, memoria y Observer al runtime. Parrillas puede quedarse como está hasta que convenga; ya cumple el contrato.

Salud operativa gana una pestaña "Automatizaciones": última ejecución, fallos con causa, atascados, coste por flujo. Es la única forma de que "todo está bien" deje de ser una suposición.

Puerta: dos procesos no ejecutan el mismo trabajo; una caída a medias se recupera sin duplicar efectos; la prueba de fiabilidad de parrillas se replica para minutas y memoria contra PostgreSQL real.

### Bloque A2. Contexto autorizado (4 a 6 días)

- `MeetingMinute` gana `clientId` (y opcionalmente `clientIds` para reuniones multicliente), `purpose` (`CLIENT_EDITORIAL | CLIENT_OPERATIONAL | INTERNAL | FINANCIAL | PEOPLE | PERSONAL`), `sensitivity` (`NORMAL | RESTRICTED`) y `classificationStatus` (`PROPOSED | CONFIRMED`).
- La clasificación la propone el mismo análisis de la minuta a partir de participantes, dominios de correo y menciones; los casos ambiguos se muestran en Minutas para confirmar. Una coincidencia de nombre solo sugiere.
- `BriaMemorySource` hereda cliente, propósito y sensibilidad. La memoria no indexa transcripción de `INTERNAL`, `FINANCIAL`, `PEOPLE` ni `PERSONAL`; como máximo el resumen, y con `RESTRICTED` nada.
- La búsqueda filtra por propósito además de cliente. La revisión de parrillas deja de aceptar fuentes sin ámbito por coincidencia de nombre.
- Backfill acotado de las 49 minutas existentes: propuesta automática, confirmación humana en lote, sin reanálisis.
- El chat de Bria pasa a consultar esta memoria con el mismo contrato (cierra P1-02), y las rutas antiguas de `AgencyContext` se retiran o se marcan explícitamente como heredadas.

Puerta: los casos de clientes homónimos, reunión multicliente, usuario sin permiso y mención incidental no producen exposición cruzada; una reunión de personas nunca entra en contexto editorial.

### Bloque A3. Actor, niveles de autonomía y libro de acciones (2 a 3 días)

- No crear un usuario ficticio "Bria": el roster activo es la autoridad de pertenencia. En su lugar, campos `authorizedBy` (`USER:<id>` o `POLICY:<clave>`) y `actor` (`BRIA`) en las tablas que lo necesiten.
- `AutomationAction`: flujo, tipo de acción, sujeto, nivel, quién autorizó, resultado, reversible sí/no, carga útil. Es el registro que hoy no existe y que la traza humana excluye.
- `AutomationPolicy` por flujo con nivel `0` observar, `1` preparar borrador, `2` ejecutar interno reversible, y ámbito opcional por cliente. El nivel `3` (comunicaciones externas, publicaciones, dinero, cambios sensibles) es un tope fijo en código, no configurable.
- Para el piloto de compromisos basta el nivel 1: la tarea la crea el humano que aprueba, con su propio `creatorId`, y el libro registra que la propuesta fue de Bria.

Puerta: toda acción automática tiene fila en el libro con autorizador; el nivel 3 no se puede activar por configuración.

### Bloque B. Coordinación de compromisos (10 a 15 días de construcción, más 3 a 4 semanas de piloto)

Es el primer producto nuevo. Diseño detallado en la sección 7.

### Bloque C. Foco diario que prepara trabajo (5 a 8 días, cuando B tenga datos)

Reutilizar el dashboard personal ([personalDashboardService.js:331](../src/services/personalDashboardService.js:331), `buildPersonalDashboard`) y su panel de recordatorios; el Radar de Foco se retiró en el rediseño del 18 de septiembre, así que el foco diario ocupa ese lugar. Añadir a `Notification` una `dedupeKey` única y una ventana de agrupación (N-11). El foco agrupa por causa: compromisos que vencen o vencieron, tareas devueltas, señales de mis clientes, insumos prometidos que faltan. Escalar al PM solo cuando un acuerdo real venció y no hay actividad en la tarea. Respetar aplazamientos persistidos.

### Bloque D. Extender el patrón

Cada uno reutiliza runtime, contexto, política y libro; ninguno se monta antes de que B demuestre utilidad medida.

- Pulso de cliente: resumen semanal por cuenta (compromisos, hallazgos abiertos, devoluciones, última reunión) y señal "cliente sin reunión ni entrega en 30 días".
- Fábrica de reportes: trabajo mensual que recolecta evidencia, crea el `MetricReport` borrador y lista lo que falta. Hoy la ingesta es síncrona dentro de la petición ([reports.js:239](../src/routes/api/reports.js:239)); necesita el runtime.
- Aprendizaje editorial continuo: barrido de descubrimiento tras cada `DEVUELTO` con cola y presupuesto (hoy es bajo demanda); las minutas con propósito editorial pasan a ser fuente de propuestas, nunca de reglas.
- Coordinador de calendario de contenido: pieza sin aprobación a N días de su fecha → señal con dueño.
- Preparación comercial: seguimientos del CRM vencidos en el foco diario; borrador de mensaje para aprobar, jamás enviado solo.
- Financiero: solo análisis y propuesta (cartera vencida, cobros sin aplicar). Nunca movimientos.

## 7. Diseño del piloto de compromisos

### 7.1 Modelo

`MeetingCommitment`, una fila por compromiso candidato:

- Origen: `minuteId`, `analysisVersion` (hash del análisis), `fingerprint` (único por minuta), `quote` literal y `quoteOffset`, `groundingStatus` (`VERIFIED | UNVERIFIED`).
- Contenido: `text`, `ownerRaw`, `ownerTeamMemberId` con `ownerConfidence`, `clientId` con `clientConfidence`, `dueDateRaw` y `dueDate` interpretada.
- Ciclo: `status` en `CANDIDATE → PROPOSED → LINKED | CREATED | REJECTED | DUPLICATE → FULFILLED | OVERDUE | ESCALATED`.
- Vínculo: `taskId` único (una tarea por compromiso) y `matchCandidates` con las tareas existentes puntuadas.
- Cumplimiento: `fulfillmentRule` (`TASK_DONE | EVIDENCE | MANUAL`), `fulfilledAt`, `fulfillmentEvidence`.
- Autorización: `decidedById`, `decidedAt`, `decisionReason`, `authorizedBy`, `history` append-only.

`Task` no cambia en el piloto; la procedencia se lee desde el compromiso. Si más adelante Bria crea tareas en nivel 2, se añadirá `originKind`/`originId` a `Task`, nunca un usuario de sistema.

### 7.2 Reglas

- **Cita obligatoria.** `quote` debe ser subcadena literal de `transcriptText` (espacios normalizados), la misma regla que la verificación de hallazgos. Sin cita verificable el compromiso queda `CANDIDATE` con `UNVERIFIED` y se muestra como "sin cita comprobable"; nunca se propone como tarea.
- **Responsable sugerido, nunca asignado.** `ownerRaw` se compara con el roster activo (sin acentos, sin mayúsculas). Coincidencia única → sugerencia; varias → lista; ninguna → vacío. La persona confirma.
- **Cliente sugerido.** Hasta A2, a partir de dominios de correo de participantes y menciones. Después, `MeetingMinute.clientId`.
- **Buscar antes de crear.** Candidatas: tareas del mismo cliente no `REALIZADA`, creadas en ±30 días de la reunión, ordenadas por similitud de título (FTS en español ya usado por la memoria, o `pg_trgm`). Se muestran las tres mejores. Un juez con modelo es opcional y posterior.
- **Tres decisiones humanas.** Vincular a tarea existente, crear tarea, o "no es un compromiso" con motivo. Permiso: módulo `minutas` más `gestion`; el PM revisa ambigüedades. Una petición repetida no duplica (idempotencia por `fingerprint`).
- **Revalidar si cambió.** Si la minuta se reanaliza o la tarea candidata cambia antes de confirmar, la propuesta vuelve a `PROPOSED` con la versión nueva.
- **Seguimiento.** Trabajo diario sobre el runtime: `TASK_DONE` se cumple con `status = REALIZADA` y `completedAt` (el backend controla esa fecha); vencido y sin cerrar → `OVERDUE` y señal de Observer con `dedupeKey COMMITMENT:<id>:OVERDUE` y `evidenceVersion` por tramo de días, para que una señal atendida no reaparezca sin cambio real. Escalado a PM solo con vencimiento y sin sesión de trabajo en la tarea en N días.
- **Historial intacto.** Reabrir una tarea no borra el cumplimiento anterior; se añade al `history`.

### 7.3 Alcance del piloto

Reuniones nuevas desde una fecha de corte, dos o tres clientes, entre 20 y 30 compromisos. Bria solo observa y propone (nivel 1). Los 530 `actionItems` históricos no se convierten en tareas; como mucho se listan como referencia.

### 7.4 Qué se mide

| Medida | Cómo |
|---|---|
| Precisión | aceptados / (aceptados + rechazados), por cliente |
| Omisiones | compromisos que una persona añade a mano y Bria no propuso |
| Duplicados evitados | vínculos a tareas existentes frente a creaciones |
| Tiempo | acuerdo → tarea aceptada; tarea → cumplimiento comprobado |
| Ruido | señales aplazadas y descartadas por causa |
| Coste | tokens y latencia por compromiso aceptado, desde `AutomationRun.usage` |

Meta: se fija después de medir dos semanas, no antes.

## 8. Contrato para cualquier autonomía nueva

Se mantiene el del 14 de septiembre (disparador verificable, contexto autorizado, acción acotada, trabajo durable, confirmación, supervisión, aprendizaje revisado) y se añaden tres reglas:

- **Actor y autorizador siempre.** Ninguna escritura automática sin fila en `AutomationAction` con `authorizedBy`.
- **Nivel por flujo.** 0 observar, 1 preparar, 2 ejecutar interno reversible. El 3 (externo, publicación, dinero, cambios sensibles) no es configurable.
- **Cita o nada.** Un compromiso, una señal o un aprendizaje sin cita literal verificable no se presenta como sustentado. Los textos de reuniones son datos, nunca instrucciones para ejecutar herramientas.

## 9. Decisiones que necesita Rodny

1. **Réplicas.** Cuántas instancias corre el servicio en Railway. Con una, los candados en memoria fallan solo durante despliegues solapados; con dos, fallan siempre. Se ve en el panel de Railway; el repositorio no lo fija.
2. **Transcripciones.** Si la memoria puede seguir indexando transcripciones completas de cualquier reunión o solo de reuniones clasificadas como de cliente. Recomendación: solo de cliente, y ninguna de personas, financieras o personales.
3. **Búsqueda global.** Quién puede buscar en todas las transcripciones. Recomendación: solo ADMIN, con ámbito explícito y consulta registrada.
4. **Prioridad.** Si se reserva tiempo real para los Bloques A y B. Desde el 14 de septiembre todo el esfuerzo fue a otros módulos; sin esa reserva la autonomía no avanza.
5. **Piloto.** Qué dos o tres clientes y qué fecha de corte.
6. **Cumplimiento.** Qué tipos de compromiso se cierran con la tarea y cuáles exigen evidencia (envío, aprobación, publicación).

## 10. La respuesta honesta a «¿qué has montado?»

Hoy: una plataforma que procesa reuniones, construye memoria, detecta señales y revisa parrillas sin que nadie lo pida, con un ciclo (parrillas) que ya detecta, conserva estado, recibe decisiones y vuelve a comprobar.

Tras los Bloques A y B: la misma plataforma, pero con una Bria que sabe de qué cliente es cada fuente, que no reabre lo que ya se atendió, que registra qué hizo y quién lo autorizó, que cuesta lo que se puede medir, y que toma un compromiso dicho en una reunión, lo compara con el trabajo existente, lo propone, lo sigue y avisa solo cuando de verdad hace falta una decisión.

## Anexo A. SQL de solo lectura para refrescar los recuentos

Para pegar en el cliente SQL contra producción; no modifica nada. Nombres de tabla tal como los genera Prisma (sin `@@map`).

```sql
BEGIN READ ONLY;
SELECT status, COUNT(*) FROM "MeetingMinute" WHERE "deletedAt" IS NULL GROUP BY status;
SELECT COALESCE(SUM(jsonb_array_length("actionItems")), 0) AS compromisos_extraidos
  FROM "MeetingMinute" WHERE status = 'READY' AND "deletedAt" IS NULL AND jsonb_typeof("actionItems") = 'array';
SELECT status, "detectorKey", COUNT(*) FROM "BriaObserverSignal" GROUP BY 1, 2 ORDER BY 1, 2;
SELECT status, COUNT(*) AS fuentes, COUNT(*) FILTER (WHERE "clientId" IS NULL) AS sin_cliente
  FROM "BriaMemorySource" WHERE "deletedAt" IS NULL GROUP BY status;
SELECT COUNT(*) AS fragmentos, COUNT(*) FILTER (WHERE embedding IS NULL) AS sin_embedding FROM "BriaMemoryChunk";
SELECT "briaReviewState", COUNT(*) FROM "ContentPlan" GROUP BY 1;
SELECT status, COUNT(*) FROM "ContentPlanReviewFinding" GROUP BY 1;
SELECT status, scope, COUNT(*) FROM "ClientEditorialCriterion" GROUP BY 1, 2;
ROLLBACK;
```

Recuentos del 14 de septiembre, para comparar: 49 minutas READY activas; 1.176 fragmentos sin ninguno vacío; 49 fuentes sin cliente; 530 entradas en `actionItems`; 8 señales OPEN y 284 archivadas; 717 hallazgos abiertos en 25 parrillas; 181 revisiones automáticas y 11 manuales completadas; 3 revisiones FAILED; 0 criterios editoriales.

## Adenda del 20 de septiembre

- **Réplicas:** el servicio Intelligence corre con una réplica en `us-west2`, sin healthcheck y con reinicio `ON_FAILURE` (leído con `railway status --json`). La decisión 1 de la sección 9 queda resuelta: los candados en memoria solo fallan durante el solape de un despliegue.
- **Cadencia de minutas:** Rodny descartó el sondeo cada 10 minutos. El rediseño (webhook de Fireflies, comprobación por reunión del calendario y barrido dos veces al día) está en [BRIA_AUTONOMY_PLAN.md](BRIA_AUTONOMY_PLAN.md), sección 2.
- **Fireflies:** ofrece webhook `Transcription completed` con firma HMAC-SHA256, filtros `fromDate`/`toDate` y el campo `calendar_id` que enlaza con `OperationalEvent.googleEventId`. Detalles y fuentes en el plan.
- **Producción:** el guardarraíl de la sesión bloquea lecturas contra la base productiva. El SQL del Anexo A quedó empaquetado en `scripts/bria-readonly-diagnostics.mjs` para que lo corra Rodny.

## Anexo B. Método

- Historial: `git log --since=2026-09-14` (25 PR) y `git log --since=2026-09-05 -- <archivos de Bria>`.
- Lectura de código: `server.js:187-199`, los cuatro schedulers, `minuteAutomationService.js`, `firefliesService.js`, `briaMemoryService.js`, `briaMemoryController.js`, `briaObserverService.js`, `briaContentPlanReviewState.js`, `briaReviewBatches.js`, `briaFindingVerification.js`, `briaClientCriterionService.js`, `briaCriterionDiscoveryService.js`, `operationalTraceService.js`, `operationalHealthService.js`, `notificationService.js`, `nativeTaskService.js`, `openAIClient.js`, `prisma/schema.prisma` y los 26 archivos de prueba `tests/bria*`, `tests/automatedMinutes.test.js`, `tests/briaObserver*`.
- Sin consultas a producción, sin ejecución de modelos, sin cambios de datos, esquema o permisos. No se ejecutó la suite completa.
