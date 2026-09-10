# Adjuntos de comentarios — corrección local, 2026-09-10

## Fallo reproducido

Las tarjetas enviaban el ID del comentario y, a veces, el nombre del archivo. Los dos proxies ignoraban ese nombre y usaban el primer `TaskAttachment` del comentario. En registros históricos, tomaban una URL del texto sin identificar la seleccionada. Tres archivos distintos producían los mismos bytes al visualizar/descargar.

Además, una respuesta lenta de una vista previa anterior podía reemplazar una selección más reciente. Las cargas simultáneas podían colisionar cuando coincidían milisegundo y nombre normalizado.

## Comportamiento

- Selección por `attachmentId` validada dentro de tarea/comentario. El visor conserva la URL de descarga correspondiente, sin reconstruirla solo con el comentario.
- Registros históricos: selección por URL ya existente en el comentario. Compatibilidad por nombre exacto únicamente si identifica un archivo inequívoco. Sin selector y con varios candidatos: 409. Selección inexistente: 404. No se sustituye por otro archivo.
- Cabeceras de descarga con nombre Unicode, tipo real y caché privada sin almacenamiento. Una respuesta antigua de vista previa no reemplaza la selección más reciente; se liberan los blobs del visor.
- En tareas existentes, el selector/arrastre mantiene una lista local; Enviar o Ctrl/Cmd+Enter manda el texto enriquecido y los archivos en una solicitud multipart (`file` repetido).
- Máximo 10 archivos y 25 MB totales por mensaje. Validación completa antes de subir; comentario y relaciones en una transacción. Si falla antes de confirmar la persistencia, se intenta limpiar únicamente lo recién subido. Una limpieza fallida se registra. No se borran adjuntos históricos.
- Ante un rechazo, el borrador queda disponible en el panel para reintentar. Esto no implica persistencia del borrador al recargar/cerrar ni idempotencia de reintentos tras una respuesta de red incierta.
- Las tarjetas se apilan en móvil. El contenedor exterior del modal no permite scroll programático: al enfocar el editor o quitar adjuntos solo se desplaza su cuerpo, sin ocultar la cabecera.
- Claves de almacenamiento con UUID para no sobrescribir archivos con igual nombre/milisegundo. No se modifica el esquema ni se renombran archivos anteriores.

## Verificación reproducible

```powershell
node --test tests/taskCommentFiles.test.js tests/taskCommentSend.test.js tests/taskCommentAttachmentLinks.test.js tests/draftAndLightbox.test.js tests/uploadBoundarySecurity.test.js tests/taskPanelCompile.test.js tests/richTextAndEmojis.test.js tests/authRuntimeSecurity.test.js tests/securityBoundary.test.js tests/securityWiring.test.js
node --test tests/browser/taskAttachments.mjs
npm run build
npm run lint
```

Los tests de backend ejecutan los controladores reales con base de datos y S3 sustituidos por dobles en memoria. Los tests de navegador montan los componentes reales, interceptan todas las API y bloquean tráfico externo. Comprueban bytes distintos, descargas desde tarjeta/visor, adjuntos históricos, borrador ante fallo, envío conjunto, respuesta tardía y móvil. Capturas locales en `output/task-attachments/` (no versionadas).

No se accedió a archivos productivos ni se creó un evento, comentario o adjunto en producción. Este cambio local no verifica que los originales de un caso histórico concreto sigan existiendo; eso requiere comprobar ese caso después de publicar. No realizar reparaciones masivas ni resubir originales sin evidencia y autorización.
