# Bria — primer bloque de fiabilidad de parrillas

Fecha: 5 de septiembre de 2026. Implementación inicial de la ruta autorizada; no sustituye la auditoría ni implica que la nueva arquitectura esté terminada.

## Cambio operativo

Las solicitudes manuales y el planificador automático pasan por el mismo coordinador persistente. Cada parrilla admite una ejecución vigente, identificada por un token aleatorio. Las solicitudes concurrentes se suman al trabajo existente; la API responde 202 con el estado compartido y el panel existente continúa consultándolo. No se añade una revisión por usuario ni se cambia el diseño aprobado.

La ejecución trabaja fuera de una transacción. Al publicar, una transacción corta comprueba la propiedad del trabajo, su vigencia y la huella del contenido actual antes de guardar puntaje y hallazgos. Si la parrilla cambió, no publica esa revisión. Si otro trabajador recuperó el trabajo, la respuesta antigua tampoco puede completar ni marcar como fallido al nuevo.

Una edición invalida el trabajo anterior y reinicia el presupuesto de intentos. La huella incluye todas las piezas y el texto completo de los campos revisables; ya no utiliza el recorte del prompt. Los hallazgos en VERIFYING obligan a ejecutar una verificación aunque el texto aún no haya cambiado. Marcar “Corregido” no otorga puntos por sí solo.

## Límites de ejecución

| Mecanismo | Configuración |
|---|---|
| Espera después de editar | 45 segundos |
| Ciclo del planificador | Cada minuto; hasta dos parrillas por ciclo |
| Vigencia de propiedad de un trabajo | 5 minutos |
| Tiempo máximo del trabajo | 4 minutos |
| Tiempo máximo de petición OpenAI | 90 segundos por defecto; configurable en el cliente |
| Reintentos automáticos | Máximo tres intentos, esperas de 1 y 2 minutos |
| Recuperación tras reinicio | Reclamar RUNNING vencidos usando comparación atómica |
| Credenciales/configuración inválida | Fallo visible sin reintentos automáticos inútiles |

La espera real depende del siguiente ciclo. Una acción manual explícita después de un fallo inicia un nuevo presupuesto. Los tokens y contadores son internos; los mensajes visibles no exponen errores de proveedor ni credenciales. Los detalles quedan en los logs del servidor.

## Cambio de esquema y conservación

Se agregan a ContentPlan: `briaReviewLeaseToken` nullable, `briaReviewAttempts` con valor inicial 0 y `briaReviewNextAttemptAt` nullable. Se agrega un índice por estado/inicio para localizar trabajos abandonados. Se conserva PostgreSQL, el esquema de tareas, CORS y los registros de revisiones existentes.

El script de inicio `ensure-content-plan-reviews-schema.js` usa ADD COLUMN IF NOT EXISTS, una transacción y el bloqueo asesor ya existente. No se crean migraciones locales ni se requiere borrar/recrear tablas. No hay renombrados, eliminación de columnas ni backfill destructivo. El arranque debe ejecutar este script antes de iniciar el servidor, como ya indica npm start. La verificación local ejecuta el script dos veces y compara que una revisión y su trabajo vigente permanezcan intactos.

## Verificación

Resultado local de cierre: `npm run test:ci` con PostgreSQL aislado, **831 pruebas correctas, 0 fallidas, 0 omitidas**. `npm run lint` y `npm run build` correctos; el build conserva advertencias previas de tamaño de chunks, Browserslist y uso de eval en Bluebird.

Se utilizaron PostgreSQL/pgvector locales en un contenedor aislado y respuestas de IA ficticias. Las pruebas cubren:

- Competencia entre cinco reclamaciones y entre solicitudes manuales/automáticas.
- Persistencia compartida y reutilización del mismo puntaje sin otra llamada de IA.
- Ediciones durante generación, cambios de instrucciones del cliente y publicación obsoleta rechazada.
- Recuperación de trabajos abandonados, límites de intentos, espera entre reintentos y fallo de credenciales.
- Protección frente a respuestas y errores de un trabajador reemplazado.
- Tiempo máximo con respuesta tardía, sin publicación posterior.
- Repetición segura del script de esquema con historial existente.
- Invalidación después de la pieza 60 y después del texto recortado; nueva verificación de “Corregido”.

No se llamó al modelo real ni se modificó la base productiva. Estas pruebas verifican coordinación y persistencia, no calidad editorial, latencia real, despliegue productivo ni ahorro de tiempo del equipo. No hay cambios visuales en este bloque.

## Coste por revisión (20 de septiembre de 2026)

Cada revisión publicada guarda ahora en `ContentPlanReview.usage` lo que costó producirla, con la forma `{ version: 1, review, verification, totals }`:

