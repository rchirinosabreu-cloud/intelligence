# Mensajería de equipo — investigación y propuesta

Fecha: 2026-09-16. Estado: implementación local con API, PostgreSQL e interfaz; sin push ni despliegue productivo. Ver alcance y verificación en `docs/TEAM_CHAT_IMPLEMENTATION.md`.

## Prioridad y alcance solicitado

El usuario prioriza la mensajería sobre el rediseño del mapa virtual. Necesita inicialmente un canal General y la posibilidad de añadir varios canales. Busca organización similar a Slack y facilidad de intercambio similar a WhatsApp: imágenes, archivos, vídeos, audios, grabación de notas de voz y reenvíos.

El mapa y los estados manuales quedan para después. La propuesta del mapa conserva seis zonas, orden y proporciones: Permiso / Juntas / Foco arriba; Producción / Oficina Central / Fuera del escritorio abajo. Sus muestras son independientes de producción.

## Referencias verificadas

| Producto | Capacidad documentada | Aplicación propuesta a Brainstudio |
| --- | --- | --- |
| Slack | Canales, archivos con vista previa, reenvío con nota y clips de voz/vídeo | Organización por conversación, biblioteca del canal y respuestas vinculadas |
| WhatsApp | Grabación pausada/reanudable, escucha previa, reproducción rápida y selección de mensajes para reenviar | Compositor sencillo y notas de voz que se revisan antes de enviar |
| Gather 2.0 | Chat principal con canales públicos/privados, mensajes directos, hilos, adjuntos, reacciones, menciones y búsqueda | Mensajería persistente accesible dentro de la plataforma, independiente del mapa |

Fuentes oficiales:

