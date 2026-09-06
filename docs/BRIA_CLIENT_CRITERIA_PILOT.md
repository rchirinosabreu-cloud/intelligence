# Piloto local: criterios por cliente y puntaje explicable

## Estado y alcance

Implementado localmente; no publicado en este bloque. El motor compartido productivo continúa en `content-plan-review-v4`. No se cambia automáticamente a la candidata `traceable`.

### Criterios editoriales

- Entrada: botón **Criterios del cliente** en la revisión de la parrilla.
- Cualquier usuario activo con acceso a parrillas puede proponer una regla concreta y justificarla.
- Validan el responsable de la **parrilla de origen** (`owner.userId`), los PMs y admins activos con acceso al módulo. Los permisos se vuelven a consultar en backend; no se confía en el rol enviado por el navegador.
- Estados: `PROPOSED → APPROVED → REVOKED` o `PROPOSED → REJECTED`. No se modifica silenciosamente una regla aprobada; un cambio de criterio requiere otra propuesta.
- Cada decisión exige motivo y versión esperada. Dos decisiones concurrentes sobre una versión tienen un solo ganador; la otra recibe 409.
- Texto, categoría, cliente, parrilla/hallazgo de origen y historial se conservan en `ClientEditorialCriterion`. El historial contiene acción, versión, actor ID/nombre/rol, contexto de parrilla, motivo y fecha. Los nombres son una instantánea, no un sistema de permisos.
- Los descartes siguen en `ContentPlanReviewFinding.actionReason`; **no** se convierten automáticamente en criterios.
- Las reglas `APPROVED` se leen directamente por `clientId` al preparar la revisión, con evidencia `criterion:<id>:v<version>`. No dependen de encontrar un embedding y nunca se prestan a otro cliente.
- Aprobación/revocación e invalidación de revisiones son atómicas. Orden de bloqueos: mutex del cliente, parrillas ordenadas, criterio. El publicador bloquea su parrilla antes de cotejar el snapshot. No hay llamadas a IA dentro de la transacción.
- Parrillas activas: `PENDING`; finalizadas sin hallazgo `VERIFYING`: `STALE` con revisión manual disponible. Así no se prometen chequeos automáticos que el scheduler no ejecuta.
- Propuestas idempotentes por `requestId`. Límite de 100 propuestas/criterios activos por cliente; texto de 800 caracteres y motivos de 500. El historial de decisiones no se trunca.

### Base de datos

Cambio aditivo: una tabla y sus índices/FKs, sin modificar ni borrar registros anteriores. `scripts/ensure-content-plan-reviews-schema.js` crea el esquema de manera repetible al inicio. No hay migraciones locales ni `accept-data-loss`. Las pruebas usan exclusivamente `brainstudio_test` en `127.0.0.1:55439`, nunca el `DATABASE_URL` de `.env`.

### Puntaje trazable candidato

`--variant traceable` exige un chequeo por cada pieza y cada una de las 11 reglas. Resultados: `PASS`, `FAIL`, `NOT_ASSESSABLE`. Los dos primeros requieren una cita literal existente en el campo declarado. Un error de IDs, cobertura, severidad o cita rechaza el resultado entero, sin inventar 100 puntos como reemplazo.

Fórmula candidata: `WARNING` pierde 0,5 y `CRITICAL` pierde 1 del chequeo; se promedian chequeos evaluables por dimensión y se ponderan estrategia 30, marca 25, gramática 25 y consistencia 20. Dimensiones sin datos se excluyen del denominador; sin ningún chequeo evaluable el puntaje es `null`. Cada descuento conserva pieza, regla, cita y puntos exactos; se redondea solo el total. La cobertura parcial siempre acompaña la lectura.

El mismo conjunto de chequeos produce el mismo cálculo, pero eso **no** implica que el modelo siempre produzca los mismos chequeos ni que sean correctos. La revisión compartida persistida sigue siendo la fuente común para todos; los pesos y umbrales requieren calibración con responsables reales.