- `review`: llamadas de los lotes (`calls`, `callsWithUsage`, tokens de entrada, salida, total, en caché y de razonamiento, `latencyMs`, modelos, `batches`, `resumedBatches`, hallazgos y evidencias rechazados). Un lote reanudado desde un checkpoint cuenta con el coste que pagó el intento anterior; un lote sin `usage` del proveedor cuenta como llamada de coste desconocido, nunca como cero.
- `verification`: las llamadas de verificación de ese intento y cuántos hallazgos verificaron.
- `totals`: la suma de ambas partes.

`src/lib/aiUsage.js` normaliza el `usage` de OpenAI (`input_tokens`, `output_tokens`, detalles de caché y razonamiento) y suma llamadas; el cliente de OpenAI expone `usage` junto a `raw`. La API de revisión devuelve `meta.usage`, también para la revisión en caché. Cambio aditivo: una columna JSONB nullable creada por `ensure-content-plan-reviews-schema.js` con `ADD COLUMN IF NOT EXISTS`; las revisiones anteriores quedan con `usage` vacío y no se recalculan. Sin cambios visuales: la lectura agregada por flujo corresponde a la pestaña de automatizaciones de Salud operativa (A1-5 del plan de autonomía).

Pruebas: `tests/aiUsage.test.js`, `tests/briaReviewBatches.test.js` (lotes reanudados y checkpoints antiguos sin coste), `tests/briaFindingVerification.test.js` (colector de llamadas), `tests/briaContentPlanReviewPersistence.test.js` (coste persistido y proveedor sin `usage`) y `tests/briaReviewJobsDatabase.test.js` (coste publicado tras reanudar, contra PostgreSQL real).

## Causa técnica de los fallos y parrillas finalizadas (21 de septiembre de 2026)

Hasta hoy una revisión agotada guardaba solo el mensaje humano («No se pudo completar la revisión. Puedes revisar nuevamente.») y la causa se perdía: las tres parrillas `FAILED` de la auditoría del 14 de septiembre llevaban una semana sin que nadie pudiera saber por qué. Dos cambios aditivos:

- **`ContentPlan.briaReviewDiagnostics`** (JSONB nullable): por cada intento fallido se añade `{ attempt, at, code, status, message, requestId, retry }`, con el mensaje recortado a 300 caracteres y como máximo los cinco últimos intentos. Una revisión reemplazada por una edición (`BRIA_REVIEW_SUPERSEDED`) no es un fallo y no escribe nada. Al completarse una revisión, los diagnósticos se borran. La API los expone en `meta.diagnostics` y el panel muestra el último bajo el mensaje humano («Intento 3 de 3 (05 sept, 10:00): OPENAI_TIMEOUT · HTTP 504. …»). El botón «Revisar nuevamente» sigue siendo la recuperación dirigida: un intento manual arranca con presupuesto nuevo.
- **Estado honesto para parrillas finalizadas.** En cada ciclo del programador, antes de servir la cola, `archiveStaleContentPlanReviews` pasa a `STALE` los hallazgos `OPEN` cuya parrilla está `FINALIZADO` o borrada (`actionReason: 'Parrilla finalizada'`, sin actor) y pasa a `STALE` la revisión `PENDING` de una parrilla finalizada sin verificaciones solicitadas. Los hallazgos `VERIFYING` se conservan y esas parrillas se siguen atendiendo; un hallazgo `STALE` no admite acciones y solo vuelve a `OPEN` si una revisión posterior lo detecta de nuevo. El barrido es idempotente y barato; en producción archiva de una vez los 177 hallazgos abiertos de parrillas cerradas medidos el 20 de septiembre.

Pruebas: `tests/briaReviewDiagnostics.test.js` (dobles), dos casos nuevos contra PostgreSQL real en `tests/briaReviewJobsDatabase.test.js` (la causa se guarda por intento y se limpia al completar; finalizar archiva los abiertos y respeta los `VERIFYING`), la cadena del panel en `tests/briaContentPlanReviewGlobalUi.test.js` y la línea renderizada con capturas en `tests/browser/briaReviewVerification.mjs`.

## Lotes que se parten solos (21 de septiembre de 2026)

La primera causa registrada por los diagnósticos, el mismo día de su despliegue, fue `BRIA_REVIEW_INCOMPLETE_BATCH` en una parrilla de 157 hallazgos: en un lote de 12 piezas el modelo respondió sin confirmar todas las piezas y, por la regla de no publicar puntaje parcial, la revisión entera fallaba tres veces y se rendía.

