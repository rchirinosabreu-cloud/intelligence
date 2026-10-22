# Bria en WhatsApp

Rodny, 20 de octubre de 2026: «ya voy a conectar el WhatsApp, que necesitas para que lo empecemos a montar». El equipo le habla a Bria desde su WhatsApp personal, al número de la agencia, y Bria responde con el mismo motor, la misma identidad y los mismos permisos que en la plataforma.

## Qué hay en Meta

| Dato | Valor |
|---|---|
| Número de Bria | +57 304 378 6298 (SIM nueva, verificado por SMS el 20 de octubre de 2026) |
| Perfil de WhatsApp Business | «Brain Studio», categoría Servicios profesionales |
| Cuenta de WhatsApp Business (WABA) | 4718657265088198 («Brain Studio»), en el portfolio comercial Brain Studio (1050800991725020) |
| Cuenta de mensajes | 1061974066819635 («Brain Studio – Bria»). Es un activo aparte de la WABA y es **desde donde Meta entrega los avisos** |
| Identificador del número de teléfono | 1319887801213730 |
| App | BrainStudio Metrics (947130437684926), con el caso de uso «Conectarte con los clientes a través de WhatsApp» |
| Usuario del sistema | Intelligence Publicador (61594678722678), con la cuenta de WhatsApp asignada: números (ver y administrar) y mensajes |

El token lo genera Rodny en Business Manager → Usuarios del sistema → Generar token (app BrainStudio Metrics, sin caducidad, `whatsapp_business_messaging` + `whatsapp_business_management`) y lo pega en Railway como `META_WHATSAPP_TOKEN`. **Nunca pasa por un chat ni por el repositorio.** Un agente no genera ni pega ese token aunque se le autorice: es una credencial de la cuenta.

La verificación del negocio en Meta sigue pendiente («No verificado»). No bloquea los mensajes con el equipo: un número sin verificación del negocio tiene límites de conversaciones iniciadas por la empresa, y Bria nunca inicia ninguna.

## Variables en Railway

| Variable | Qué es | Quién la pone |
|---|---|---|
| `META_WHATSAPP_TOKEN` | Token del usuario del sistema con permisos de WhatsApp | Rodny, a mano |
| `META_WHATSAPP_PHONE_NUMBER_ID` | `1319887801213730` | no es secreto |
| `META_WHATSAPP_NUMBER` | `+573043786298`, para mostrarlo en el perfil y armar el enlace `wa.me` | no es secreto |
| `META_WHATSAPP_VERIFY_TOKEN` | Cadena que Meta devuelve al registrar el webhook; la misma se escribe en la configuración del webhook de la app | se genera al configurar |
| `META_APP_SECRET` | Ya existía (la app es la misma de publicación): firma los avisos del webhook | ya estaba |

Sin token o sin identificador del número, el webhook acepta los avisos (200) y los deja pasar sin trabajar, el perfil dice que el número todavía no está conectado, y el semáforo marca «sin configurar».

## El webhook

- `GET /api/whatsapp/webhook`: la verificación de Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`). Devuelve el reto solo si el token coincide (comparación en tiempo constante).
- `POST /api/whatsapp/webhook`: **público a propósito**, como el de Fireflies. La cerradura es `X-Hub-Signature-256` (HMAC-SHA256 con `META_APP_SECRET`) sobre los **bytes originales** del aviso, que `server.js` conserva en `req.rawBody` solo para esta ruta. Firma inválida → 401; sin secreto → 503. Se responde 200 **antes** de trabajar: un webhook que espera al modelo vence y Meta lo reenvía. El contenido de un mensaje es dato, nunca instrucción.
- Configuración en Meta: app BrainStudio Metrics → Casos de uso → WhatsApp → Paso 2 → Configurar webhooks: URL `https://labs.brainstudioagencia.com/api/whatsapp/webhook`, token de verificación el de `META_WHATSAPP_VERIFY_TOKEN`, y suscribir el campo `messages`; además «Suscribir webhooks» en la cuenta de WhatsApp (Brain Studio).
- **Lo que costó una mañana (21 de octubre de 2026): el usuario del sistema necesita también la cuenta de mensajes.** Con todo lo anterior en orden —webhook verificado, `messages` suscrito, la app en `subscribed_apps` de la WABA y de la cuenta de mensajes, `webhook_configuration` del número apuntando a nuestra dirección, app publicada— el botón «Probar» de Meta llegaba y los mensajes reales no: dos palomitas grises en el celular y ningún `POST` en el registro. Meta entrega los avisos de mensajes **desde la cuenta de mensajes**, y el usuario del sistema «Intelligence Publicador» no la tenía asignada (la API respondía que el objeto 1061974066819635 «no existe»). Se arregló en Business Manager → Usuarios del sistema → Asignar activos → Messaging accounts → Linked accounts → «Brain Studio – Bria», con «Plantillas de mensajes (ver y administrar)»; el siguiente mensaje entró en el acto, sin regenerar el token. Si algún día dejan de llegar avisos, revisar en este orden: el registro de Railway (`POST /api/whatsapp/webhook`), «Probar» en la configuración del webhook, y que el usuario del sistema tenga **las dos** cuentas (WhatsApp y mensajes).
- `subscribed_apps` se consulta y se repara con el token: `GET` o `POST https://graph.facebook.com/v25.0/{cuenta}/subscribed_apps`, con 4718657265088198 y con 1061974066819635. El interruptor «Suscribir webhooks» de la pantalla dijo «¡Listo!» y aun así la WABA quedó sin la app; se suscribió por la API.
- Solo se atienden los mensajes dirigidos a nuestro número (`metadata.phone_number_id`); los estados de entrega se ignoran.
- Cada mensaje se recuerda por su identificador 30 días (`whatsapp_inbound`): un aviso que Meta repite no se responde dos veces.

