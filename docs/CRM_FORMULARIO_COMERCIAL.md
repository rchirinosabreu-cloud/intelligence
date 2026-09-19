# Formulario de solicitud comercial → CRM → Cotizaciones

Fecha: 19 de septiembre de 2026. Complementa `docs/CRM_COMERCIAL_PLAN.md`.

Estado: formulario aprobado por Rodny y **conectado al CRM** (rama `feat/commercial-request-intake`): ruta pública `/solicitud`, `POST /api/public/commercial-request`, tabla `CrmRequest`, columna `Quotation.lead_id`, botón «Copiar enlace del formulario» en el CRM, panel «Solicitud del cliente» y lista «Cotizaciones» en la ficha, marca «Formulario» en las listas, notificación a la responsable y correo de confirmación al prospecto (solo si hay SMTP configurado; remitente `CRM_REQUEST_FROM` o `SMTP_FROM`). La responsable de recepción se resuelve por nombre en el roster activo: `CRM_INTAKE_OWNER`, por defecto «Francys». Pendiente: botón «Crear cotización» con precarga (`?leadId=`) y cambio de etapa al aceptar (sección 6, pasos 5).

## 1. Qué es

Una página pública, sin login, que Brain Studio envía por enlace (`/solicitud`, opcionalmente con `?c=<campaña>` para saber de dónde llegó el clic). El prospecto la completa en unos cinco minutos y, al enviarla, nace una oportunidad en el CRM asignada a Francys con todo lo que escribió. Desde esa ficha ella decide: gestionar primero (llamada, reunión, ampliar información) o crear la cotización de una vez con las líneas ya cargadas.

Lógica completa: **Formulario → CRM → calificación → seguimiento → cotización → negociación → cierre → onboarding → postventa.** Todo cuelga de la misma oportunidad; nada se digita dos veces.

## 2. Cómo está construido

- `src/lib/commercialRequestForm.js`: **el formulario es datos**. Pasos, preguntas, opciones, condiciones (`showIf`), validación, progreso, y el mapeo hacia el CRM (`buildLeadDraft`) y hacia el catálogo de Cotizaciones (`suggestQuotationItems`). El backend validará con este mismo archivo, así el formulario y la API nunca se desalinean.
- `src/components/public/CommercialRequest/CommercialRequestForm.jsx`: pantalla por pasos con barra de progreso, tarjetas de selección, bloques dinámicos, borrador automático en el navegador y pantalla final. Usa el calendario único (`BrainDatePicker`), la paleta y el vidrio aprobados.
- `src/components/public/CommercialRequest/CommercialRequestPage.jsx`: la página pública. Envía a `POST /api/public/commercial-request` con `{ answers, meta }` (`meta` guarda referrer y campaña).
- Laboratorio sin base de datos: `npm run preview:solicitud` → `http://127.0.0.1:3300/solicitud` (`?dark` para oscuro). El envío corre el mapeo real y devuelve una referencia ficticia; los envíos se ven en `/api/public/commercial-request/received`.
- Pruebas: `tests/commercialRequestForm.test.js` (lógica y mapeos, verifica que cada sugerencia exista en `data/service_catalog_2026.json`) y `tests/browser/commercialRequest.mjs` (recorrido real en Chrome con capturas en `output/solicitud/`).

## 3. Recorrido y gamificación

| Pantalla | Qué ve la persona |
|---|---|
| Bienvenida | Texto de Brain Studio, enlace al sitio en pestaña nueva, «8 pasos · unos 5 minutos», botón Comenzar |
| Paso 1 · Tus datos | Nombre, empresa, cargo, correo, WhatsApp, ciudad y país, web/redes (opcional) |
| Paso 2 · Cuéntanos qué necesitas | Necesidad abierta, fecha importante (con calendario si dice que sí), cuándo iniciar |
| Paso 3 · ¿En qué podemos ayudarte? | Diez categorías + «No estoy seguro» + «Otro», como tarjetas con descripción. Multiselección; «No estoy seguro» es excluyente |
| Un paso por servicio elegido | Solo las preguntas de ese servicio, en el orden en que los eligió. El contador de pasos crece al elegir (3 de 8 → 3 de 11) |
| Evento | Sí/No; si sí, qué necesita para el evento |
| Estrategia AMC | Explicación de la tríada (Arranque · Conversión · Maduración) dentro del paso, las cuatro alternativas como tarjetas con una línea cada una (AMC Start, Boost, Growth, Impact, tal como están en `amc.brainstudioagencia.com`), enlace «Ver la estrategia AMC completa» **en pestaña nueva** solo para quien quiera profundizar, interés y qué le interesó |
| Presupuesto | Tiene/no tiene; monto, moneda, a qué corresponde (único, mensual, anual…), pauta incluida o adicional |
| Momento de contratación | Etapa, quién decide, cuándo espera la propuesta |
| Último paso · Origen | Cómo nos conoció, si trabajó antes, algo más |
| Gracias | Mensaje final, chips con los servicios elegidos y referencia de la solicitud |