Ahora `reviewContentPlanBatches` parte ese lote en dos mitades y revisa cada una; si una mitad tampoco se confirma, se vuelve a partir, hasta llegar a una pieza sola, que sigue fallando como antes. Cada mitad revisada se guarda en el checkpoint por separado y, al reanudar tras un fallo temporal, se reutilizan las partes hechas y solo se revisa lo que falta. `totalBatches` del checkpoint crece con cada partición para que el avance mostrado siga siendo honesto. La cobertura publicada sigue siendo completa (`scope.complete`, todos los IDs) y `usage.review` añade `splitBatches` y `discarded` (las respuestas pagadas que no sirvieron), que entran en los totales.

El intento manual que no se completa responde `422` con un mensaje legible y el código; antes respondía `500` y producción lo reducía a `INTERNAL_SERVER_ERROR`, que el panel mostraba tal cual. El panel pasa ahora todo error por `humanizeReviewRequestError` y vuelve a cargar la revisión tras un intento fallido.

Pruebas: partición, reanudación de mitades, pieza única que nunca se confirma y errores que no se parten en `tests/briaReviewBatches.test.js`; coste con intento descartado en `tests/briaContentPlanReviewPersistence.test.js`; mensajes en `tests/briaReviewDiagnostics.test.js` y `tests/briaContentPlanReviewGlobalUi.test.js`; intento manual fallido con cuerpo saneado en `tests/browser/briaReviewVerification.mjs`.

## Coste acotado de la verificación y caídas del proveedor (21 de septiembre de 2026)

El 21 de septiembre la cuenta de OpenAI agotó su saldo y, al restablecerse, una parrilla con 157 hallazgos abiertos dejó el panel girando. Las dos causas estaban en el mismo sitio.

**La verificación no tenía techo.** Antes de publicar, la revisión volvía a comprobar *todos* los hallazgos `OPEN` y `VERIFYING` de la parrilla, de cuatro en cuatro, y cada llamada lleva la parrilla completa dentro. Con 157 abiertos son unas 40 llamadas secuenciales que no caben en los cuatro minutos del trabajo: la ejecución vencía, se reintentaba y **pagaba sin publicar nada**. Era el riesgo P2-02 de la auditoría del 14 de septiembre. Ahora `selectFindingsToVerify` reparte un presupuesto de `VERIFICATION_BUDGET` (12 hallazgos, 3 llamadas): primero todo lo que una persona marcó como corregido, por antigüedad de la petición, y después los abiertos comprobados hace más tiempo, usando la columna nueva `ContentPlanReviewFinding.lastVerifiedAt` (nulos primero). Los hallazgos siguen comprobándose todos, repartidos entre ejecuciones; lo que una persona pide se atiende siempre en la siguiente. Marcar corregido vuelve a encolar la revisión, así que una tanda de correcciones se sirve en tandas seguidas.

**Una caída del proveedor gastaba intentos.** Un 429 por falta de crédito consumía uno de los tres intentos de la parrilla, y en minutas incrementaba `retryCount`; una minuta que llega a tres queda omitida para siempre, así que una reunión grabada durante la caída se habría perdido. `src/lib/aiAvailability.js` distingue ahora indisponibilidad (429, 5xx, sin crédito, cuota, tiempo de espera, errores de red) de fallo real del trabajo. En revisiones se devuelve el intento, la parrilla queda `PENDING` con espera de cinco minutos, el mensaje humano dice que el servicio no está disponible y el diagnóstico marca `providerUnavailable`. En minutas el estado es `PENDING_PROVIDER` sin gastar intento, y el barrido las vuelve a tomar cuando el servicio regresa. Un fallo real conserva el comportamiento anterior.

Cambios aditivos: una columna `TIMESTAMP(3)` nullable creada por `ensure-content-plan-reviews-schema.js` y un estado nuevo de minuta. Nada se recalcula ni se reclasifica.

Pruebas: `tests/aiAvailability.test.js` (clasificación de errores), `tests/briaVerificationBudget.test.js` (prioridad, techo y rotación), `tests/briaReviewDiagnostics.test.js` (el intento se devuelve, incluso en el último), `tests/automatedMinutes.test.js` (la minuta se aparca sin gastar intento y se vuelve a tomar) y dos casos contra PostgreSQL real en `tests/briaReviewJobsDatabase.test.js` (una parrilla con 41 hallazgos abiertos publica con tres llamadas de verificación; cuatro caídas seguidas dejan la parrilla recuperable con su presupuesto intacto).

## Volumen de hallazgos: pocas y buenas (25 de septiembre de 2026)

Rodny lo planteó así: «no puede tomar más tiempo la corrección y revisión de los hallazgos que la creación misma de la parrilla… no puedo revisar 100 cards por parrilla y muchas, de hecho, son repetidas». Tenía razón, y el problema no era que Bria encontrara mucho: **el sistema estaba construido para acumular**. Tres causas que se sumaban:

