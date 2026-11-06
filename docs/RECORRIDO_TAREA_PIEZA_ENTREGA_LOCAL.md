# Tarea → pieza → entrega: revisión local

5 de noviembre de 2026. Rama `codex/recorrido-tarea-pieza-local`, posterior a PR #1264. **Revisado en local; Rodny autorizó la fusión después de igualar el estilo de los botones Ver pieza y Abrir Parrilla.** Esta autorización no amplía los límites de la evidencia que sigue.

## Qué puede revisarse

- **Ver pieza** abre el diálogo compartido, más pequeño que el de tarea y con el fondo desenfocado. Muestra cliente, período, fecha/hora, estado vigente, guion, texto, referencias, insumos, galería final, portada, comentarios de revisión y nota interna. Cerrar recupera la tarea, el foco y el comentario sin enviar. **Abrir Parrilla** sigue disponible.
- **Entregar pieza** permite subir archivos o registrar un enlace de Drive con las rutas y validaciones nativas. El éxito se muestra después de confirmar el guardado; los fallos conservan la posibilidad de reintentar. La entrega aparece en la misma pieza del editor. No termina participaciones ni modifica relojes. Una pieza aprobada recibe la revisión de material nuevo existente; una publicada conserva su recorrido nativo.
- **Período de la parrilla** permite ir a otro mes existente de la misma cuenta conservando procedencia y vista. No traslada piezas ni crea meses. El espejo MIO ofrece los meses ya leídos, incluidos años anteriores; no importa períodos al consultarlos. Mientras haya respuestas a comentarios abiertas, el selector espera a cancelarlas o confirmar su envío; un error conserva el texto y no desbloquea el cambio de mes. La posición automática de la pieza se libera al interactuar, para que el selector no se desplace fuera de pantalla.
- **Claridad del tablero:** la búsqueda global explica que abarca todo el tablero y deja inactivos los filtros que no aplica, conservándolos para cuando se borre. Realizado muestra los cierres más recientes primero, incluida la fecha personal de tareas compartidas. Arrastrar dentro de esa columna no altera prioridades. Aprobada, realizada y publicada tienen distintivos diferentes en editor, calendario y portal.
- **Continuidad adicional:** Inicio conserva persona y origen; Ritmo conserva selección de período, filtros y personas; Cotizaciones recupera pestaña, consulta y estado al volver del editor. El inventario de toda la plataforma está en `docs/RECORRIDOS_PLATAFORMA_2026-11-05.md`, con los recorridos pendientes separados de lo implementado.

## Prueba abierta

Frontend: **http://127.0.0.1:3183**. API local: `127.0.0.1:8092`. Base aislada: `127.0.0.1:55451/shared_tasks_demo`.

El acceso y los identificadores del conjunto ficticio vigente están en `output/task-piece-local/preview-access.json`. El navegador queda abierto como Ana en la pieza entregada de «Cuenta Faro · Tarea y pieza 9a2a7f72». Bea y Carlos son participantes de la misma tarea; Carlos no tiene permiso de Parrillas para comprobar esa separación.

Recorrido de aceptación observado en la aplicación completa:

1. Iniciar sesión como Ana y abrir su tarea vinculada.
2. Abrir **Ver pieza** sin abandonar la tarea.
3. Entregar la imagen ficticia FARO y esperar **Entrega guardada**.
4. Comprobar material nuevo por revisar y el archivo en la galería.
5. Cerrar la pieza y usar **Abrir Parrilla**: aparece el mismo archivo.
6. Pasar de noviembre a octubre y diciembre del mismo cliente.
7. Volver al origen: se recupera la tarea original.

La comprobación HTTP posterior acreditó un solo archivo con ese nombre, la misma tarea pendiente, las mismas participaciones y ninguna publicación. Evidencia: `output/task-piece-local/walkthrough/verification.json`, capturas `01`–`06` y `prueba-abierta.jpg`. Esta prueba no completa ni reabre tareas: ese recorrido ya tiene su aceptación independiente en `docs/COMPARTIDAS_CASOS_PRUEBA.md`.

