# Bria en WhatsApp

Rodny, 20 de octubre de 2026: «ya voy a conectar el WhatsApp, que necesitas para que lo empecemos a montar». El equipo le habla a Bria desde su WhatsApp personal, al número de la agencia, y Bria responde con el mismo motor, la misma identidad y los mismos permisos que en la plataforma.

## Qué hay en Meta

| Dato | Valor |
|---|---|
| Número de Bria | +57 304 378 6298 (SIM nueva, verificado por SMS el 20 de octubre de 2026) |
| Perfil de WhatsApp Business | «Brain Studio», categoría Servicios profesionales |
| Cuenta de WhatsApp Business (WABA) | 1061974066819635, en el portfolio comercial Brain Studio (1050800991725020) |
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
- Solo se atienden los mensajes dirigidos a nuestro número (`metadata.phone_number_id`); los estados de entrega se ignoran.
- Cada mensaje se recuerda por su identificador 30 días (`whatsapp_inbound`): un aviso que Meta repite no se responde dos veces.

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