1. **Nada cerraba un hallazgo que dejaba de detectarse.** Al revisar de nuevo, un hallazgo ya no reportado seguía abierto. Solo lo cerraba una persona descartándolo o una verificación confirmando la corrección, y desde el presupuesto acotado solo se verifican doce por vuelta: con cien abiertos, la mayoría no se volvía a mirar nunca.
2. **El mismo problema se volvía tarjeta nueva al cambiarle el nombre a la regla.** La identidad es `(pieza, ruleKey, campo)` y el `ruleKey` lo escribe el modelo en cada revisión.
3. **El mismo problema se reportaba una vez por dimensión**, hasta cuatro tarjetas para un solo asunto.

Medición del 22 de septiembre: 1.119 hallazgos abiertos, 1.002 de ellos en 25 parrillas en planificación, con 26 descartes en toda la historia de la plataforma.

**Lo que se publica ahora.** `selectPublishableFindings` filtra lo `INFO`, deja hasta 3 por pieza y 15 por parrilla, y ordena por gravedad. Los hallazgos del plan entero entran primero con cupo propio. El puntaje y las dimensiones no cambian: los calcula el modelo aparte.

**Lo que se archiva solo.** Al publicar una revisión de alcance completo, los `OPEN` que no volvieron a detectarse pasan a `STALE`. No se declaran resueltos, porque no aparecer no lo demuestra; salen de la lista activa y vuelven si reaparecen. Se respetan los `VERIFYING` y los que acaban de verificarse.

La causa 2 deja de importar por sí sola: si el modelo renombra la regla, la tarjeta vieja se archiva al no detectarse. La causa 3 exige cambiar el prompt, y eso altera el juicio editorial, así que va aparte con evaluación comparativa (`AGENTS.md` §7).

Limpieza de lo acumulado: `scripts/archive-open-review-findings.js`, en simulación salvo `--confirm ARCHIVAR`. No borra nada.

Pruebas: `tests/briaFindingVolume.test.js` (techos, prioridad por gravedad, cupo del plan), `tests/briaFindingCleanup.test.js` (la limpieza no toca decisiones humanas) y tres casos nuevos contra PostgreSQL real en `tests/briaReviewJobsDatabase.test.js` (se archiva lo que deja de detectarse y vuelve si reaparece; una corrección pendiente de verificar nunca se archiva; una parrilla de diez piezas con seis hallazgos cada una publica quince como mucho, tres por pieza y ninguno informativo).

## Siguiente entrega recomendada: cobertura y criterio verificables

1. Revisar todas las piezas por lotes y exponer cobertura real. Continuación implementada en [cobertura y recuperación por lotes](BRIA_REVIEW_BATCH_COVERAGE.md), con sus pruebas y límites documentados. Impedir que una revisión parcial resuelva hallazgos fuera de su cobertura.
2. Versionar la rúbrica y crear casos de evaluación con parrillas anonimizadas aprobados por el equipo: errores reales, falsos positivos, correcciones resueltas, contenido sin memoria de cliente y coherencia entre piezas. Base local implementada en [rúbrica y evaluación editorial](BRIA_EDITORIAL_EVALUATION.md): candidata separada, 36 controles sintéticos y primera medición real limitada. La aprobación humana y los casos reales siguen pendientes; no confundirlos con pruebas técnicas correctas.
3. Unificar contexto vigente por cliente con procedencia, permisos, evidencia y reglas aprobadas. Invalidar revisiones al cambiar conocimiento relevante, no solo al editar contenido. La comprobación de instrucciones durante la publicación no sustituye este flujo.
4. Pilotear con pocas parrillas y medir: tiempo hasta aprobación, correcciones verificadas, descartes por falso positivo, coste y latencia. El coste y la latencia por revisión ya se guardan (sección anterior); falta agregarlos por flujo y periodo. Ampliar autonomía cuando las mediciones lo justifiquen.

Persistencia global no significa determinismo absoluto del modelo: dos revisiones explícitas realizadas en momentos distintos todavía pueden producir variaciones. El coordinador evita resultados rivales simultáneos; la calibración y evaluación de criterio son otro trabajo pendiente.

Continuación: [bloqueo de Aristea y verificación explícita](BRIA_FINDING_VERIFICATION.md). Documenta la regresión por piezas eliminadas, su prueba con PostgreSQL y el nuevo cierre basado en conclusiones individuales, con reintentar/deshacer en la interfaz. Los resultados de verificación anteriores corresponden al primer bloque, no a esta continuación.