Gamificación sin ruido: una sola barra de progreso continua con degradado de marca y porcentaje (Rodny descartó el riel de pasos duplicado), frase de ánimo que cambia («Empecemos», «Buen ritmo», «Vas por la mitad», «Último tramo», «¡Listo!»), transiciones suaves entre pasos, borrador guardado (si cierra y vuelve, sigue donde iba), validación amable con el primer error enfocado, y cierre con referencia visible.

## 4. Mapeo al CRM

Cada envío crea **una** `CrmLead` con `origin` según «¿Cómo nos conociste?» (LinkedIn → `LINKEDIN`, referido → `REFERIDO`, cliente actual/anterior → `CLIENTE_ANTERIOR`, WhatsApp → `WHATSAPP`, convocatoria → `CONVOCATORIA`, Francisco → `CONTACTO_DIRECTO`, Instagram/Google/web/otro → `FORMULARIO`), `originDetail` «Formulario de solicitud comercial · <canal>», contacto, empresa, cargo, correo, teléfono, web, `serviceInterest` («Marketing + Web»), prioridad (ALTA si el proyecto está aprobado, necesita contratar pronto o quiere iniciar ya; BAJA si solo quiere precios o explora; MEDIA el resto), `quotedValue` y moneda si dio presupuesto en COP o USD, `callDeadlineAt` con la fecha importante, `nextAction` «Revisar la solicitud y hacer el primer contacto», `nextFollowUpAt` el siguiente día hábil, y `notes` con un resumen legible.

Junto al lead se guarda la **solicitud completa** (`CrmRequest`, JSON con todas las respuestas, servicios, líneas sugeridas, ubicación, `meta`). La ficha del lead mostrará un bloque «Solicitud del cliente» con esas respuestas tal como las escribió.

Además: primera gestión automática en la bitácora (`NOTA` «Solicitud recibida por formulario»), responsable Francys (configurable), notificación interna a Francys, y correo de confirmación al prospecto (fase de integración).

## 5. Mapeo a Cotizaciones

Las diez categorías del formulario **son** las del catálogo (`ServiceCategory`). Cada respuesta de los bloques sugiere una línea del catálogo por nombre exacto (por ejemplo «Fotografía» → «Sesión fotográfica de 2 horas», «Landing page» → «Landing page», «WhatsApp» en web → «Integración de WhatsApp en sitio web»); cuando no hay equivalente (Drone, TikTok Ads, Blog) se sugiere una **línea personalizada**, que el módulo de propuestas ya admite sin `serviceId`. Ejemplo pedido por Rodny: Producción audiovisual → video + fotografía + drone da «Video individual grabado y editado», «Sesión fotográfica de 2 horas» y «Drone» (personalizada).

En la ficha del lead habrá un botón **«Crear cotización»** que abre `/cotizaciones/nueva?leadId=<id>` con cliente, empresa, correo, teléfono, moneda y esas líneas ya cargadas (cantidad 1, precio del catálogo, editable). La cotización guarda `leadId`; una oportunidad puede tener varias cotizaciones (versiones) y todas se listan en la ficha. Cuando el cliente acepta una cotización, el lead pasa a `APROBADA` con una gestión automática; al emitirla, a `PROPUESTA_ENVIADA`.

## 6. Plan de integración (después de aprobar el formulario)

1. **Datos**: tabla `CrmRequest` (id, leadId, answers JSONB, services, suggestedItems, meta, receivedAt) y columna `Quotation.lead_id` con índice, ambas en `scripts/ensure-crm-schema.js` de forma aditiva.
2. **API pública**: `POST /api/public/commercial-request` con límite de tasa (el `publicRateLimiter` existente), validación con `validateStep` de cada paso visible, honeypot y tamaño máximo. Crea lead + request + gestión inicial en una transacción; asigna a Francys por nombre resuelto en el roster; notifica; responde `{ reference }`.
3. **Ruta pública** `/solicitud` en `App.jsx` (como `/cotizaciones/ver/:slug`).
4. **CRM**: bloque «Solicitud del cliente» y lista «Cotizaciones» en la ficha; botón «Crear cotización»; contador de solicitudes nuevas en el dashboard del CRM y en Recordatorios.
5. **Cotizaciones**: `QuotationForm` acepta `?leadId=` y precarga; guarda `lead_id`; al aceptar/emitir actualiza la etapa del lead.
6. **Correo**: confirmación al prospecto con el resumen y aviso interno a Francys (SMTP ya configurado en la plataforma).

## 7. Pendientes de Rodny para cerrar el diseño

- Resuelto: planes AMC Start, Boost, Growth e Impact y landing `https://amc.brainstudioagencia.com/`, tomados de la landing el 19 de septiembre de 2026. Si cambian los planes, se actualizan en `AMC_PLANS`.
- URL del sitio en la bienvenida (hoy `https://brainstudioagencia.com`).
- Si el correo de confirmación al prospecto sale desde `social.brainstudio@gmail.com` o desde otra cuenta.
- Si quiere un texto legal corto al pie (hoy: «Usaremos estos datos únicamente para preparar tu propuesta y contactarte»).
