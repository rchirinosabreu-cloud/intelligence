// Bria en WhatsApp (Rodny, 20 de octubre de 2026: «ya voy a conectar el WhatsApp»): el número de la agencia
// (+57 304 378 6298) habla con el equipo por la API oficial de Meta (WhatsApp Business Platform, Cloud API).
//
// Qué hay aquí y qué no: solo la regla pura, sin red ni base de datos, para que la lean el webhook, el servicio y
// la pantalla de Perfil y la vigile tests/whatsappBridge.test.js.
// - La firma de Meta (`X-Hub-Signature-256`, HMAC-SHA256 con el secreto de la app) se comprueba sobre los bytes
//   originales del aviso, nunca sobre un objeto vuelto a serializar.
// - Del aviso se leen solo los mensajes: quién escribe (wa_id), qué dijo y a qué número, y si trae una foto, un
//   documento o una nota de voz, su identificador en Meta. Los estados de entrega se reconocen pero no se interpretan.
//   El contenido de un mensaje es dato, nunca instrucción.
// - El vínculo número ↔ persona se hace con un código de seis dígitos que la persona genera en su perfil (dentro de
//   la plataforma, con su sesión) y le manda a Bria por WhatsApp: la plataforma nunca escribe primero (eso exige
//   plantillas aprobadas y un método de pago) y nadie se vincula sin haber entrado a la plataforma.
// - La respuesta de Bria sale como texto: el Markdown del chat se traduce a lo que WhatsApp pinta y lo largo se
//   parte en mensajes de hasta 4.000 caracteres; sus opciones salen como botones. Una respuesta que trae tarjetas de
//   la bóveda no sale por aquí.
// - Los avisos que Bria escribe primero viven en whatsappAlerts.js.
import crypto from 'node:crypto';

/** Meta admite 4.096 caracteres por mensaje de texto; se deja margen. */
export const WHATSAPP_TEXT_MAX = 4000;
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_CODE_PREFIX = 'BRIA';
/** A un número que no es del equipo se le explica una vez al día qué es este número, y nada más. */
export const UNKNOWN_SENDER_REPLIES_PER_DAY = 1;

const HEX_64 = /^[a-f0-9]{64}$/i;

