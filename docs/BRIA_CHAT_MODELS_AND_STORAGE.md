# Bria: modelo, archivos y borrado definitivo

## Comparación sin planificador — 1 de noviembre de 2026

Tras retirar el planificador y las plantillas (31 de octubre), Rodny pidió comparar
modelos «sin gastar demasiado». Se corrió el conjunto de preguntas reales con datos
ficticios (`npm run eval:bria-casos`, 23 casos, dos repeticiones, 46 respuestas por
configuración) con el mismo motor y las mismas instrucciones de producción, con tope
en dólares reservado antes de cada llamada (`BRIA_EVAL_MAX_USD` y las tarifas por
millón; `BRIA_EVAL_EFFORT` fija el esfuerzo de razonamiento). Tarifas verificadas ese
día en la página de precios de OpenAI (estándar, contexto corto; entrada / caché /
escritura de caché / salida por millón): GPT-6 Luna 0,10 / 0,01 / 0,125 / 0,50;
GPT-6.1 Terra 1 / 0,05 / 1,25 / 5; GPT-6.1 Sol 2 / 0,10 / 2,50 / 10.

| Configuración | Respuestas correctas | Latencia media por caso | Costo de las 46 | Costo por caso |
| --- | --- | --- | --- | --- |
| gpt-6-luna, low (producción) | 42/46 | 4,3 s | USD 0,028 | USD 0,0006 |
| gpt-6-luna, medium | 43/46 | 5,8 s | USD 0,036 | USD 0,0008 |
| gpt-6.1-terra, low | 45/46 | 4,8 s | USD 0,112 | USD 0,0024 |
| gpt-6.1-sol, low | 46/46 | 5,6 s | USD 0,347 | USD 0,0075 |

Las cuatro configuraciones hacen el mismo número de llamadas por caso (tres) y leen el
mismo contexto (unos 37.000 tokens de entrada por caso, el 95 % servido de caché).
El gasto total de la comparación, con la primera pasada incluida, fue de USD 1,6.

Lo que distingue a los modelos no es el volumen sino un caso: **«Escríbele a Helen que
el video de Gema salió con la versión vieja»**. Luna, con cualquier esfuerzo, buscó a
Helen como cliente y no consultó cómo trabajar con ella (`como_trabajar_con`) en las
cuatro respuestas; Terra y Sol lo hicieron bien las cuatro veces. El otro fallo repetido
(«¿cómo viene Aristea?» sin decir desde cuándo está en rojo) aparece en Luna, Luna
medium y Terra, una o dos veces de cuatro, y en Sol ninguna. Subir el razonamiento de
Luna a medium no cambia el resultado y cuesta un segundo y medio más por caso.

**Lo que no mide esta comparación:** las preguntas del piloto de WhatsApp (cartera,
panorama, memoria de una cuenta) no están en este conjunto, y 23 casos por dos no
distinguen diferencias pequeñas. Sí distingue un fallo sistemático, y el de la ficha
del equipo lo es.

Proyección mensual con el uso real de la semana del 25 de octubre al 1 de noviembre
(673 llamadas del asistente, 18,1 millones de tokens de entrada y 175.000 de salida),
suponiendo la misma proporción de caché que en la evaluación y, entre paréntesis, sin
caché: Luna USD 2 (8), Terra 6.1 USD 15 (80), Sol 6.1 USD 30 (165).

**Un hallazgo del evaluador:** cinco casos exigían la frase exacta de la plantilla
retirada («¿Lo hago así?», «¿Los creo así?») y en la primera pasada hicieron fallar
del 30 % al 43 % de las respuestas de los cuatro modelos, que preparaban bien la acción
y lo decían con otras palabras. Desde este día esos casos exigen lo que importa
(`expectPendingAction`: la acción queda preparada, con su tipo y sus datos, sin
ejecutar), no una frase. Repetir: `scripts/eval-bria-casos.mjs` con `BRIA_EVAL_MODEL`,
`BRIA_EVAL_EFFORT`, `BRIA_EVAL_MAX_USD` y las cuatro tarifas; los informes de esta
corrida se guardaron fuera del repositorio.

## Selección del chat — 7 de octubre de 2026

Modelo elegido: **gpt-6-luna**, `reasoning.effort=low`. La configuración es
`BRIA_CHAT_MODEL` y `BRIA_CHAT_REASONING_EFFORT`; no cambia los modelos de revisión
editorial, embeddings ni dictado (`gpt-4o-mini-transcribe`).

Comparación con llamadas reales a Responses: ocho casos ficticios, dos repeticiones
por modelo, 64 consultas y 192 llamadas. Casos: parrilla actual, periodo explícito,
antecedente histórico, periodo inexistente, credenciales, adjunto con instrucciones
incrustadas, cliente ambiguo y acceso denegado. No se enviaron datos de clientes.
La comparación inicial con información real fue rechazada por la revisión automática
de permisos; no se ejecutó. La alternativa ficticia no requiere exponer esos datos.

| Modelo | Consultas completadas / herramientas requeridas | Lecturas completas de parrilla | Latencia media | Costo estimado de 16 consultas |
| --- | --- | --- | --- | --- |
| gpt-5.6-luna, none | 16/16 | 4/4 | 6,19 s | USD 0,007504 |
| **gpt-6-luna, low** | **16/16** | **4/4** | **5,11 s** | **USD 0,002820** |
| gpt-6.1-sol, low | 16/16 | 4/4 | 8,88 s | USD 0,064310 |
| gpt-6-astra, low | 16/16 | 4/4 | 10,69 s | USD 0,345453 |

