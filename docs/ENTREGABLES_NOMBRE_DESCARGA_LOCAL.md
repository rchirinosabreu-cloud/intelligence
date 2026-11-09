# Nombre de las descargas de entregables

9 de noviembre de 2026. Corrección validada en local; Rodny autorizó su fusión. El despliegue conserva su aprobación habitual.

Rodny reportó un vídeo compartido con un UUID como nombre. La carga nativa conserva `file.name`/`originalname`. La galería interna reproduce bytes autenticados mediante una URL blob; la descarga nativa del reproductor puede tomar el UUID de esa URL. Esto explica el patrón observado, pero no se inspeccionó el archivo productivo ni se reconstruyó su envío por WhatsApp.

La galería compartida por Parrillas, la consulta de pieza desde Gestión y las entregas internas ofrece ahora el botón de descarga existente también a las piezas nativas. Solicita los bytes con la autorización vigente y asigna el nombre registrado al archivo descargado. El reproductor declara `controlsList="nodownload"` para retirar su opción de descarga de blobs. Los enlaces externos de Drive conservan su recorrido.

Si falta el nombre en un legado, se usa el título disponible, posición cuando hay varios archivos y extensión según MIME conocido; nunca se usa la clave de almacenamiento. No se alteran nombres registrados, bytes, permisos, entregas ni historial. La descarga por el botón está cubierta; menús contextuales y clientes externos dependen del navegador y no son un control de seguridad.

## Verificación

`node --test tests/finalAssetDownloadName.test.js tests/contentFinalAssetDelivery.test.js tests/contentFinalDelivery.test.js tests/taskDeliverableClient.test.js tests/finalAssetOrder.test.js tests/browser/finalAssetDownload.mjs`

27 pruebas: nombre original y Unicode, legado sin nombre, descarga real y bytes, entrega interna, autorización, fallo 403 sin descarga y reintento, además de contratos de carga y orden existentes. El recorrido monta el componente real con una API simulada y un vídeo ficticio generado por FFmpeg; no usa base de datos ni almacenamiento real. Requiere Chrome y FFmpeg locales.

Capturas claro, oscuro y móvil: `output/final-asset-download/`. La prueba falló inicialmente porque la pieza nativa no tenía botón de descarga. No se verificó el envío posterior por WhatsApp.