- [Slack: enviar mensajes y borradores](https://slack.com/help/articles/201457107-Send-and-read-messages).
- [Slack: archivos, vista previa y biblioteca](https://slack.com/help/articles/201330736-Add-files-to-Slack).
- [Slack: grabar clips](https://slack.com/help/articles/4406235165587-Record-audio-and-video-clips-in-Slack).
- [Slack: reenviar mensajes](https://slack.com/help/articles/203274767-Forward-messages-in-Slack).
- [WhatsApp: notas de voz](https://blog.whatsapp.com/making-voice-messages-better).
- [WhatsApp: reenviar mensajes](https://faq.whatsapp.com/887468535575482/?cms_platform=web).
- [Gather 2.0: Chat Overview](https://support.help.gather.town/articles/6847600389-chat-overview).

No se ha verificado en la documentación consultada que Gather ofrezca el mismo grabador de notas de voz que WhatsApp; no atribuirle esa capacidad por inferencia. Su chat de reuniones y su chat cercano son temporales, mientras que el chat principal conserva historial. Para Brainstudio se propone historial persistente.

## Experiencia recomendada

- Sección propia «Mensajes», con canal General inicial. Acceso mediante una burbuja global movible, montada a nivel de layout para seguir disponible al cambiar de módulo. Esta decisión sustituye la propuesta inicial de acceso principal desde el encabezado.
- Escritorio: lista de canales, conversación y detalles plegables. Móvil: conversación a ancho completo y acceso de regreso a la lista.
- Compositor sencillo: escribir, adjuntar, grabar audio y enviar. Pegar imágenes y arrastrar varios archivos, con vista previa antes del envío.
- Audio: iniciar, pausar, continuar, detener, escuchar, descartar y enviar. Duración real y reproducción 1x / 1.5x / 2x. El micrófono se solicita al grabar, nunca al abrir el módulo.
- Imágenes con visor; audio y vídeo con reproductor; documentos con nombre, tamaño y descarga. Los originales conservan su identidad al verlos, descargarlos y reenviarlos.
- Responder a un mensaje con referencia visible y salto al original. Reacciones y menciones. Los hilos laterales completos pueden añadirse después sin cambiar las identidades de mensajes.
- Historial con paginación, búsqueda de texto y nombres de archivos, y sección «Archivos y enlaces». La búsqueda no implica transcripción de audios ni lectura automática de documentos.
- Borradores por canal y usuario. Cambiar de módulo conserva el borrador; cerrar sesión elimina los borradores locales y detiene el micrófono. Advertir antes de perder una grabación todavía no enviada.
- Mensajes pendientes, confirmados y fallidos visualmente distintos. «Enviado» significa persistencia confirmada; «leído» exigiría evidencia aparte y no se deduce de que un usuario esté conectado.

## Acceso flotante y convivencia con el trabajo

Petición del usuario: General siempre accesible mediante una burbuja que se pueda mover, también hacia arriba. Propuesta de interacción, todavía sin implementación:

- Burbuja de aproximadamente 52–56 px, inicialmente abajo a la derecha. Arrastrar permite cambiar de lado o altura; al soltar se acomoda a un borde seguro. Ofrecer también «Mover burbuja» mediante controles accesibles, sin exigir arrastre.
- Recordar posición por usuario y dispositivo; revalidarla al cambiar tamaño, orientación o área visible del teclado. Respetar encabezado, navegación móvil, áreas seguras y acciones principales. Coordinar su ubicación con otros accesos flotantes, incluido Bria, en lugar de superponerlos.
- Un toque abre un panel compacto de conversación junto al borde, sin oscurecer ni bloquear el módulo en escritorio. «Ampliar» abre una vista central; en móvil la conversación ocupa el espacio disponible con cierre accesible y compositor sobre el teclado. Evitar un panel pequeño que obligue a escribir en un espacio estrecho.
- Opción adicional solicitada: acoplar el chat a la derecha. Arrastrar el encabezado del panel hacia el borde muestra una previsualización y, al soltar, reserva una columna propia; la aplicación se reajusta al ancho restante. Ofrecer también «Acoplar a la derecha» y «Volver a flotante» sin exigir arrastre. Mantener separados el movimiento de la burbuja y el acoplamiento de la conversación.
- El diseño responsive debe responder al ancho real del área de trabajo, no solo al ancho total de la ventana: revisar navegación, tablas, calendarios y controles al reservar el lateral. Si no caben cómodamente las dos vistas, mostrar el chat en una vista amplia y restaurar la preferencia de acoplamiento al recuperar espacio. Minimizar devuelve todo el ancho al módulo sin perder el borrador; navegar conserva el acoplamiento. El ancho de 340 px y el umbral de la muestra son ilustrativos, sujetos a verificación de los módulos reales.
- Minimizar conserva canal, borrador, adjuntos pendientes y posición de lectura. Cambiar de módulo conserva la misma instancia global. Al cerrar sesión, eliminar contenido local de la cuenta y detener el micrófono. Una grabación activa o subida en curso necesita un indicador persistente y controles explícitos; nunca ocultar una captura activa ni cancelarla silenciosamente al navegar.
- General es el destino inicial. Si después existen más canales, la burbuja abre la conversación reciente y mantiene General accesible. La página «Mensajes» y el panel son dos vistas de la misma conversación, no chats distintos; evitar duplicarlas al ampliar o entrar al módulo.
- Mensajes nuevos actualizan un contador discreto y exacto. No abrir el chat automáticamente, desplazarlo, hacerlo rebotar ni reproducir sonidos por defecto. Silenciar modifica los avisos del canal sin borrar mensajes ni marcar contenido como leído. Distinguir menciones dentro de las preferencias.
- El contador se actualiza al verificar mensajes efectivamente visibles con la ventana activa, nunca solo al pulsar la burbuja. Una acción que abre un mensaje desde una notificación debe llevar al canal y mensaje correctos.
- Formularios críticos, confirmaciones, grabaciones y otras capas tienen prioridad coordinada. El chat no toma foco ni se sitúa encima de diálogos activos. Minimizar devuelve el foco al acceso; ampliar coordina foco, Escape y teclado sin interferir con el módulo.

Muestra local del comportamiento: `C:/Users/chrod/.codex/visualizations/2026/09/07/01a07d8a-5714-70d0-9daa-8877ba1e6680/chat-burbuja.html`. Conversación ficticia; permite mover, minimizar, ampliar, cambiar de módulo y conservar un borrador dentro de la muestra. No implementa envío real, notificaciones, persistencia entre recargas ni grabación. La persistencia productiva continúa pendiente.

Ampliación con acoplamiento lateral y reajuste del área de trabajo: `C:/Users/chrod/.codex/visualizations/2026/09/07/01a07d8a-5714-70d0-9daa-8877ba1e6680/chat-acoplable.html`. También es una propuesta local, no una verificación de todos los módulos productivos.

## General primero, varios canales disponibles

General debe ser una instancia del mismo sistema de canales, no un chat especial que haya que sustituir posteriormente. Propuesta: el equipo activo participa en General; un admin puede crear los siguientes canales, asignar miembros y archivarlos. La creación inicial automática se limita a General.

Cada mensaje, archivo, respuesta, permiso y posición de lectura pertenece a un canal desde el primer bloque. Canales privados se validan en backend también para búsquedas, descargas, notificaciones y eventos en tiempo real. Archivar conserva el historial; no usar eliminación de canales como gestión cotidiana.

Los reenvíos muestran una selección de destinos autorizados y el rótulo «Reenviado», con nota opcional. Con un único canal no se ofrece un destino ficticio. Al crear otro canal, el mismo mecanismo admite texto y adjuntos. Seleccionar varios mensajes mantiene orden e identidad de cada uno.

El reenvío de material privado a una audiencia más amplia exige mostrar el destino y revalidar permisos; no basta con pegar una URL del almacenamiento. Se deberá definir qué contenido está permitido compartir fuera del canal de origen. El rótulo no debe revelar nombres de canales o participantes privados a quienes no tienen acceso. No implica sincronizar conversaciones de WhatsApp.

## Evidencia del código actual

Revisión de código local; no prueba de entrega ni inspección de mensajes productivos.

- `prisma/schema.prisma`: `GeneralChatMessage` guarda ID, contenido, autor y fecha; no modela canal, adjunto, reenvío o lectura.
- `src/services/generalChatService.js`: recupera 50 mensajes recientes, sin cursor para anteriores. Esto limita la consulta, no demuestra que el resto se haya borrado.
- `src/components/modules/ChatWidget.jsx`: texto, enlaces y menciones; polling de 10 segundos abierto y 60 segundos cerrado; no graba audio ni adjunta medios en este flujo.
- `src/components/modules/FlowWidget.jsx`: reutiliza ese componente para el chat de cliente. Es la instancia encontrada en componentes; no asumir que el chat General ya tiene una pantalla global operativa.
- `src/components/layout/AppLayout.jsx`: una mención general dispara `open-general-chat`; el nuevo módulo debe tener un receptor global y navegar al mensaje concreto, incluso desde otro módulo.
- `src/controllers/flowController.js`: `addGeneral` guarda el mensaje y luego procesa notificaciones dentro del mismo `try`. Si una notificación falla después de guardar, puede devolver 500 para un mensaje existente. Un reintento no tiene clave de idempotencia y puede crear otro registro.
- `src/services/s3Service.js`: carga mediante buffer y valida 25 MB. No aumentar ese límite global para implementar vídeo; el nuevo flujo necesita su propia política y carga que no acumule todos los archivos en RAM.
- `src/services/storageService.js`: existe infraestructura de almacenamiento y URLs firmadas en otros módulos. Su autorización por cliente y nombres de objetos no se reutilizan como permisos de chat.
- `src/services/pushNotificationService.js`: hay infraestructura push y preferencias. General necesita destino explícito al canal/mensaje y preferencias de chat, evitando clasificarlo accidentalmente como tarea.
- La búsqueda realizada no encontró un transporte de chat persistente por WebSocket. El SSE encontrado corresponde al proxy de IA y no demuestra disponibilidad de mensajería en tiempo real.

## Base necesaria para una entrega fiable

1. Clave estable de envío generada antes de subir y conservada al reintentar; unicidad por autor/solicitud y huella del contenido en servidor. Deduplicar tanto la respuesta HTTP como los eventos recibidos.
2. Persistir mensaje, relaciones de archivos y evento de salida en una transacción. La notificación se procesa con reintentos independientes: su fallo no convierte un mensaje guardado en «no enviado».
3. Reconexión con cursor y lectura de cambios persistidos, además del transporte en tiempo real. No depender exclusivamente de eventos en memoria ni del contador de mensajes cargados.
4. Claves de archivo únicas, carga por etapas, validación de tamaño/tipo real y pertenencia del borrador antes de asociar adjuntos. Limpiar únicamente cargas huérfanas de ese flujo, con período de gracia.
5. Autorizar cada descarga/vista previa por identidad del archivo y canal. Soportar solicitudes de rango para reproducción de vídeo/audio y conservar el nombre original de descarga.
6. Revalidar cuenta y miembro activos, usando `teamRosterService.js`; una baja revoca lecturas, publicaciones y suscripciones activas sin borrar autoría histórica.
7. Al migrar General, conservar IDs o un mapeo explícito, autores, fechas y mensajes. Migración aditiva e idempotente y comprobación de conteos/huellas. Las rutas antiguas deben converger en una única fuente, sin doble escritura permanente.
8. Conservar la independencia del chat de cliente y de los comentarios de tareas durante este primer bloque. Compartir enlaces a tareas no duplica sus comentarios ni altera sus permisos.

## Audio, vídeo y límites

La experiencia debe funcionar en ordenador y móvil. La grabación requiere permiso y un contexto seguro; el formato de grabación se debe negociar con el navegador. `MediaRecorder.isTypeSupported` comprueba capacidad declarada, no certifica grabación o reproducción entre dos dispositivos.

- [MDN: permiso y captura de micrófono](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- [MDN: formatos de grabación](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

Hay que verificar Safari/iPhone, Chrome/Android y escritorio con archivos reales, incluyendo notas de voz y vídeos procedentes de teléfono. Si un formato requiere conversión para reproducirse, mantener el original y generar una derivada; no presentar una descarga como una vista previa exitosa. No prometer compatibilidad universal con todos los formatos.

Propuesta inicial para dimensionar, todavía no validada en infraestructura ni aprobada como política: hasta 10 adjuntos por mensaje, 100 MB por archivo, 250 MB por lote y 5 minutos por nota grabada. Validar estos valores con las cargas habituales del equipo antes de fijarlos. Los mensajes de error deben indicar el límite antes de iniciar la subida. No modificar el límite de adjuntos de tareas de 25 MB por este trabajo.

Los archivos grandes requieren progreso, cancelación y recuperación de interrupciones. No comprimir originales silenciosamente. Validar extensiones y tipo real; los formatos ejecutables/activos no se habilitan por interpretar «todo» de forma literal.

## Orden de construcción propuesto

1. Base de canales + General + conservación del historial + texto en tiempo real + reconexión/idempotencia + no leídos y acceso global.
2. Imágenes, documentos, vídeos y audios adjuntos + grabador de voz completo + vistas previas/descargas + búsquedas y biblioteca de archivos.
3. Creación/archivo de canales y miembros + reenvío individual/múltiple + respuestas y reacciones + notificaciones configurables.

Los tres bloques constituyen la primera entrega de la experiencia solicitada. No presentar el primer bloque de texto como finalización de audio/vídeo/reenvíos. Los canales forman parte del modelo desde el bloque 1, aunque la administración se exponga en el 3.

Mensajes directos, hilos laterales avanzados, transcripción de audios, resúmenes con Bria y llamadas quedan como extensiones posteriores propuestas. La reproducción de audio mientras se navega por otros módulos puede añadirse sobre un reproductor global; no prometer grabación continua con el teléfono bloqueado.

## Criterios para validar la primera entrega

- Dos usuarios reciben el mismo mensaje una sola vez; pérdida de conexión después de guardar y reintento no lo duplican.
- Un fallo de notificaciones no elimina el mensaje ni induce un segundo envío.
- Recarga y cambio de módulo conservan historial/posición/borrador según contrato; el audio se puede escuchar antes de enviarlo y cancelar nunca publica.
- Fotos, documentos, audios y vídeos se visualizan o descargan con su identidad correcta; archivos con nombre repetido no se sustituyen.
- Más de 50 mensajes siguen disponibles por paginación y búsqueda, sin filtrar permisos después del límite.
- Crear un segundo canal y reenviar varios mensajes conserva el orden, adjuntos y rótulo; no publica en otro destino ante un error o permiso revocado.
- Canales privados y archivos quedan inaccesibles al retirar miembros o desactivar cuentas; una URL conocida no evita la comprobación.
- No mostrar un mensaje como leído sin evidencia de visualización; silenciar un canal y cambiar preferencias se respetan.
- Verificación visual en claro/oscuro y móvil; pruebas reales con dos sesiones y PostgreSQL/almacenamiento aislados. No crear mensajes de prueba en producción.

## Decisiones a cerrar antes de publicar

Límites de archivo según uso real, navegadores objetivo, política de retención y quién puede compartir contenido de canales privados. La recomendación inicial es conservar el historial, creación administrativa de canales y acceso únicamente para el equipo interno activo. Estas recomendaciones no cambian permisos productivos por sí mismas.