Contadores reportados por OpenAI: entrada ordinaria, lectura de caché, escritura de
caché y salida (incluye razonamiento). La escritura de caché se cobra, no se trata
como lectura gratuita. Tarifas estándar de contexto corto verificadas el 7 de
octubre: GPT-6 Luna 0,10 / 0,01 / 0,125 / 0,50 USD por millón de tokens; Sol
2 / 0,10 / 2,50 / 10; Astra 10 / 1 / 12,50 / 50. GPT-5.6 Luna: 0,20 / 0,02 /
0,25 / 1,20. Orden: entrada, lectura de caché, escritura, salida.

Luna ofreció observaciones concretas sobre promesas sin evidencia, mensajes
repetidos y llamados a la acción, distinguió propuestas históricas del estado
actual, preguntó ante ambigüedad y rechazó credenciales. Sol y Astra desarrollaron
más las propuestas. Para esta muestra no justificaron su costo como modelo
predeterminado. Estas pruebas no prueban calidad universal ni sustituyen la
validación de las personas de la agencia. El costo observado incluye reutilización
de caché y entradas cortas: no es un presupuesto mensual de producción.

Repetición: `node scripts/evaluate-bria-chat-models.js` con `BRIA_EVALUATOR_ID` de
un administrador autorizado, `BRIA_PROJECT_ENV` con la configuración privada y
`BRIA_EVALUATION_OUTPUT` apuntando fuera del repositorio. Solo envía fixtures
ficticios. Los resultados de esta ejecución se guardaron en el directorio privado
de resultados de la tarea; no se publican correos ni documentos en Git.

Documentación oficial consultada:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/function-calling

## Prácticas implementadas

- Responses con `store:false`; continuidad mediante los elementos completos de
  respuesta y razonamiento cifrado, sin sesiones persistentes en el proveedor.
- Contexto acotado, máximo seis rondas de herramientas y un límite total de tres
  minutos por consulta. Un reintento de generación por fallos transitorios; las
  acciones de herramientas no se repiten por ese reintento.
- Respuesta incompleta no se guarda como respuesta final. Los permisos se
  revalidan antes de consultar herramientas y devolver resultados.
- Caché implícita con clave opaca separada por usuario, rol y permisos;
  identificador de seguridad opaco. La caché no sustituye los controles de acceso.
- Uso y modelo reales en metadatos del turno, sin guardar prompts ni respuestas
  en el registro central de uso. Tokens desconocidos no se contabilizan como gratis.
- Plataforma actual antes que antecedentes. Correos, documentos y adjuntos son
  evidencia; sus órdenes no autorizan cambios ni aprendizajes.

## Almacenamiento privado y eliminación

Bucket dedicado Railway: `bria-chat-files`. Variables por referencia al recurso:
`BRIA_CHAT_STORAGE_ENDPOINT`, `BUCKET`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`.
No se modifica `BRIA_STORAGE_*`, que pertenece a la memoria documental.

PostgreSQL conserva mensajes, texto extraído y metadatos privados. Originales y
copias adaptadas de adjuntos van al bucket; las claves las decide el servidor y
se verifican con SHA-256. No hay URL pública ni credenciales en el navegador.
Los límites siguen siendo cinco archivos, 20 MB por archivo y 30 MB por mensaje.

`DELETE /api/bria/conversations/:id` exige identidad propietaria vigente y la
revisión esperada. Borrar elimina en una transacción la conversación, mensajes,
texto extraído y filas de adjuntos; no afecta los aprendizajes independientes.
El historial ofrece confirmación explícita, sin papelera ni recuperación.

El borrado de objetos usa un prefijo exclusivo de esa conversación, incluye las
copias adaptadas y comprueba que quedó vacío. Si el bucket falla, un trabajo
persistente sin contenido reintenta con espera creciente y lease. HTTP 202 indica
archivos pendientes; el chat no reaparece. El worker se inicia al arrancar el
servidor. El nuevo servicio figura en Salud operativa con un HeadBucket gratuito.

Una escritura de adjuntos y el borrado bloquean la misma fila padre para impedir
subidas tardías. Un envío pendiente verifica que el chat siga existiendo antes de
continuar. Si falla una subida antes de registrar los objetos, el prefijo del chat
incluye esos objetos y su borrado definitivo también los retira.

Migración: `node scripts/migrate-bria-chat-files.js` muestra el conteo; `--apply`
copia y verifica cada original y copia adaptada antes de retirar sus bytes de
PostgreSQL. Ejecutar después de desplegar el lector compatible. Es idempotente y
no modifica mensajes ni conocimientos. El esquema es aditivo, sin migraciones
Prisma ni cambios de proveedor. Respaldos y registros de seguridad del proveedor
siguen sus políticas de infraestructura; no son una papelera de la aplicación.

Verificación: suites de Bria, OpenAI, salud y privacidad; prueba PostgreSQL aislada
de cascada, revisión concurrente, conocimiento preservado y reintento; recorrido
de navegador `tests/browser/briaDeletion.mjs` con capturas claro/oscuro.
