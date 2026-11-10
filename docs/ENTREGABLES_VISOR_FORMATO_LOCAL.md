# Visor completo de entregables y estado de carga

9 de noviembre de 2026. Cambios validados en local; Rodny autorizó fusionarlos junto con las mejoras de Comercial. El despliegue conserva su aprobación habitual.

El ojo de la galería compartida abre el archivo en el diálogo existente, por encima de la tarea y la consulta de pieza. Vídeos e imágenes conservan su proporción real; un vídeo 9:16 no se recorta ni se estira para llenar la pantalla. El tamaño visible se ajusta al espacio disponible, sin modificar la resolución del archivo. La miniatura también usa `object-contain`.

La tarjeta y la ventana comparten la misma carga autenticada y URL temporal. Abrir o cerrar el ojo no solicita otra copia. Abrirlo pausa el vídeo de la tarjeta; cerrar detiene el ampliado y devuelve el foco al ojo. Se conserva la posición cuando el archivo informa una duración finita. El arrastre del visor no reordena las tarjetas. Los enlaces externos de Drive mantienen su reproductor propio.

La espera muestra «Cargando vídeo…» o «Cargando imagen…». Los errores de red/acceso y los de decodificación aparecen con reintento y opción de descarga. Al cambiar la fuente, los bytes anteriores dejan de mostrarse inmediatamente. Desmontar la tarjeta o reintentar cancela la petición anterior y libera su URL. Los archivos que no son imágenes/vídeos no se descargan para producir una miniatura genérica. Se conserva la descarga con nombre original.

## Límites

La reproducción todavía espera a recibir el archivo completo. Este incremento no implementa streaming progresivo, conversión de códecs, portadas de servidor ni una caché global entre aperturas de tareas. Cerrar y reabrir una tarea vuelve a comprobar el acceso y solicitar el archivo. No se alteran datos, tiempos, entregas, permisos ni almacenamiento. No se inspeccionaron los archivos reales de las capturas.

## Prueba local

`node scripts/preview-final-media.mjs`: muestra ficticia en `http://127.0.0.1:3855`, con componentes reales. Requiere FFmpeg y Chrome locales para las pruebas.

`node --test tests/browser/finalMediaPreview.mjs tests/browser/finalAssetDownload.mjs tests/contentFinalAssetDelivery.test.js tests/contentFinalDelivery.test.js tests/finalAssetOrder.test.js tests/finalAssetDownloadName.test.js tests/taskDeliverableClient.test.js tests/deadCodeAudit.test.js`

El recorrido comprueba 9:16 y 16:9, móvil, claro/oscuro, foco y Escape conservando la tarea, pausa del reproductor inferior, ausencia de peticiones al abrir el ojo o renderizar de nuevo, carga lenta, cancelación al desmontar, error HTTP/reintento, vídeo inválido, cambio de fuente y descarga con nombre. Capturas y resultados en `output/final-media-preview/`.
