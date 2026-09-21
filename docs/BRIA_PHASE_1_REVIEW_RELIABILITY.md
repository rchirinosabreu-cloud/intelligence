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

## Siguiente entrega recomendada: cobertura y criterio verificables

1. Revisar todas las piezas por lotes y exponer cobertura real. Continuación implementada en [cobertura y recuperación por lotes](BRIA_REVIEW_BATCH_COVERAGE.md), con sus pruebas y límites documentados. Impedir que una revisión parcial resuelva hallazgos fuera de su cobertura.
2. Versionar la rúbrica y crear casos de evaluación con parrillas anonimizadas aprobados por el equipo: errores reales, falsos positivos, correcciones resueltas, contenido sin memoria de cliente y coherencia entre piezas. Base local implementada en [rúbrica y evaluación editorial](BRIA_EDITORIAL_EVALUATION.md): candidata separada, 36 controles sintéticos y primera medición real limitada. La aprobación humana y los casos reales siguen pendientes; no confundirlos con pruebas técnicas correctas.
3. Unificar contexto vigente por cliente con procedencia, permisos, evidencia y reglas aprobadas. Invalidar revisiones al cambiar conocimiento relevante, no solo al editar contenido. La comprobación de instrucciones durante la publicación no sustituye este flujo.
4. Pilotear con pocas parrillas y medir: tiempo hasta aprobación, correcciones verificadas, descartes por falso positivo, coste y latencia. El coste y la latencia por revisión ya se guardan (sección anterior); falta agregarlos por flujo y periodo. Ampliar autonomía cuando las mediciones lo justifiquen.

Persistencia global no significa determinismo absoluto del modelo: dos revisiones explícitas realizadas en momentos distintos todavía pueden producir variaciones. El coordinador evita resultados rivales simultáneos; la calibración y evaluación de criterio son otro trabajo pendiente.

Continuación: [bloqueo de Aristea y verificación explícita](BRIA_FINDING_VERIFICATION.md). Documenta la regresión por piezas eliminadas, su prueba con PostgreSQL y el nuevo cierre basado en conclusiones individuales, con reintentar/deshacer en la interfaz. Los resultados de verificación anteriores corresponden al primer bloque, no a esta continuación.