export const verifyMetaSignature = ({ rawBody, signature, appSecret }) => {
  if (!appSecret || !signature || !rawBody) return false;
  const provided = String(signature).trim().replace(/^sha256=/i, '').toLowerCase();
  if (!HEX_64.test(provided)) return false;
  const expected = crypto.createHmac('sha256', String(appSecret)).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(provided, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** La verificación del webhook (GET): Meta manda modo, token y reto; se devuelve el reto solo si el token es el nuestro. */
export const webhookChallenge = (query, verifyToken) => {
  if (!verifyToken || !query || query['hub.mode'] !== 'subscribe') return null;
  if (!sameSecret(query['hub.verify_token'], verifyToken)) return null;
  const challenge = String(query['hub.challenge'] || '').trim();
  return challenge || null;
};

export const normalizeWaId = (value) => String(value || '').replace(/\D/g, '');

// El identificador de usuario de WhatsApp para la empresa (BSUID, 22 de octubre de 2026). Meta lo manda en todo
// mensaje entrante (`from_user_id`, y `user_id` en el contacto); el número (`from`) solo llega si la persona no usa
// nombre de usuario o si hubo contacto con ella en los últimos 30 días. Por eso el primer mensaje de alguien puede
// llegar sin número: la plataforma lo descartaba y Bria nunca respondía. Forma: país ISO de dos letras, punto,
// `ENT.` si es un BSUID principal, y hasta 128 caracteres alfanuméricos (US.13491208655302741918).
const BSUID = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;
export const normalizeBsuid = (value) => { const text = String(value || '').trim(); return BSUID.test(text) ? text : null; };
export const isBsuid = (value) => normalizeBsuid(value) !== null;

const textOf = (message) => {
  const raw = message.type === 'text' ? message.text?.body
    : message.type === 'button' ? message.button?.text
      : message.type === 'interactive' ? (message.interactive?.button_reply?.title || message.interactive?.list_reply?.title)
        : null;
  const text = String(raw || '').trim();
  return text || null;
};

// El identificador de lo que se tocó: un botón o una fila de una lista nuestra, o el botón de una plantilla.
const replyIdOf = (message) => {
  const raw = message.type === 'interactive' ? (message.interactive?.button_reply?.id || message.interactive?.list_reply?.id)
    : message.type === 'button' ? message.button?.payload
      : null;
  const id = String(raw || '').trim();
  return id || null;
};
// Una opción de Bria guarda en su identificador la frase completa: el título del botón puede venir recortado.
const replyText = (message, replyId) => (replyId?.startsWith('q:') && replyId.length > 2 ? replyId.slice(2) : textOf(message));

// Fotos, documentos y notas de voz (22 de octubre de 2026). Un sticker, un video o una ubicación no son archivos de
// trabajo: se contestan en palabras.
const MEDIA_KINDS = ['image', 'document', 'audio'];
const mediaOf = (message) => {
  if (!MEDIA_KINDS.includes(message.type)) return null;
  const media = message[message.type];
  if (!media?.id) return null;
  return { kind: message.type, id: String(media.id), mimeType: media.mime_type ? String(media.mime_type) : null, filename: media.filename ? String(media.filename) : null };
};
const captionOf = (message) => {
  const caption = String(message[message.type]?.caption || '').trim();
  return caption || null;
};

/**
 * Los mensajes entrantes de un aviso de Meta, con su autor, su texto y el número que los recibió.
 * `from` es la clave estable de quien escribe: su BSUID si viene (siempre, desde 2026) y, si no, su número.
 * `phone` y `userId` van aparte: el número sirve para responder y para mostrarlo; el BSUID, cuando no hay número.
 */
export const parseInboundMessages = (body) => {
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];
  const out = [];
  for (const entry of body.entry) {
    for (const change of entry?.changes || []) {
      if (change?.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const message of value.messages || []) {
        if (!message?.id) continue;
        const phone = normalizeWaId(message.from) || null;
        const contact = contacts.find((item) => (phone && normalizeWaId(item?.wa_id) === phone) || (message.from_user_id && item?.user_id === message.from_user_id)) || (contacts.length === 1 ? contacts[0] : null);
        const userId = normalizeBsuid(message.from_user_id) || normalizeBsuid(contact?.user_id);
        const resolvedPhone = phone || normalizeWaId(contact?.wa_id) || null;
        const from = userId || resolvedPhone;
        if (!from) continue;
        const timestamp = Number(message.timestamp);
        const replyId = replyIdOf(message);
        const media = mediaOf(message);
        out.push({ messageId: String(message.id), from, phone: resolvedPhone, userId, profileName: contact?.profile?.name || null, timestamp: Number.isFinite(timestamp) ? timestamp : null, type: String(message.type || 'unknown'), text: media ? captionOf(message) : replyText(message, replyId), replyId, media, phoneNumberId });
      }
    }
  }
  return out;
};

/**
 * La forma de un aviso, para el registro cuando no trae nada que atender (21 de octubre de 2026: un aviso firmado
 * llegaba, no se respondía y no quedaba rastro de por qué). Dice qué objeto, qué campos, qué números y cuántos
 * mensajes y estados trae; nunca el texto, el nombre ni el número de quien escribe.
 */
export const describeNotice = (body) => {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const changes = entries.flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes : []));
  const fields = [...new Set(changes.map((change) => change?.field).filter(Boolean))];
  const phoneIds = [...new Set(changes.map((change) => change?.value?.metadata?.phone_number_id).filter(Boolean).map(String))];
  const count = (key) => changes.reduce((sum, change) => sum + (Array.isArray(change?.value?.[key]) ? change.value[key].length : 0), 0);
  return `objeto=${body?.object ?? 'ninguno'} entradas=${entries.length} campos=${fields.join(',') || 'ninguno'} números=${phoneIds.join(',') || 'ninguno'} mensajes=${count('messages')} estados=${count('statuses')} errores=${count('errors')}`;
};

