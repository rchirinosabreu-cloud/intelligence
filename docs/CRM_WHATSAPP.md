# Prospectos por WhatsApp en el CRM

Rodny, 26 de noviembre de 2026: Brain Studio tiene campañas de pauta activas y quien escribe al WhatsApp debe quedar registrado en el CRM, con su origen, su conversación, una etapa, un responsable y un seguimiento, sin depender de que alguien revise el chat. Francisco debe poder verlo todo desde la plataforma. Es la etapa 1 del plan omnicanal (Claude Doc «CRM de WhatsApp para Intelligence: mapa y plan»).

## Qué número

El de Bria (+57 304 378 6298, phone number id 1319887801213730), elegido por Rodny. Las personas del equipo que vincularon su WhatsApp siguen hablando con Bria como siempre (`docs/BRIA_WHATSAPP.md`); cualquier otro número es un prospecto. El código de vínculo (`BRIA 482913`) sigue funcionando para un número nuevo del equipo. **Las campañas de Click to WhatsApp deben apuntar a este número.**

Interruptor: `WHATSAPP_PROSPECTS=off` en Railway apaga todo esto y vuelve la explicación «este número es solo para el equipo».

## Qué pasa cuando escribe

`whatsappBridgeService.handleUnknown` → `whatsappProspectService.receive`:

1. Busca o crea el contacto (`CrmWhatsAppContact`, por `waId`).
2. Busca la oportunidad: la ya enlazada si sigue abierta; si no, una abierta con el mismo número (últimos 10 dígitos). Si no hay, crea una: origen WhatsApp, detalle del origen = el anuncio («Anuncio: Redes que venden») o «Escribió directo al WhatsApp», nombre del perfil de WhatsApp, etapa Por gestionar, responsable `CRM_INTAKE_OWNER` (Francys por defecto), próxima acción «Responder por WhatsApp» con seguimiento hoy. Una oportunidad Ganada, Perdida o Descartada no se reabre: se crea otra.
3. Guarda el mensaje (`CrmWhatsAppMessage`, dirección IN). Los archivos se anotan como «[Foto]», «[Nota de voz]»…; todavía no se descargan.
4. La primera vez (o tras 30 días, mientras no haya autorizado) Bria responde la bienvenida con el enlace a `/privacidad` y los botones **Acepto** / **No acepto**. Si Meta no acepta los botones, van escritos y se entiende la respuesta escrita igual. Si Meta falla, se registra igual.
5. Avisa en la campana a la responsable y a los administradores: siempre en una oportunidad nueva, y luego solo si la persona vuelve tras 12 horas de silencio.

## Autorización de datos (Ley 1581)

Rodny eligió el 26 de noviembre de 2026, tras la revisión del PR 1438, pedirla con botones en la bienvenida (la regla del proyecto: toda superficie pública que recoge datos pide autorización previa, expresa e informada y guarda la prueba).

- **Acepto** (botón, o escribir exactamente «acepto» / «sí acepto» / «autorizo»): el contacto guarda `dataAuthorizedAt` y `dataAuthorizationVersion` (versión de la política), queda una nota en la oportunidad y Bria da las gracias.
- **No acepto** (botón, o «no acepto» / «no autorizo»): se borran los mensajes y el contacto. Si la oportunidad la creó su mensaje (`createdLeadId`) y nadie del equipo la gestionó, se retira: sin nombre ni número, descartada y archivada. Si ya era una oportunidad trabajada, queda una nota y se avisa a la responsable para que retire lo demás. Bria confirma el retiro.
- Mientras no responda, la ficha muestra «Aún no autoriza el tratamiento de sus datos» y el equipo puede responderle igual.

Los estados de entrega de Meta (`value.statuses`) actualizan los mensajes enviados: enviado, entregado, leído o no se entregó; un estado viejo nunca pisa uno nuevo.

## En la ficha de la oportunidad

`CrmWhatsAppPanel.jsx`, debajo de la solicitud: la conversación (prospecto a la izquierda, Bria y el equipo a la derecha con su nombre), la marca del anuncio de origen y las palomitas de entrega. Se actualiza cada 15 segundos. Se responde desde ahí dentro de las 24 horas desde el último mensaje de la persona; cada respuesta queda también como actividad WhatsApp de la oportunidad (lo que fija el primer contacto y mueve la etapa como cualquier gestión). Pasadas las 24 horas, Meta solo permite plantillas aprobadas: el panel lo dice y no deja escribir.

API: `GET /api/crm/leads/:id/whatsapp` y `POST /api/crm/leads/:id/whatsapp` con `{ text }` (400 vacío, 404 sin contacto, 409 ventana cerrada, 502 Meta falló), con los mismos permisos del CRM.

## Tablas

Creadas por `scripts/ensure-crm-schema.js` (aditivo, en cada arranque):