## Verificación

| Comprobación | Resultado y alcance |
|---|---|
| Regresión afectada, sin salida de red externa | 721 casos: **715 aprobados, 6 omitidos, 0 fallidos**. `output/task-piece-delivery/affected-suite.log`. |
| Entrega HTTP + PostgreSQL | **5/5** en `tests/taskPieceApi.integration.mjs`: lectura, multipart y bytes, subida directa y Drive, permisos y pieza publicada. |
| Períodos MIO HTTP + PostgreSQL | **3/3** en `tests/taskPiecePeriodsApi.integration.mjs`: años anteriores, exclusiones, permisos y lecturas sin mutación. |
| Aplicación completa | **1/1** en `tests/browser/taskPieceReal.mjs`, login, API y persistencia reales. Cero errores de página. |
| Regresión de posición del selector | **1/1** en `tests/browser/planPeriodReal.mjs`, después de reproducir la opción fuera de pantalla. |
| Componentes reales con respuestas ficticias | **5/5** tarea/pieza/entrega; **8/8** períodos/estados; **14/14** sincronización del tablero; **5/5** continuidad de Inicio/Ritmo/Cotizaciones. Incluyen móvil, oscuro, errores y regreso. No sustituyen la aceptación HTTP. |
| Construcción | `node scripts/preview-task-piece-web.mjs --build`: **exit 0**, después del último cambio de código. |
| Calidad estática | `npx eslint src scripts tests --quiet` y `npm run audit:dead-code`: **exit 0**. El editor y su regresión de scroll también se revisaron después del último cambio. |

Los conteos se solapan; no deben sumarse como casos únicos. Los contratos adaptados a la extracción de componentes conservan sus exigencias de comportamiento. La galería y entradas multimedia viven en `ContentPlan/PieceMedia.jsx`, compartidas por editor y consulta; esta última no importa todo el editor. `contentFinalDelivery` centraliza el mismo flujo nativo de subida en ambas superficies.

Verificación final antes de fusionar: `output/task-piece-delivery/premerge-browser.log` conserva los **5/5** casos de tarea/pieza/entrega; `output/task-piece-delivery/premerge-periods-browser.log`, los **8/8** de períodos. El último caso de MIO falló primero con un borrador escrito y selector habilitado; ahora verifica varias respuestas abiertas, cancelación parcial, rechazo 502 con texto preservado, reintento confirmado y cambio al mes no cacheado. También pasan **23/23 contratos MIO** y ESLint en los archivos de este cierre, sin cambiar permisos ni el servicio de envío.

El primer CI limpio del PR #1265 aprobó construcción, seguridad, licencias y calidad estática; en la suite general quedaron **4.743 aprobados, uno omitido y un fallo**: faltaba describir el catálogo de períodos MIO para Bria. Se registró como lectura antes de la ruta mensual parametrizada, conservando la guarda de Parrillas y sin prometer importación o todos los meses. La regresión reprodujo primero la resolución incorrecta de `periods` como mes; después pasaron **30/30** casos de catálogo, períodos y capacidades de Bria (`premerge-catalog-green.log`). El resultado definitivo de CI se consulta en el PR; no se omite ni se relaja su control de cobertura.

La suite general inicial **no fue enteramente verde**: 4.607 aprobados, 16 fallidos, 2 cancelados y 35 omitidos. Los fallos atribuibles a esta rama quedaron corregidos y están cubiertos por la regresión afectada. Quedan dos casos ajenos de Calendar que intentan consultar la dependencia de gobierno sin aislarla, y el bloque de chat que supera su límite de 30 segundos también al ejecutarlo separado. No se modificaron para ocultar esos resultados. El intento de Calendar terminó en resolución de host fallida; no acredita conexión ni cambios de datos. La regresión posterior bloqueó la salida de red y la carga de `.env`.

La compilación conserva avisos previos de paquetes grandes y CSS generado por Tailwind a partir del patrón `/[-:T]/` de `receivablePdfService.js`. El comando global de ESLint también encontró el límite de archivos abiertos al recorrer copias antiguas bajo `output`; la comprobación indicada arriba abarca `src`, `scripts` y `tests`.