/**
 * Si un aviso sin mensajes es solo de estados (enviado, entregado, leído, fallido) de lo que mandó Bria. Esos llegan
 * tres por respuesta y no son una anomalía: no se anotan, salvo un estado fallido, que sí se dice.
 */
export const isStatusOnlyNotice = (body) => {
  const changes = (Array.isArray(body?.entry) ? body.entry : []).flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes : []));
  if (!changes.length) return false;
  const hasStatuses = changes.some((change) => Array.isArray(change?.value?.statuses) && change.value.statuses.length);
  const hasOther = changes.some((change) => (Array.isArray(change?.value?.messages) && change.value.messages.length) || (Array.isArray(change?.value?.errors) && change.value.errors.length));
  const failed = changes.some((change) => (change?.value?.statuses || []).some((status) => status?.status === 'failed'));
  return hasStatuses && !hasOther && !failed;
};

/** Quién escribe, recortado para el registro: basta para distinguir, no para identificar. */
export const maskWaId = (waId) => {
  const bsuid = normalizeBsuid(waId);
  if (bsuid) return `${bsuid.split('.')[0]}.…${bsuid.slice(-4)}`;
  const digits = normalizeWaId(waId);
  return digits ? `…${digits.slice(-4)}` : '…';
};

export const generateLinkCode =(random = (max) => crypto.randomInt(max)) => String(random(1000000) % 1000000).padStart(6, '0');
export const linkMessage = (code) => `${LINK_CODE_PREFIX} ${code}`;

/** Seis dígitos solos, o precedidos de «BRIA»; nunca seis dígitos dentro de una cifra más larga. */
export const linkCodeIn = (text) => {
  const value = String(text || '').trim();
  if (!value) return null;
  const alone = value.match(/^(?:bria[\s:.-]*)?(\d{6})$/i);
  if (alone) return alone[1];
  const inline = value.match(/\bbria[\s:.-]*(\d{6})(?!\d)/i);
  return inline ? inline[1] : null;
};

export const displayPhone = (value) => {
  if (isBsuid(value)) return '';
  const digits = normalizeWaId(value);
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length === 12) return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
};

export const waMeLink = (number, text) => `https://wa.me/${normalizeWaId(number)}?text=${encodeURIComponent(text)}`;

/** Lo que WhatsApp pinta: *negrita*, ```código```, viñetas con punto; títulos, enlaces y citas se aplanan. */
export const toWhatsAppText = (markdown) => {
  let text = String(markdown || '').replace(/\r\n/g, '\n');
  text = text.replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, (_, code) => `\`\`\`${code.trim()}\`\`\``);
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => `*${heading.trim().replace(/\*+/g, '')}*`);
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  text = text.replace(/__(.+?)__/g, '*$1*');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');
  // Solo espacios de la propia línea: `\s` se comería la línea en blanco anterior.
  text = text.replace(/^([ \t]*)[-*•][ \t]+/gm, '$1• ');
  text = text.replace(/^[ \t]*>[ \t]?/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
};

const cutPoint = (rest, max) => {
  const floor = Math.floor(max * 0.4);
  for (const [needle, keep] of [['\n\n', 0], ['\n', 0], ['. ', 1], [' ', 0]]) {
    const at = rest.lastIndexOf(needle, max);
    if (at >= floor) return at + keep;
  }
  return max;
};