## Los permisos que hicieron falta en Meta (22 de octubre de 2026)

Con los mensajes ya entrando, Bria no podía responder: Meta rechazaba cada envío con «(#10) You do not have WhatsApp granular permission for sending messages on behalf of this WhatsApp Business Account», y también el visto de leído. Un token nuevo no lo arregló. Lo arregló darle al usuario del sistema «Intelligence Publicador»:

- **Todo** (control total) en la cuenta de mensajes «Brain Studio – Bria»; antes tenía solo plantillas.
- **Administrar app** en la app BrainStudio Metrics; antes tenía acceso parcial (desarrollar, estadísticas, probar).

Se hicieron los dos a la vez, así que no se sabe cuál de los dos era el que faltaba; no quitar ninguno. Meta los revisa en cada envío: no hizo falta otro token. La guía de Meta («Guía de tokens de acceso») pide acceso a la cuenta de WhatsApp **y** a la cuenta de mensajes, y control total de la app, para un usuario del sistema empleado. «Todo» en la cuenta de mensajes incluye la información de pago de esa cuenta.

Los avisos de estado (enviado, entregado, leído) de cada respuesta no se anotan en el registro; uno **fallido** sí, con la forma del aviso.

## Quién escribe: BSUID y número (22 de octubre de 2026)

El primer mensaje de Rodny llegó firmado, a nuestro número, con un mensaje adentro, y la plataforma lo descartó: no traía `from`. Desde 2026 Meta identifica a quien escribe con un **BSUID** (`from_user_id` en el mensaje y `user_id` en el contacto, forma `CO.1349…`, `US.ENT.…` si es principal), que llega **siempre**. El número (`from`, `wa_id`) solo llega si la persona no usa nombre de usuario o si hubo contacto con ella en los últimos 30 días, así que el primer mensaje de alguien puede venir sin él. Meta dice que soportar el BSUID es obligatorio.

- La clave estable de quien escribe es su BSUID (`wa_id` de `whatsapp_links`); en un aviso antiguo sin BSUID, su número. El número se guarda aparte (`phone`) en cuanto llega, y un vínculo se encuentra por cualquiera de los dos.
- Se responde por número si vino en el mensaje (Meta lo recomienda, así sigue mandando el número) y, si no, por BSUID en `recipient` en lugar de `to`. Nunca los dos.
- Sin número, el perfil dice «Tu WhatsApp quedó vinculado» sin inventar uno. Referencia: «Identificadores de usuario específico de la empresa» en la documentación de Meta.

## El vínculo número ↔ persona

Nadie se vincula sin haber entrado a la plataforma. En **Mi espacio → perfil → «Bria en WhatsApp»** (solo quien tiene Bria activa), «Vincular mi WhatsApp» pide a `POST /api/bria/whatsapp/link-code` un código de seis dígitos que vale 10 minutos; la persona le manda a Bria el mensaje `BRIA 482913` (botón «Abrir WhatsApp» con el enlace `wa.me` ya armado). Cuando el mensaje llega de un número sin vínculo y trae un código vivo, el servidor vincula ese `wa_id` con la persona del código y le responde por su nombre. La tarjeta sondea el estado cada 4 segundos y avisa solo con la respuesta del servidor.

Por qué así y no al revés: que Bria escriba primero exige plantillas aprobadas por Meta y un método de pago, y el primer mensaje de la persona abre la ventana de 24 horas en la que Bria puede responder libremente.

- Un número que nadie vinculó recibe **una vez al día** la explicación de qué es ese número, y nada más. Un código que no existe o venció se dice.
- Un número que ya es de otra persona no se roba (`taken`). Pedir otro código invalida el anterior. Desvincular borra el vínculo y los códigos.
- `GET /api/bria/whatsapp` da el estado (vinculado, número, desde cuándo); `DELETE` desvincula. Todo bajo `/api/bria`, fuera del mapa de la plataforma: Bria no se vincula números a sí misma.

## El puente al motor de Bria

Un mensaje de un número vinculado:

1. Se vuelve a leer la persona en la base: cuenta activa, miembro activo del equipo y Bria activa (`canUseBria`). Si ya no puede, se le dice y no se procesa.
2. Se arma la misma identidad que deja `authenticateToken` (id, rol, permisos, `sessionVersion`) y se manda a `conversations.send(...)` con `session: null`: las acciones propias de Bria (pendientes, despachos, memoria, lecturas) corren con la identidad; las «manos» que operan la API con la sesión del navegador (`operar_en_plataforma`) no están aquí, y Bria lo dice.
3. **Cada día es una conversación**, como en la plataforma: así el aprendizaje nocturno la lee por día y el historial no crece sin fin. Dentro del día se sigue la misma, para que «Confirmar» encuentre su acción.
4. La respuesta sale como texto por `POST /{phone_number_id}/messages` (token en la cabecera, nunca en la dirección): el Markdown se traduce a lo que WhatsApp pinta (`*negrita*`, viñetas, enlaces aplanados) y lo largo se parte en mensajes de hasta 4.000 caracteres. Los botones del chat salen como «Puedes responder: «Crear pendiente» o «Cancelar pendiente»». Antes de responder se marca el mensaje como leído.
5. **La bóveda nunca sale por aquí**: una respuesta con tarjetas de acceso o el campo protegido se sustituye por «Las contraseñas solo se muestran dentro de la plataforma, nunca por WhatsApp». El modelo tampoco las recibe, como siempre.
6. Por ahora solo texto: un audio o una imagen se contestan en palabras. Un fallo del motor se dice («No pude responder ahora»); si Bria todavía está respondiendo el mensaje anterior, se pide un momento.

El uso de IA de estos mensajes queda en el registro con módulo `whatsapp` y la persona como actor (`runWithAiContext`).

## Semáforo y política

- Servicio `whatsapp` en Salud operativa: le pregunta a Meta por el número (`display_phone_number`, `quality_rating`, `code_verification_status`), solo lectura y sin mandar nada; token vencido es rojo, calidad en rojo o número sin verificar es amarillo, sin token es gris.
- Política de tratamiento de datos 2.15: Meta como encargado del canal, solo con quien vincula su número, mismo historial y mismo derecho de borrado, sin contraseñas.

## Lo que falta y se decide con Rodny

- Quién puede hablarle a Bria por WhatsApp: hoy, cualquiera con Bria activa (administradores y project managers). Abrirlo al resto del equipo es la misma decisión que abrir Bria.
- Audios: transcribirlos con el dictado de siempre (`transcribe`) y responder; hoy se piden en texto.
- Que Bria escriba primero (avisos del pulso, cierre del día, lectura de la mañana por WhatsApp): exige plantillas aprobadas por Meta y un método de pago en la cuenta; se decide después de ver el uso.
- La verificación del negocio en Meta, para subir límites y quitar el aviso de «No verificado».

## Contratos

- `tests/whatsappBridge.test.js`: firma, verificación, lectura del aviso, código, traducción y partición del texto, respuestas fijas.
- `tests/whatsappBridgeService.test.js`: webhook (503/401/200 antes de trabajar), vínculo por código, puente al motor con identidad y sin sesión, bóveda, fallos, conversación por día, rutas.
- `tests/whatsappLinkUi.test.js`: la tarjeta del perfil.
- `tests/platformCatalog.test.js` (ruta excluida), `tests/serviceHealthProbes.test.js` (cada servicio con su comprobación), `tests/sidecarSchemaRegistry.test.js` (tablas anunciadas), `tests/legalPages.test.js` (política 2.15).