## Límites y reproducción

La aplicación, autenticación, rutas, servicios y PostgreSQL son reales; las cuentas son ficticias. El almacén HTTP local conserva bytes en memoria y admite hasta **16 MB por archivo**, sin cambiar los límites productivos. Al reiniciar el proceso se pierde ese almacén; el script crea un conjunto ficticio nuevo y actualiza el archivo de accesos, sin resetear la base. No se probaron Google, Meta, publicación externa ni almacenamiento de producción.

Con la base aislada existente encendida, iniciar en dos terminales:

```powershell
node scripts/task-piece-preview-local.mjs
node scripts/preview-task-piece-web.mjs
```

Después ejecutar `node --test tests/browser/taskPieceReal.mjs` para el recorrido completo. Esa prueba entrega un archivo ficticio nuevo. `tests/taskPieceApi.integration.mjs` utiliza el puerto 8092 y debe ejecutarse cuando ese preview esté detenido; la aceptación de MIO usa el 8094. Ninguno prepara ni borra el esquema. Los scripts verifican la base aislada y no necesitan el `.env` de producción.

El barrido transversal fue lectura de código de todas las familias de rutas, no una prueba visual completa de cada módulo. Quedan documentados, entre otros, los filtros de cartera operativa, fecha de calendario, carpeta/archivo en Drive, borradores de informes, perfiles y Radar. No se declara resuelta toda la navegación de la plataforma.

## Incremento de entregas y sustituciones · 5 de noviembre de 2026

Trabajo local posterior al merge de PR #1265 (`d2dd034`), en `codex/entregables-tareas-local`. Rodny autorizó posteriormente crear/configurar el bucket de plataforma y fusionar este incremento el 5 de noviembre de 2026. La verificación de provisión y despliegue se registra al cierre.

### Comportamiento

- **Entregar pieza** abre directamente el selector múltiple del sistema. También admite arrastrar los archivos sobre su zona. Con una entrega existente, el botón pasa a **Actualizar entrega**.
- Cada selección entrega un conjunto completo de hasta **20 archivos**. Actualizar sustituye todos los anteriores, independientemente de sus nombres; seleccionar una sola lámina sustituye el carrusel entero por esa lámina. La pantalla explica este efecto antes de seleccionar.
- La nueva selección se recibe y verifica completa antes de cambiar la entrega vigente. Fallos, cargas parciales y revisiones antiguas conservan la anterior. Dos cambios simultáneos producen un guardado y un conflicto; la interfaz consulta el estado vigente sin reenviar automáticamente. Reintentar una respuesta perdida conserva el identificador de la solicitud.
- Las miniaturas se ordenan arrastrándolas o usando las flechas desde su número. Se muestra éxito después de la respuesta del servidor y se conserva ese orden en la parrilla.
- El historial muestra autor, fecha en Bogotá, acción, archivos nuevos y conjunto anterior. Guarda metadatos, no copias descargables de las versiones retiradas. Ambas tablas de historial pertenecen al catálogo de auditoría inmutable y sobreviven a la eliminación del recurso.
- Los objetos reemplazados dejan de estar accesibles por las rutas de archivos actuales. Se eliminan del almacenamiento mediante una cola persistente con reintentos. En piezas se intenta tras el commit; en tareas lo procesa la limpieza periódica. Un fallo de eliminación no deshace una entrega guardada. Los enlaces a Drive retirados no borran los originales de Google.
- **Tareas independientes:** sección **Entregables de la tarea**, interna, compartida por sus participantes, con varios archivos, orden, descarga y sustitución completa. Usa `TaskDeliverable`, separado de comentarios e insumos: no hereda la purga de adjuntos del chat. Se admiten los tipos seguros de la plataforma (por ejemplo imagen, vídeo y PDF); no se añadió revisión de cliente.
- Una tarea ligada a pieza conserva un único destino: los finales de esa pieza. No crea una segunda entrega interna. Entregar u ordenar no completa partes ni cambia estados, relojes o ciclos. El historial interno registra el ciclo vigente cuando existe, sin crear uno.
- Una pieza aprobada conserva la señal nativa de material nuevo por revisar; una publicada conserva su estado y sus registros de publicación. La entrega no publica ni sustituye por sí sola un post ya publicado en redes.
- El acceso privado se comprueba también al descargar, ordenar y confirmar. La retirada de un colaborador revoca su acceso; ser administrador no salta la privacidad de una tarea.

