# Chat de equipo

Implementación local, 16 de septiembre de 2026. No desplegada. La investigación original está en `TEAM_CHAT_PLAN.md`; las muestras HTML de la etapa de diseño no son el componente productivo.

## Comportamiento construido

- Burbuja global movible, conversación flotante, ampliada o fijada a la derecha. «Desfijar» devuelve la conversación al modo flotante. El escritorio reserva 360 px desde 1280 px de viewport; en anchos menores el panel flota. En teléfono ocupa la pantalla y tiene cierre visible, safe area y altura del viewport visual.
- La sugerencia al arrastrar aparece únicamente cuando el puntero entra en los últimos 24 px del borde derecho. Moverse cerca de los otros bordes no fija el chat.
- La instancia pertenece a AppLayout y se conserva entre módulos. Posición, modo y canal se restauran al recargar durante la sesión. Borradores por usuario/canal en sessionStorage y archivos pendientes en IndexedDB. Cerrar sesión elimina los borradores; cerrar el panel detiene la grabación y conserva el audio como adjunto pendiente.
- General para el equipo activo; admins pueden crear canales públicos/privados, gestionar miembros y archivar canales conservando historial. Un admin sin pertenencia a un canal privado no tiene acceso implícito a su contenido.
- Texto enriquecido y pegado de negrita/cursiva/subrayado, enlaces HTTP(S), menciones, respuestas, reacciones, edición y eliminación de mensajes propios, selección y reenvío de hasta 20 mensajes. El contenido privado no se reenvía a un destino con personas sin acceso.
- Enter envía y Shift+Enter añade salto de línea. Enter conserva la elección de menciones y no envía borradores vacíos ni confirmaciones IME. La barra del chat permanece visible, sin botón A, y ofrece solo negrita, cursiva, subrayado, resaltado y bullets; los editores de otros módulos mantienen su configuración.
- La confirmación de eliminación usa el Button destructivo compartido; no mezcla el hover neutro de acciones secundarias con el rojo global. Capturas de hover claro/oscuro y barra fija móvil en `output/team-chat/`.
- Doble clic en un mensaje activa Responder, muestra la cita y enfoca el editor. En táctil, un deslizamiento hacia la derecha de al menos 64 px hace lo mismo; desplazamiento vertical, movimiento corto/izquierdo, cancelación, selección de mensajes, enlaces y controles quedan excluidos.
- Archivos, imágenes, vídeo y audio; previsualización bajo demanda y descarga. Se conservan identificadores de archivo, incluso cuando tienen el mismo nombre. Máximo 10 archivos por mensaje, 100 MB por archivo y 250 MB por envío. Se rechazan ejecutables/HTML activos conforme al validador compartido; no prometer almacenamiento ilimitado ni reproducción de todos los códecs.
- Cada adjunto muestra Ver y Descargar. PDF se renderiza localmente con el visor compartido (hasta 25 MB); texto/CSV/JSON/Markdown/XML/YAML como texto literal (hasta 2 MB), sin ejecutar markup ni enviar archivos a servicios externos. Formatos sin visor y documentos mayores conservan descarga con explicación explícita. El visor descarga la misma identidad de adjunto.
- Notas de voz mediante MediaRecorder: pausar, continuar, escuchar, descartar y enviar; límite de grabación de cinco minutos, negociación de formato y liberación del micrófono. Reproducción 1×/1,5×/2×.
- Historial por páginas de 50, sin límite total de 50 mensajes. Búsqueda por texto/nombre de archivo y vista Archivos y enlaces. Sin transcripción ni indexación del contenido interno de documentos.

## Persistencia y entrega

`GeneralChatMessage` continúa siendo la fuente única. La ampliación añade columnas y tablas, conserva IDs/autores/fechas/textos y asigna el historial a General. La normalización al leer permite mensajes históricos más largos que el límite de escritura actual.

Las escrituras se confirman después del COMMIT. Request ID + actor + huella impiden duplicados por reintento. Ante una respuesta incierta, el envío mantiene el mismo contenido e identidad hasta confirmar; no se inventa éxito ni se vacía el borrador. La interfaz combina respuestas HTTP y eventos por ID/versión. El borrado quita texto, reacciones y acceso a adjuntos del mensaje original; las copias reenviadas son mensajes independientes.

SSE usa autenticación Bearer, un registro durable de eventos, NOTIFY después del commit, cursor de reconexión y sondeo de respaldo de dos segundos. Los eventos se ordenan con bloqueo transaccional para evitar que una secuencia adelantada oculte un commit tardío. Las sesiones/canales se revalidan durante el stream. No se afirma latencia cero: depende de conexión y disponibilidad del servidor.

