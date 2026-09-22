# Aviso de Fireflies: la minuta arranca cuando la transcripción está lista

Cambio del 22 de septiembre de 2026 (ítem A0-9 del [plan de autonomía](BRIA_AUTONOMY_PLAN.md)).

## Qué cambia

Hasta ahora el servidor preguntaba a Fireflies cada diez minutos si había transcripciones nuevas: 144 preguntas al día para encontrar, en un día normal, dos reuniones. Una transcripción podía estar lista y esperar hasta diez minutos a que alguien la mirara.

Ahora Fireflies avisa. Cuando termina de transcribir, envía una notificación a `POST /api/minutes/fireflies/webhook` y el análisis arranca en ese segundo.

Medición que motivó el cambio: la transcripción tarda alrededor de cinco minutos. El retraso entre el fin de una reunión y su minuta era de cinco a quince minutos, así que **nuestra espera era casi la mitad del total**. Una medición anterior de 39 minutos resultó engañosa porque `MeetingMinute.meetingAt` es la hora de **inicio** y la cuenta incluía la duración de la reunión; el diagnóstico añade ahora `lag_after_meeting_ends_since_live`, que suma la duración antes de comparar.

## Versión 2 de los webhooks de Fireflies

La pantalla de configuración de Fireflies usa la **versión 2**, que cambia respecto a la anterior:

| | Versión 1 | Versión 2 |
|---|---|---|
| Identificador de la reunión | `meetingId` | `meeting_id` |
| Tipo de evento | `eventType: "Transcription completed"` | `event: "meeting.transcribed"` |
| Eventos disponibles | uno | `meeting.transcribed`, `meeting.summarized`, `meeting.bot_joined` |
| Firma | `X-Hub-Signature`, HMAC-SHA256 | igual |

El servicio lee **las dos formas**, así que un cambio de versión en Fireflies no rompe la puerta.

Y filtra por evento: **solo `meeting.transcribed` inicia un análisis**. Si en Fireflies se suscriben los tres eventos, los otros dos se responden con `202` y se ignoran. Es importante: analizar cuando el bot entra a la reunión correría contra una transcripción que todavía no existe y gastaría un intento.

La documentación de la versión 2 advierte que **no hay reintentos**: si el endpoint no responde a tiempo o devuelve un código que no sea `2xx`, la entrega se marca como fallida y ya. Por eso respondemos `202` antes de analizar y por eso el barrido periódico sigue siendo necesario.

## Seguridad

La notificación viene de fuera y se trata como dato, nunca como instrucción: lo único que se lee de ella es qué reunión analizar.

- **Firma obligatoria.** HMAC-SHA256 del cuerpo exacto recibido, en la cabecera `x-hub-signature`, comparada en tiempo constante. Se acepta con o sin el prefijo `sha256=`.
- **El cuerpo original se conserva** solo para esa ruta (`verify` de `express.json` en `server.js`): la firma cubre los bytes enviados, no un objeto vuelto a serializar.
- **Sin secreto no hay puerta.** Si `FIREFLIES_WEBHOOK_SECRET` no está configurado, o tiene menos de 16 caracteres, la ruta responde `503` y no procesa nada.
- **Ruta pública a propósito**, como la de Google Calendar: Fireflies no puede autenticarse, la firma es la autenticación. Queda bajo el limitador de peticiones de `/api`.

## Comportamiento

- Responde `202` de inmediato y analiza después. Un webhook que espera al modelo agota su tiempo y Fireflies lo reenvía; un fallo del análisis es nuestro para registrar, no suyo para reintentar.
- **Dos avisos de la misma reunión la analizan una vez.** `syncFirefliesMinuteById` guarda el trabajo en curso por identificador y el segundo aviso se une al primero en vez de empezar otro.
- **La transcripción se descarga una sola vez.** El aviso ya la trae consigo y `processTranscript` la reutiliza en lugar de volver a pedirla.
- Respuestas: `202` aceptado, `401` firma no válida, `400` sin reunión identificable, `503` sin secreto o con secreto corto.
- **Todo rechazo deja rastro.** Cada respuesta que no acepta el aviso escribe una línea `[FirefliesWebhook] Aviso rechazado (<código>): <motivo>` con el motivo en claro (falta el secreto, la firma no coincide, llegó sin cabecera de firma, el cuerpo no identifica una reunión) y un aviso aceptado escribe `Aviso aceptado para la reunión <id>`. El secreto nunca se escribe. Sin esto, una prueba fallida en Fireflies no se puede diagnosticar: la primera prueba real devolvió un error y el servidor no había registrado nada.

## Lo que no cambia todavía

**El sondeo cada diez minutos sigue activo**, a propósito. Es la red de seguridad mientras comprobamos en producción que los avisos llegan. Cuando los registros muestren minutas procesadas por aviso, se sustituye por dos barridos diarios con ventana de fechas y paginación (ítem A0-8). No se quita una red antes de comprobar la nueva.

Tampoco cambia el tiempo de transcripción, que es de Fireflies. Y el aviso solo cubre las reuniones de la cuenta dueña de la clave: según el diagnóstico, 50 de 52 minutas pertenecen a `coordinadorbrainstudio@gmail.com`, así que cubriría el 96 %; el resto lo recoge el sondeo.

## Puesta en marcha

En Fireflies: Integrations → Webhook → Configure.

1. Generar un secreto de 16 a 32 caracteres.
2. Añadirlo en Railway como `FIREFLIES_WEBHOOK_SECRET`.
3. **Webhook URL**: `https://<dominio>/api/minutes/fireflies/webhook`.
4. **Signing Secret**: el mismo secreto. Fireflies lo marca como opcional, pero **aquí es obligatorio**: sin él la ruta responde `503`, porque una puerta sin firma la puede empujar cualquiera.
5. **Event Subscriptions**: basta con `meeting.transcribed`. Si se marcan los otros, se ignoran sin efecto.
6. Usar **Test Webhook** antes de guardar: debe responder `202`. Si responde `401`, el secreto no coincide entre Fireflies y Railway; si responde `503`, falta en Railway.
7. Tras la siguiente reunión grabada, comprobar en los registros la línea `[FirefliesWebhook] Reunión <id> procesada por aviso.`

Hasta el paso 2 la ruta responde `503` y todo sigue funcionando por sondeo, así que el despliegue no depende de la configuración.

## Verificación

`tests/firefliesWebhook.test.js`: firma válida con y sin prefijo y en mayúsculas, firma de otro secreto, firma de otro cuerpo, firma ausente o inventada, secreto ausente y secreto corto, cuerpo sin reunión utilizable, respuesta inmediata con el análisis posterior, y un análisis que falla sin convertirse en un `500`. `tests/automatedMinutes.test.js`: una reunión se procesa sola descargando la transcripción una sola vez, y dos avisos simultáneos la analizan una vez. No se llamó a Fireflies ni a ningún modelo real.