### Almacenamiento comprobado

Consulta de configuración de Railway en solo lectura: servicio Intelligence, proyecto Brainstudio Lab, entorno production. Recurso `chat-evidence`, bucket S3 **`chat-evidence-cjupwwro9k`**, endpoint `https://t3.storageapi.dev`. No se leyó ni modificó ningún objeto productivo.

Los finales anteriores usan `content-plans/{slug}/{YYYY-MM}/{itemId}/final-assets`; las nuevas sustituciones usan claves finales únicas `content-deliveries/{itemId}/…` y temporales `content-delivery-staging/{itemId}/…`, en el nuevo almacenamiento de plataforma. Los entregables internos usan `task-deliverables/{taskId}/files/…`, con temporales bajo `staging/`. Las claves finales de carga directa se crean mediante copia verificada: un permiso temporal de subida usado tarde no sobrescribe el archivo ya confirmado.

Límites: piezas por servidor 100 MiB/archivo y 200 MiB/conjunto; tareas por servidor 200 MiB/archivo y conjunto. Por encima se usa carga directa: piezas hasta 2.147.483.647 bytes por el campo Int existente; tareas hasta 2 GiB, guardados como BIGINT. No se transfirió un archivo de 2 GiB durante la aceptación. El almacén ficticio local conserva su límite de 16 MiB y sus bytes duran mientras viva el proceso.

### Aceptación y reproducción del incremento

`tests/deliverablesApi.integration.mjs` usa API 8095 y PostgreSQL aislado 55451: sustitución completa con nombres iguales, historial, retiro físico, orden, confirmación parcial y reintentos, copia sellada, publicación conservada, entrega interna y destino único de tareas vinculadas. `tests/taskDeliverablesApi.integration.mjs` usa 8094: firma manipulada, otro actor/recurso, selección incompleta, concurrencia, administrador sin acceso privado, colaborador retirado y borrado en cascada con limpieza. `tests/taskDeliverableSchema.integration.mjs` instala las guardas reales únicamente sobre tablas propias de un esquema temporal, prueba inmutabilidad, conservación del historial y BIGINT, y elimina ese esquema al terminar.

`tests/browser/deliverablesReal.mjs` recorre la aplicación completa contra API 8092 y PostgreSQL: selector múltiple, dos láminas, orden persistido, sustitución por una, misma entrega en parrilla, imagen/PDF internos, descarga, orden y reemplazo, estados personales intactos y vista móvil oscura. Evidencia en `output/task-piece-delivery/walkthrough/verification.json` y sus capturas. Los casos de componentes en `taskPieceDelivery.mjs`, `taskPieceOrdering.mjs` y `taskDeliverables.mjs` cubren además errores, reintentos, permisos y arrastres; sus respuestas son ficticias.

Verificación anterior a la separación de almacenamiento y Drive: **165 aprobados, 0 fallidos, 1 omitido** en 26 archivos de contratos y aceptación HTTP/PostgreSQL (`output/task-piece-delivery/final-regression.log`). El omitido es la integración histórica general de auditoría que exige otro clúster, 55448; la nueva prueba real de inmutabilidad de ambas historias sí se ejecutó en un esquema temporal de 55451. Los componentes aprobaron **19/19** casos (`output/task-deliverables/browser-final.log`). La compilación final y ESLint aprobaron (`build-final.log`, `eslint-final.log`); también `npm run audit:dead-code` y `git diff --check`. La compilación conserva avisos de paquetes grandes. No se ejecutó toda la suite de la plataforma ni un despliegue productivo; los conteos se solapan y no se suman como casos únicos.