Se usa el mismo generador por lotes, con snapshots y checkpoints versionados, sin habilitar el experimento en el scheduler. El desglose visual solo aparece si existe `scoreTrace`; no se fabrica un desglose para revisiones históricas.

## Evaluación sintética del 6 de septiembre de 2026 UTC

Cuatro escenarios, dos repeticiones por variante: concordancia incorrecta, control correcto, cliente sin memoria y feedback antiguo ya resuelto. Etiquetas sintéticas en borrador, no aprobación editorial humana.

| Variante | Contratos válidos | Variación máxima por caso | Interpretación |
| --- | --- | --- | --- |
| Base v4, comparación actual | 8/8 | 2, 1, 3 y 69 puntos | Variación y hallazgos aún no adjudicados; los ruleKeys libres no permiten comparar precisión con el catálogo. |
| Trazable inicial, dos series | 4/8 en cada serie | Resultados incompletos y divergencias | No aprobada. Se detectó salida no estricta en el adaptador. |
| Trazable, formato estricto + razonamiento low | 8/8 | 1, 0, 20 y 0 puntos | Mejora de contrato; persiste una divergencia estratégica, así que NO se promueve. |

Última serie: 2 hallazgos esperados detectados, ningún falso positivo explícitamente etiquetado, 1 observación sin adjudicar, 5/6 comprobaciones de evaluabilidad coincidentes con etiquetas borrador; precisión **no calculable** porque el gold no es exhaustivo. Cero descuentos sin defecto asociado en resultados aceptados; esto no certifica la interpretación del defecto. Latencia media 12,7 s/llamada frente a 6,6 s de la base, en esta muestra pequeña.

34 llamadas sintéticas en este bloque: 8 + 2 diagnósticas + 8 + 8 de base + 8 estrictas. Informes completos en `output/bria-evals/` (ignorado). El reporte final es `2026-09-06T03-42-39-757Z-traceable-00feb6c8-139b-4f07-b904-73bbd768c2db.json`. No se usaron parrillas reales ni se cambió el modelo productivo.

Implementación conforme a [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) y [evaluación continua](https://developers.openai.com/api/docs/guides/evaluation-best-practices). El contrato estricto sigue requiriendo validación propia de IDs, citas y cobertura; no verifica por sí solo el juicio editorial.

## Comprobar localmente

1. Iniciar el contenedor de pruebas `brainstudio-bria-review-test` y establecer **explícitamente** `TEST_DATABASE_URL` a la base local aislada.
2. Ejecutar `node scripts/preview-bria-pilot.js`.
3. Abrir `http://127.0.0.1:3002/tests/fixtures/bria-pilot.html`.

La muestra crea un cliente ficticio y cuatro usuarios locales (Responsable, Colaborador, PM, Admin); no crea cuentas utilizables en producción. La API permite solo esa parrilla. El adaptador de UI se fija al puerto 3002 y no hereda la API habitual de `.env`. El selector de roles pertenece exclusivamente a esta muestra; no existe en producción. El desglose usa respuestas **ficticias**, no se presenta como revisión real de IA. Las aprobaciones sí atraviesan el servicio y PostgreSQL local reales. No hay llamadas a modelos desde el piloto.

Pruebas de navegador: `tests/browser/briaClientCriteria.mjs`, `briaScoreDetails.mjs` (API simulada) y `briaPilot.mjs` (API/base local real). Capturas en `output/bria-criteria-*`, `output/bria-score-*` y `output/bria-pilot-*`.

## Siguiente puerta de decisión

Validar texto, diseño y flujo local. Después seleccionar parrillas y responsables para adjudicar ejemplos reales anonimizados, en particular cuándo una pieza **desarrolla suficientemente el objetivo**. Calibrar pesos, severidad, cobertura mínima y latencia; repetir comparación. Publicar criterios y cálculo son decisiones separadas: este último no debe activarse mientras esa calibración esté pendiente.
