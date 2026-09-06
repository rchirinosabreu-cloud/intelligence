# Bria: bloqueo de Aristea y verificación explícita

## Diagnóstico comprobado

La consulta de solo lectura a producción confirmó que la parrilla de Aristea de septiembre de 2026 tenía ocho piezas activas y cuatro eliminadas lógicamente. El lector de la revisión excluía las eliminadas; la comprobación transaccional antes de publicar las incluía. Sus huellas nunca coincidían, aunque nadie editara. Cada respuesta se descartaba como obsoleta y volvía a PENDING con el presupuesto reiniciado.

El planificador estaba activo y el despliegue de `75c854e` figuraba correcto en Railway. No era una preferencia del navegador ni una verificación que simplemente necesitara más tiempo. Una prueba de regresión con PostgreSQL local reprodujo SUPERSEDED y, después del cambio, completó el trabajo como CURRENT. No se modificaron datos productivos durante el diagnóstico.

## Cambio implementado

- Una representación canónica excluye las piezas eliminadas tanto del prompt como de la huella. La lectura de publicación también las excluye explícitamente.
- Corregido + programación se guardan en una única transacción; el orden de bloqueo es parrilla, después hallazgo, igual que al publicar. Si falla la cola, se revierte la acción.
- Deshacer «corregido» funciona mientras el hallazgo está VERIFYING, incluso después de un fallo. Vuelve a OPEN e invalida el trabajo previo. No deshace ediciones de la pieza ni modifica el puntaje directamente. No es todavía un historial navegable para deshacer resoluciones ya terminadas.
- Las solicitudes de verificación humana también se atienden en parrillas finalizadas. No se activa un barrido indiscriminado del archivo histórico.
- La UI distingue espera, trabajo activo, fallo y conclusión inconclusa. Los errores permiten reintentar. Una solicitud fallida no simula éxito. Los hallazgos pendientes mantienen la consulta de estado aunque el estado antiguo de la parrilla sea CURRENT.

## Criterio de verificación

El análisis general mantiene su puntaje compartido. Después se verifican explícitamente los hallazgos OPEN/VERIFYING existentes, en lotes de cuatro, con el contexto completo y sin el recorte de 60 piezas usado en el análisis general.

Cada conclusión identifica el hallazgo original y devuelve RESOLVED, STILL_PRESENT o INCONCLUSIVE, con una explicación y citas de campos actuales. El servidor valida la identidad, que haya una sola conclusión por hallazgo y que las citas existan literalmente en las piezas de la parrilla. Una conclusión sobre una pieza debe citar esa pieza. IDs externos, citas inventadas, duplicados, omisiones o resultados sin apoyo nunca cierran un hallazgo.

Solo RESOLVED sustentado permite cerrar. STILL_PRESENT e INCONCLUSIVE vuelven a OPEN y muestran la explicación. Si el análisis general vuelve a detectar el mismo problema pero la verificación afirma que se resolvió, se conserva abierto por contradicción. Un descarte concurrente se conserva; una respuesta anterior a deshacer/editar no puede publicarse. Una nueva detección borra conclusiones obsoletas.

Es una evaluación de IA con controles, no una garantía de corrección editorial. Las citas verificables demuestran procedencia, no que el juicio semántico sea infalible. Se mantiene el siguiente paso de calibrar con casos reales aprobados por el equipo. Referencia: [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs); el contrato de salida no sustituye la validación del contenido.

## Persistencia y límites

Se añade únicamente `ContentPlanReviewFinding.verification` (JSONB nullable), con la última conclusión, explicación, citas, versión del verificador, modelo/requestId cuando hubo llamada, fecha y huella de la versión verificada. Sigue vinculado al cliente mediante la parrilla. No se entrena el modelo ni se ingresa esta información automáticamente en la memoria general del cliente.

El arranque añade la columna con ADD COLUMN IF NOT EXISTS antes de generar Prisma. No hay renombrados, eliminación de datos ni migraciones locales. La columna es compatible con registros anteriores, que quedan con NULL. La versión de análisis pasa a `content-plan-review-v3` para no reutilizar conclusiones anteriores bajo el nuevo criterio. Se conserva el script idempotente y el esquema PostgreSQL.

Se mantienen la espera de 45 segundos, ciclo de un minuto, máximo de dos parrillas por ciclo, tres intentos, timeout de trabajo de cuatro minutos y recuperación a los cinco. La verificación añade llamadas en lotes, por lo que puede tardar más que el análisis general; no se promete un tiempo fijo. Si el contexto serializado supera 200.000 caracteres, queda INCONCLUSIVE sin recortes silenciosos ni certificación. El análisis general aún limita el prompt a 60 piezas: cobertura general completa por lotes sigue pendiente. Su porcentaje actual pondera dimensiones, no piezas revisadas.

## Pruebas reproducibles

- `tests/briaReviewJobsDatabase.test.js`: PostgreSQL real, atomicidad, concurrencia, descarte/deshacer durante generación, piezas eliminadas, contradicciones, recuperación, límites e idempotencia del esquema. Requiere `DATABASE_URL` y `TEST_DATABASE_URL` apuntando explícitamente a una base local aislada; nunca producción.
- `tests/briaFindingVerification.test.js`: JSON con fences, entradas malformadas, citas, contexto completo, omisiones y límite seguro.
- `tests/briaVerificationUi.test.js`: espera, fallo, recuperación, resultado inconcluso y disponibilidad de acciones.
- `node tests/browser/briaReviewVerification.mjs`: componente real con API interceptada, escenarios 1366/768/390 px y ambos temas, capturas en `output/bria-verification-*.png`. Prueba reintentar/deshacer, errores de guardado, navegación sin recarga y blancos táctiles; no usa datos reales ni llama a IA. Chrome configurable con `CHROME_PATH`.

## Próximos pasos de la ruta

Validación local de este bloque: **850 pruebas correctas, cero fallidas y cero omitidas** con PostgreSQL aislado; lint correcto y cinco escenarios de navegador correctos (escritorio, tableta y móvil; light/dark). La IA se simuló en las pruebas: no se ha medido aún precisión editorial ni latencia con el modelo real. Capturas finales en `output/bria-verification-*.png`.

1. Publicar este bloque cuando se autorice y comprobar que la verificación de Aristea sale de la espera y publica una conclusión; una prueba local no demuestra el resultado en producción.
2. Completar la cobertura del análisis general por lotes y distinguir cobertura de piezas frente a dimensiones evaluables.
3. Construir un conjunto de evaluación editorial acordado con el equipo antes de ampliar autonomía; medir falsos positivos, correcciones confirmadas, latencia y costo.
4. Convertir feedback recurrente en propuestas de reglas específicas por cliente, con procedencia y aprobación, sin aprender excepciones puntuales como reglas universales.