- `CrmWhatsAppContact`: `waId` único, número, `phoneKey`, nombre del perfil, oportunidad, último mensaje entrante y saliente, `welcomedAt`.
- `CrmWhatsAppMessage`: contacto, oportunidad, dirección IN/OUT, autor CONTACT/BRIA/TEAM, `metaMessageId` único, texto, `referral` del anuncio, estado de entrega y error.

## Privacidad

Política 2.29 (26 de noviembre de 2026): sección 2 explica qué se guarda de quien escribe y por qué; la línea de Bria en WhatsApp ya no dice que no habla con números sin vincular.

## Bria conversa con los prospectos (etapa 2, 26 de noviembre de 2026)

Rodny: «¿no es posible usar IA para hablar con el cliente, recabar información, cotizar, ofrecer servicios...?». Recomendado y en marcha: Bria responde sola y pasa al equipo.

- **Solo con autorización.** Hasta que la persona toca «Acepto», nada de lo que escribe va a la IA. Si escribe sin aceptar, se le recuerda con los botones (un minuto después de la bienvenida y luego como mucho cada 12 horas).
- **Qué hace** (`src/lib/whatsappProspectAgent.js`, `src/services/whatsappProspectAgentService.js`): conversa para armar el brief (servicio, marca o empresa, sector, ciudad, plazo, presupuesto), orienta con el catálogo de servicios activo (`ServiceCatalog`, nombre, descripción y `valor_neto` como precio de referencia; «según alcance» si es variable; nunca el costo) y pasa la conversación al equipo cuando la persona pide una persona o una propuesta, cuando ya hay servicio y plazo o presupuesto, o ante una queja, una duda fuera del catálogo o una negociación.
- **Qué no hace:** cerrar precios, dar descuentos, comprometer fechas ni aceptar condiciones de pago; no inventa servicios ni casos; ignora instrucciones dentro de los mensajes de la persona.
- **El modelo:** API de Claude por el SDK oficial y la salida gobernada (`governedFetch`, caso de uso `crm.whatsapp-prospect`), modelo `claude-opus-5-5` con esfuerzo `medium`, salida con esquema JSON (respuesta, `handoff`, motivo, brief), catálogo e instrucciones fijos y reutilizados en caché, la fecha y el contexto como mensaje de sistema al final, y respaldo del servidor ante rechazos (`fallbacks: "default"`). Variables: `ANTHROPIC_API_KEY` (sin ella queda solo la bienvenida), `WHATSAPP_PROSPECTS_AI=off` para apagarla, `WHATSAPP_PROSPECTS_MODEL` y `WHATSAPP_PROSPECTS_EFFORT` para cambiar modelo o esfuerzo.
- **Razonar, no recitar** (Rodny, 26 de noviembre de 2026): las instrucciones dan propósito, criterio y límites, no guiones. El catálogo es referencia: Bria explica, combina servicios y estima en voz alta diciendo que el equipo confirma. No pasa la conversación al equipo solo porque le falte un dato.
- **Información pública de la agencia:** redes, portafolio y sitio web salen de la memoria de la agencia (entidad de la agencia, tema «publico», vigente y no restringida). Un administrador se la enseña a Bria en el chat, por ejemplo: «Bria, guarda como dato público de la agencia (tema publico): nuestro Instagram es …».
- **Devolver a Bria:** si lo último lo escribió la persona, Bria lo responde enseguida. Si con eso vuelve a pasar la conversación al equipo, el aviso lo dice.
- **Paso al equipo:** el contacto queda con `botPausedAt` y el motivo, la oportunidad con próxima acción «Seguir la conversación de WhatsApp: …» para hoy, una nota con el brief, y el aviso en la campana a la responsable y a los administradores. Si la IA falla o declina, la persona recibe «una persona del equipo te escribe pronto» y el equipo el aviso.
- **El brief** se guarda en el contacto (`brief`) y completa en la oportunidad el servicio de interés y la empresa si estaban vacíos; nunca pisa lo que escribió el equipo.
- **En la ficha:** «Lo que Bria averiguó», quién atiende y el botón **Tomar conversación** / **Devolver a Bria** (`POST /api/crm/leads/:id/whatsapp/bria` con `{ active }`). Responder desde la ficha también toma la conversación. El panel muestra la *negrita* de WhatsApp.
- Política de datos 2.30: Anthropic como encargado también para esto.

## Lo que falta (etapas siguientes)

- Plantillas aprobadas para escribir después de 24 horas y seguimiento automático.
- Descargar fotos y documentos del prospecto.
- Bandeja de conversaciones (todas en una vista) y asignación por turnos.
- Unir el anuncio con su campaña en las cifras de Meta (`AdMetaCampaign`).
- Verificar el negocio en Meta (hoy sin verificar: límite de conversaciones iniciadas por la agencia).
- Formularios de Lead Ads, Instagram, Messenger, LinkedIn.