Las menciones y su trabajo de push se guardan junto con el mensaje. La entrega push revalida pertenencia, visibilidad y silencio; fallos de entrega no duplican mensajes. Los mensajes sin leer no se marcan leídos solo por abrir el chat: se reportan cuando están visibles en una ventana activa.

Con el chat cerrado, la burbuja muestra el total de mensajes sin leer de los canales accesibles, actualizado por el stream (máximo visual 99+). La lista muestra el contador de cada canal. No abre el panel automáticamente ni emite sonido por cada mensaje; silenciar avisos no borra el contador.

Los archivos se cargan a claves únicas del almacenamiento ya configurado. El servidor entrega cada adjunto según mensaje + attachmentId + sesión + permiso vigente. Los tickets temporales usan una clave derivada distinta a la de login: no sirven como sesiones de plataforma. Soporte HTTP Range para reproducción. Los objetos preparados sin mensaje durante más de 24 horas se limpian con un estado de exclusión que impide adjuntarlos mientras se eliminan.

## Arranque y despliegue pendiente

`npm start` ejecuta `scripts/ensure-team-chat-schema.js` antes de generar Prisma y arrancar el servidor. Es aditivo, idempotente y transaccional; no sustituir por `prisma db push --accept-data-loss`. Mantener backend/esquema preparados antes de servir el frontend nuevo. No se cambió CORS, proveedor PostgreSQL ni Task.completedAt.

Requiere las variables existentes DATABASE_URL, JWT_SECRET y AWS_ENDPOINT_URL/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_S3_BUCKET_NAME. No se han modificado variables ni almacenamiento productivo. El proxy debe permitir SSE sin buffering y cargas de hasta 100 MB; confirmar estos límites en la infraestructura al desplegar. Las rutas generales antiguas se dirigen al servicio nuevo; una escritura antigua sin requestId recibe un error de actualización, no un envío sin deduplicación.

## Verificación reproducible

Resultado local final: 68 pruebas aprobadas, sin fallos ni omisiones; compilación de producción y lint del alcance sin errores. La prueba de montaje restaura el panel abierto antes de recibir los canales en React/jsdom. Las pruebas de interacción ejecutan los componentes reales y comprueban Enter/Shift+Enter/IME, formatos, gestos de respuesta, foco, citas y la identidad compartida por vista previa/descarga.

En la revisión posterior en navegador se confirmó PDF renderizado, descarga independiente, envío con Enter, salto con Shift+Enter, doble clic con cita/foco y la zona de fijación estrecha. Capturas `ajustes-desktop.png` y `ajustes-mobile-respuesta.png` en `output/team-chat/`. El deslizamiento táctil tiene prueba de eventos Pointer en React/jsdom; falta comprobarlo en un teléfono físico.

Las pruebas reales usan exclusivamente `TEST_DATABASE_URL` en el clúster aislado `127.0.0.1:55448/recognition_test`, usuario `recognition_test`. Crean y eliminan solamente un esquema aleatorio `chat_test_<uuid>` propio. Nunca cargar `.env` productivo para estas pruebas.

```powershell
$env:TEST_DATABASE_URL='postgresql://recognition_test@127.0.0.1:55448/recognition_test'
node --test tests/teamChat*.test.js tests/sharedSelectContract.test.js tests/officialTeamRoster.test.js tests/editorFormatting.test.js tests/richTextAndEmojis.test.js
node scripts/preview-team-chat.js
```

La muestra aislada se abre en `http://127.0.0.1:4318/tests/fixtures/team-chat.html`; `?actor=luis` abre la segunda cuenta ficticia. Renderiza el componente real y usa las rutas reales/PG real, con autenticación de prueba limitada a dos actores y almacenamiento de prueba en memoria. No confundirlo con prueba de OAuth/login ni con el bucket de producción.

Se verificaron en navegador: envío y recepción automática entre dos sesiones, creación de canal, fijar/desfijar, cierre móvil, edición, reacciones, carga de archivo y reenvío; vistas clara/oscura a 390×844. Capturas locales en `output/team-chat/`. Las pruebas de backend comprueban concurrencia de reintentos, historial superior a 50, revocación, adjuntos por identidad, bytes y rangos HTTP, tickets no válidos como login, recuperación por cursor, menciones únicas y limpieza de cargas abandonadas.

Límites de la evidencia: MediaRecorder se prueba con dispositivos simulados; falta validar permiso, grabación y teclado en teléfonos físicos Safari/Chrome. La muestra local y los dobles de almacenamiento no certifican el proxy, micrófono físico, bucket, push ni entrega en producción. Esa comprobación se hace tras publicar; no se enviaron mensajes de prueba a personas reales.
