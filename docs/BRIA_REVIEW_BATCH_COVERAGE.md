# Bria — cobertura y recuperación por lotes

Fecha de implementación: 5 de septiembre de 2026, America/Bogota. Segundo bloque de la ruta, autorizado para publicación. Este documento registra la implementación y sus comprobaciones locales; el estado del despliegue se verifica por commit en Railway. El bloque anterior (`9f90f2c`) recuperó la verificación de Aristea: la lectura productiva confirmó `CURRENT` el 5 de septiembre a las 21:32 y una conclusión `STILL_PRESENT` con evidencia; no se corrigió ni descartó contenido de la agencia mediante scripts.

## Contrato de revisión v4

- La huella, el análisis y la publicación usan las mismas piezas activas y los campos completos. Se elimina el límite de análisis de 60 piezas y el recorte de copy/caption a 1.800 caracteres.
- Los lotes se ordenan por ID y contienen hasta 12 piezas. Cada petición incluye el calendario/objetivos de todas las piezas, las instrucciones del cliente y la evidencia recuperada de ese cliente.
- La respuesta debe confirmar exactamente los IDs del lote y devolver cuatro dimensiones válidas. JSON incompleto, IDs omitidos/duplicados/ajenos o dimensiones inválidas impiden publicar. Se acepta JSON envuelto en bloques Markdown. Esta confirmación comprueba el contrato del modelo, no demuestra por sí sola la calidad de su juicio.
- Se calcula cada dimensión ponderando sus lotes evaluables por cantidad de piezas. Luego se aplican los pesos existentes: estrategia 30, marca 25, gramática 25, consistencia 20. No se suman puntos al pulsar «Corregido» ni al descartar.
- Se consolidan todos los hallazgos de los lotes; no se recorta la lista global a 12. Un duplicado conserva la observación más severa. Se mantiene el máximo de 12 hallazgos prioritarios por respuesta/lote.
- Solo después de completar todos los lotes y las verificaciones explícitas se publica una revisión compartida, en la transacción y con los controles de vigencia existentes.

## Persistencia y recuperación

Dos columnas nuevas, opcionales y aditivas: `ContentPlan.briaReviewCheckpoint` y `ContentPlanReview.scope`, ambas JSONB. El script de inicio las añade con `IF NOT EXISTS`; no borra, renombra ni rellena historiales antiguos. Se conserva PostgreSQL y no se crean migraciones locales. Las pruebas aplican el script dos veces en la base aislada y comprueban que conserva registros.

El checkpoint guarda el hash del análisis, los lotes ya completados y sus identificadores de petición/modelo. Cada escritura exige un trabajo vigente y su token. Una edición o un deshacer invalida el checkpoint; un fallo transitorio lo conserva. El reintento solo reutiliza respuestas si coinciden la versión de contenido, evidencia, prompt y clave del lote. Al publicar, se limpia el checkpoint en la misma transacción.

La API expone únicamente contadores del avance; no entrega respuestas parciales ni puntajes parciales. El alcance final registra IDs revisados, número de lotes, texto completo y límite de comparación transversal. Revisiones anteriores sin `scope` muestran «Cobertura de piezas no registrada» hasta una nueva ejecución real; no se lanza un backfill masivo ni se inventa cobertura.

## UX y límites explícitos

El diseño aprobado se mantiene: degradado Bria, mascota sobre blanco, puntaje compacto, botones de icono y carrusel. El panel separa `X/Y piezas revisadas`, `N/4 dimensiones evaluadas` y fuentes del cliente. Durante un reintento muestra avance guardado y aclara que el puntaje visible pertenece a la última revisión completa. Light/dark, escritorio, tablet y móvil se validan en el componente real con datos ficticios.

- Objetivo de tamaño por lote: 60.000 caracteres de JSON; una pieza individual puede superar ese objetivo sin partirse hasta el techo de seguridad de 200.000. Contexto compartido máximo: 100.000. Máximo: 100 lotes. Son límites explícitos de aplicación, no una equivalencia con tokens ni una garantía de cabida en cualquier modelo. Si se exceden, se informa un error; no se corta contenido silenciosamente.
- Se mantienen 4 minutos por ejecución, propiedad de 5 minutos y hasta tres intentos automáticos. El checkpoint permite progresar en intentos posteriores, pero una parrilla extraordinariamente extensa puede agotar ese presupuesto; se muestra el fallo y se permite reintentar. No se promete un plazo fijo ni coste constante.
- La comparación entre lotes usa calendario y objetivos, no una lectura conjunta de todos los textos. La UI informa esta limitación. Una revisión transversal específica y su evaluación siguen pendientes.
- La verificación individual de hallazgos conserva su límite de contexto de 200.000 caracteres: si no puede verificar con evidencia suficiente, no certifica la corrección.

## Pruebas y siguiente paso

Resultado local: **864 pruebas correctas, 0 fallidas, 0 omitidas**; lint y build correctos. Se mantienen advertencias previas de Browserslist, configuración Prisma, eval en Bluebird y tamaño de chunks. Verificación visual completada en 1366×1000, 768×1024 y 390×844; light/dark, sin desbordamiento horizontal y con controles táctiles comprobados.

Pruebas automatizadas con PostgreSQL/pgvector local aislado y modelo simulado: 61 piezas con textos largos y hallazgos al final; respuestas incompletas; aislamiento de IDs/evidencia; puntaje ponderado; persistencia y reanudación tras fallar el segundo lote; invalidación al editar; rechazo de trabajadores reemplazados; historial antiguo; UI de progreso, reintentar y deshacer server-first. Las capturas de `tests/browser/briaReviewVerification.mjs` se generan en `output/bria-coverage-*.png` sin acceder al backend real. No se ha evaluado todavía esta versión v4 con inferencias productivas ni medido su ahorro/latencia real.

Siguiente bloque: una rúbrica versionada y un conjunto de 30–50 casos anonimizados aprobados por responsables, incluidos errores reales, falsos positivos, ausencia de memoria, instrucciones contradictorias y coherencia entre lotes. Medir acuerdos con el equipo, reaperturas, coste y latencia antes de promover descartes a reglas permanentes del cliente o ampliar autonomía. Un formato válido no equivale a un juicio correcto: [Structured Outputs, documentación oficial](https://developers.openai.com/api/docs/guides/structured-outputs).