export const splitForWhatsApp = (text, max = WHATSAPP_TEXT_MAX) => {
  let rest = String(text || '').trim();
  if (!rest) return [];
  const parts = [];
  while (rest.length > max) {
    const cut = cutPoint(rest, max);
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'ya';

export const REPLIES = Object.freeze({
  unknown: 'Hola, soy Bria, la asistente de Brain Studio. Este número es solo para el equipo. Si eres del equipo, entra a la plataforma, abre tu perfil, pulsa «Vincular mi WhatsApp» y mándame el código que te muestra.',
  linked: (name) => `Listo, ${firstName(name)}. Ya puedo hablar contigo por aquí. Escríbeme como lo haces en la plataforma.`,
  invalidCode: 'Ese código no sirve o ya venció. Pide otro en tu perfil de la plataforma, en «Bria en WhatsApp».',
  notAllowed: 'Tu cuenta ya no tiene a Bria activa. Habla con administración.',
  onlyText: 'Por WhatsApp leo texto, notas de voz, fotos y documentos. Ese tipo de mensaje todavía no: escríbeme lo que necesitas.',
  mediaTooBig: 'Ese archivo pesa más de 20 MB y no lo puedo abrir por aquí. Súbelo desde la plataforma o mándame una foto más liviana.',
  mediaFailed: 'No pude abrir ese archivo. Mándamelo otra vez, por favor.',
  noSpeech: 'No alcancé a entender la nota de voz. ¿Me la repites o me lo escribes?',
  vaultOnly: 'Las contraseñas solo se muestran dentro de la plataforma, nunca por WhatsApp.',
  failed: 'No pude responder ahora. Inténtalo en un momento o escríbeme desde la plataforma.',
  busy: 'Todavía estoy respondiendo tu mensaje anterior. Dame un momento.',
  needsPlatform: 'Eso lo tengo que hacer desde la plataforma, con tu sesión abierta: confírmalo en el chat de Bria allá y lo hago.',
  alertGone: 'Ese aviso ya no está disponible. Lo que siga pendiente lo ves en la plataforma.',
  dismissed: 'Listo, no te lo vuelvo a mostrar hoy.',
  done: 'Listo.'
});

// Botones (Rodny, 22 de octubre de 2026: «bria no podría también darme las opciones tipo botones?»). Hasta tres
// opciones cortas van como botones de respuesta; hasta diez, o las que no caben en un botón, en una lista. Tocar un
// botón llega con su identificador, que guarda la opción completa (`q:<opción>`), así que vale exactamente lo mismo
// que escribirla; y escribir con sus palabras sigue valiendo, porque Bria entiende el sí y el no dichos como sea.
export const BUTTON_TITLE_MAX = 20;
export const LIST_ROW_TITLE_MAX = 24;
export const LIST_ROW_DESCRIPTION_MAX = 72;
export const LIST_ROWS_MAX = 10;
export const INTERACTIVE_BODY_MAX = 1024;
const REPLY_ID_MAX = 256;
const FOOTER_MAX = 60;
export const OPTIONS_FOOTER = 'O escríbeme con tus palabras';
export const OPTIONS_LIST_BUTTON = 'Ver opciones';
export const OPTIONS_PROMPT = 'Elige una opción o escríbeme.';
const QUICK_REPLY_PREFIX = 'q:';

const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
export const quickReplyId = (option) => `${QUICK_REPLY_PREFIX}${option}`.slice(0, REPLY_ID_MAX);

/** El turno guardado de Bria, listo para salir por WhatsApp: el texto y sus opciones como botones. */
export const replyForWhatsApp = (turn) => {
  if (!turn) return { text: REPLIES.failed, options: [] };
  if (turn.accessCards?.length || turn.accessCapture) return { text: REPLIES.vaultOnly, options: [] };
  const text = toWhatsAppText(turn.text);
  if (!text) return { text: REPLIES.failed, options: [] };
  const labels = [...new Set((turn.quickReplies || []).map((option) => String(option || '').trim()).filter(Boolean))];
  return { text, options: labels.map((label) => ({ id: quickReplyId(label), label })) };
};

/** Las opciones dichas en texto, para cuando los botones no pueden salir. */
export const textWithOptions = ({ text, options = [] }) => {
  const labels = options.map((option) => option.label);
  if (!labels.length) return text;
  // Un resumen que se confirma o se cancela: desde el 22 de octubre de 2026 Bria entiende el sí y el no dichos como
  // sea («dale, bórralo», «mejor no»), así que no se le pide a nadie que copie una frase.
  if (labels.length === 2 && /^(?:cancelar|no\b)/i.test(labels[1])) return `${text}\n\nRespóndeme con un sí, o dime qué cambiar.`;
  const list = labels.length === 1 ? `«${labels[0]}»` : `${labels.slice(0, -1).map((label) => `«${label}»`).join(', ')} o «${labels.at(-1)}»`;
  return `${text}\n\nPuedes responder: ${list}.`;
};

export const answerForWhatsApp = (turn) => textWithOptions(replyForWhatsApp(turn));

/**
 * Un mensaje con botones (hasta tres, de hasta 20 caracteres) o con una lista (hasta diez filas). Devuelve null si
 * no se puede: sin opciones, más de diez, o un cuerpo de más de 1.024 caracteres; entonces sale en texto.
 */
export const optionsMessagePayload = (target, body, options, { footer = OPTIONS_FOOTER } = {}) => {
  const rows = [];
  for (const option of options || []) {
    const label = String(option?.label || '').trim();
    if (option?.id && label && !rows.some((row) => row.id === option.id)) rows.push({ id: String(option.id).slice(0, REPLY_ID_MAX), label });
  }
  const text = String(body || '').trim();
  if (!rows.length || rows.length > LIST_ROWS_MAX || !text || text.length > INTERACTIVE_BODY_MAX) return null;
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', ...recipientFields(target), type: 'interactive' };
  const footerPart = footer ? { footer: { text: clip(footer, FOOTER_MAX) } } : {};
  const fitsButtons = rows.length <= 3 && rows.every((row) => row.label.length <= BUTTON_TITLE_MAX) && new Set(rows.map((row) => row.label)).size === rows.length;
  if (fitsButtons) {
    return { ...base, interactive: { type: 'button', body: { text }, ...footerPart, action: { buttons: rows.map((row) => ({ type: 'reply', reply: { id: row.id, title: row.label } })) } } };
  }
  return {
    ...base,
    interactive: {
      type: 'list', body: { text }, ...footerPart,
      action: { button: OPTIONS_LIST_BUTTON, sections: [{ title: 'Opciones', rows: rows.map((row) => ({ id: row.id, title: clip(row.label, LIST_ROW_TITLE_MAX), ...(row.label.length > LIST_ROW_TITLE_MAX ? { description: clip(row.label, LIST_ROW_DESCRIPTION_MAX) } : {}) })) }] }
    }
  };
};

/**
 * A quién se le responde: por número si se conoce (Meta lo recomienda, porque así sigue mandando el número en los
 * avisos), y si no, por BSUID en `recipient`. Nunca los dos: con ambos gana el número.
 */
export const recipientFields = (target) => {
  const bsuid = normalizeBsuid(target);
  if (bsuid) return { recipient: bsuid };
  const digits = normalizeWaId(target);
  return digits ? { to: digits } : {};
};
export const textMessagePayload = (target, body) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', ...recipientFields(target), type: 'text', text: { preview_url: false, body } });
export const readReceiptPayload = (messageId) => ({ messaging_product: 'whatsapp', status: 'read', message_id: messageId });
/** Leído y «escribiendo…» a la vez: se quita solo al responder o a los 25 segundos (referencia de Meta). */
export const typingPayload = (messageId) => ({ ...readReceiptPayload(messageId), typing_indicator: { type: 'text' } });

/** Un archivo recibido solo se descarga de los servidores de Meta, y por https. */
const META_MEDIA_HOSTS = ['fbsbx.com', 'facebook.com', 'whatsapp.net', 'fbcdn.net'];
export const isMetaMediaUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && META_MEDIA_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
};
export const WHATSAPP_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr' };
/** El nombre con que el archivo entra al chat: el que traía el documento, o uno con su extensión. */
export const mediaFileName = (media, messageId) => {
  if (media.filename) return media.filename.replace(/[\\/\x00-\x1f]/g, '').slice(0, 180) || 'documento';
  const extension = EXTENSIONS[String(media.mimeType || '').split(';')[0].trim()] || 'bin';
  const tag = String(messageId || '').replace(/^wamid\./, '').replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'archivo';
  return `${media.kind === 'audio' ? 'nota-de-voz' : media.kind === 'image' ? 'foto-whatsapp' : 'documento'}-${tag}.${extension}`;
};