Para iniciar la prueba sobre la base local ya preparada, sin cargar `.env`:

```powershell
$env:NODE_ENV='test'
$env:DATABASE_URL='postgresql://shared_tasks_test@127.0.0.1:55451/shared_tasks_demo'
node scripts/task-piece-preview-local.mjs
# En otra terminal:
node scripts/preview-task-piece-web.mjs
```

Antes de iniciar, aplicar los ensures aditivos de participación, `ensure-task-deliverable-schema.js`, `ensure-content-delivery-schema.js` y `ensure-drive-schema.js` exclusivamente sobre esa base verificada y generar el cliente con `generateSharedTaskClient`. No resetear el esquema. `preview-access.json` identifica la cuenta ficticia nueva y `standaloneTask`. La prueba no utiliza credenciales, archivos ni base productivos; no acredita el comportamiento de Google, Meta o S3 de producción.

### Archivos de plataforma, memoria y Drive

Rodny amplió el destino nuevo para incluir **entregables y cargas manuales de Drive**. `agency-memory` queda reservado para memoria, minutas y conocimiento de la agencia. La implementación es local: **no se ha creado un bucket remoto ni cambiado variables de producción**.

Auditoría en solo lectura del 5 de noviembre: `GetBucketLifecycleConfiguration` del bucket `chat-evidence-cjupwwro9k` devolvió HTTP 200 con `Rules: []`. La configuración productiva sí activa `TASK_ATTACHMENT_RETENTION_ENABLED=true`, sin días personalizados (30 por defecto), y `TEMP_UPLOAD_SWEEP_ENABLED=true`, sin días personalizados (7 por defecto). La purga de adjuntos exige comentario y tarea realizada con cierre vencido; no es una caducidad general de todos los objetos del bucket. Drive/minutas ya usan `BRIA_STORAGE_BUCKET=agency-memory-snvcqfokuqk`; eso tampoco convierte automáticamente un archivo S3 en un archivo del catálogo Drive.

`PLATFORM_STORAGE_ENDPOINT`, `PLATFORM_STORAGE_BUCKET`, `PLATFORM_STORAGE_ACCESS_KEY_ID` y `PLATFORM_STORAGE_SECRET_ACCESS_KEY` configuran el destino nuevo. Debe ser distinto de chat y de memoria. Sin esa configuración las nuevas cargas responden 503 y no se desvían a otro bucket. Cada archivo conserva `storageArea`: `PLATFORM` para cargas nuevas y `LEGACY` para anteriores. El origen legado depende del dominio: S3 de chat para finales anteriores, `documentStorage`/agency-memory para archivos manuales anteriores. La misma clave puede existir en dos áreas; lecturas y limpieza comprueban ambas. Las colas de retiro también conservan el área. El control de servicios comprueba el nuevo bucket por separado.

Drive mantiene carpetas manuales y su papelera/restauración existentes; crear una carpeta no escribe objetos ni crea buckets. Subir un archivo general crea un `DriveFile` en `PLATFORM`. Minutas y otros documentos de conocimiento siguen usando su almacenamiento propio. Este incremento no mueve documentos antiguos ni cambia los almacenes especializados de chat, evidencias financieras o portadas. Las portadas existentes conservan su lector; los derivados de finales usan el área de su original.

La raíz automática **Entregables** proyecta los mismos registros vigentes de pieza/tarea, sin copiar bytes ni crear un segundo dueño en `DriveFile`. Jerarquía **cliente → año → mes → Parrillas/Tareas → pieza/encargo**. El período de parrilla manda; para tareas independientes se usa el primer evento histórico de entrega, estable al corregir. Un archivo legado sin evento declara que el período procede de su fecha actual; una fecha desconocida no se inventa. Los nombres de presentación y descarga se forman como `Cliente_YYYY-MM_Titulo_01.ext`; el original se conserva y las claves no se renombran. Sustituir muestra solo la selección vigente en tarea, parrilla y Drive; el historial conserva los metadatos retirados.

Los entregables se consultan desde Drive y se modifican desde su origen, con enlaces de regreso que conservan carpeta y búsqueda. No se descargan binarios al listar una carpeta. Las vistas previas se solicitan al abrir el archivo; los archivos demasiado grandes o sin representación mantienen la descarga. El árbol automático impide también en el servidor crear, renombrar, mover o borrar sus carpetas y archivos.

Drive filtra nombres, carpetas, búsquedas y descargas por permisos de origen (`canOpenTask`, Gestión/Parrillas); su permiso global no concede acceso a tareas privadas. Las descargas revalidan el acceso. Los enlaces externos de Google conservan su tratamiento y no se copian ni borran automáticamente. Los permisos temporales de subida emitidos antes del cambio deben prepararse otra vez; los recibos de solicitudes ya confirmadas siguen siendo idempotentes.

Antes del despliegue habrá que provisionar y configurar el bucket de plataforma sin caducidad de objetos vigentes. Tras eso, migrar los archivos antiguos sería un trabajo separado: inventario, copia verificada y cambio de referencia, conservando el origen hasta comprobar el destino. Este incremento no lo ejecuta. La aceptación local utiliza tres buckets ficticios en el mismo servidor HTTP y ninguna credencial productiva.

El adaptador nuevo usa direcciones virtual-hosted por defecto; el servidor de prueba activa `PLATFORM_STORAGE_FORCE_PATH_STYLE=true`. No cambia el formato del almacenamiento antiguo. Referencias contrastadas: [direcciones de buckets Railway](https://docs.railway.com/storage-buckets#url-style) y [métodos CORS admitidos por S3](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CORSRule.html). La lista de orígenes permitidos de la plataforma se conserva.

La revisión cruzada reprodujo una carrera entre confirmar y expirar una carga. La transición `VERIFYING → COMMITTED` ahora exige una sesión vigente y sucede dentro de la misma transacción que sustituye archivos, antes de modificar las filas; retiene el bloqueo de sesión hasta commit. Si la limpieza ganó, se conserva el conjunto anterior. La reproducción controlada cubre ambas precedencias, expiración durante verificación y rollback de revisión/historia/archivos. Esa prueba de intercalado es unitaria; la aceptación HTTP/PostgreSQL verifica los recorridos completos, sin simular un despliegue real.

Verificación de esta ampliación:

| Comprobación | Resultado |
|---|---|
| Entregas, almacenamiento y Drive, HTTP/PostgreSQL real | **15/15**, `output/task-piece-delivery/platform-http-final.log`. Incluye tres buckets ficticios, legado, sustitución, copias selladas, concurrencia, privacidad, Drive automático y carga/papelera/restauración manual. |
| Contratos afectados y auditoría PostgreSQL aislada | **129 aprobados, uno omitido**, `platform-regression.log`; después del último ajuste de expiración y direcciones, **57/57** en `platform-core-final.log`. El omitido sigue siendo el clúster histórico 55448, no la nueva aceptación de inmutabilidad. |
| Drive en navegador con respuestas ficticias | **6/6**, `output/drive-deliverables/browser-final.log`: permisos, regreso, nombres largos/móvil, temas y ausencia de descargas automáticas de archivos grandes. |
| Aplicación completa | **1/1**, `output/drive-deliverables/real-final.log`: entrega, PDF, reemplazo, árbol, descarga nombrada, regreso, carpeta manual y subida. `walkthrough/verification.json` registra el conjunto ficticio y `drivePath`. |
| Construcción y calidad | `platform-build-final.log`, `platform-eslint-final.log`, `platform-dead-code.log` y `git diff --check`, sin errores. La construcción conserva avisos de tamaño de paquetes. |

Las suites HTTP que siembran tareas deben ejecutarse con `--test-concurrency=1`: el primer arranque simultáneo de varios conjuntos chocó en el orden global de tareas durante la preparación; la ejecución secuencial aprobó. Los casos intencionales de confirmaciones concurrentes sí permanecen paralelos dentro de su prueba. Los conteos anteriores se solapan; no representan toda la suite de la plataforma ni certifican almacenamiento remoto.
