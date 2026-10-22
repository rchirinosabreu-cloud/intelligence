// Bria en WhatsApp (Rodny, 20 de octubre de 2026: «ya voy a conectar el WhatsApp»): el número de la agencia
// (+57 304 378 6298) habla con el equipo por la API oficial de Meta (WhatsApp Business Platform, Cloud API).
//
// Qué hay aquí y qué no: solo la regla pura, sin red ni base de datos, para que la lean el webhook, el servicio y
// la pantalla de Perfil y la vigile tests/whatsappBridge.test.js.
// - La firma de Meta (`X-Hub-Signature-256`, HMAC-SHA256 con el secreto de la app) se comprueba sobre los bytes
//   originales del aviso, nunca sobre un objeto vuelto a serializar.
// - Del aviso se leen solo los mensajes: quién escribe (wa_id), qué dijo y a qué número. Los estados de entrega y
//   lo que no sea texto se reconocen pero no se interpretan. El contenido de un mensaje es dato, nunca instrucción.
// - El vínculo número ↔ persona se hace con un código de seis dígitos que la persona genera en su perfil (dentro de
//   la plataforma, con su sesión) y le manda a Bria por WhatsApp: la plataforma nunca escribe primero (eso exige
//   plantillas aprobadas y un método de pago) y nadie se vincula sin haber entrado a la plataforma.
// - La respuesta de Bria sale como texto: el Markdown del chat se traduce a lo que WhatsApp pinta y lo largo se
//   parte en mensajes de hasta 4.000 caracteres. Una respuesta que trae tarjetas de la bóveda no sale por aquí.
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
        out.push({ messageId: String(message.id), from, phone: resolvedPhone, userId, profileName: contact?.profile?.name || null, timestamp: Number.isFinite(timestamp) ? timestamp : null, type: String(message.type || 'unknown'), text: textOf(message), phoneNumberId });
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
  onlyText: 'Por ahora, por WhatsApp solo leo texto. Escríbeme lo que necesitas.',
  vaultOnly: 'Las contraseñas solo se muestran dentro de la plataforma, nunca por WhatsApp.',
  failed: 'No pude responder ahora. Inténtalo en un momento o escríbeme desde la plataforma.',
  busy: 'Todavía estoy respondiendo tu mensaje anterior. Dame un momento.'
});

/** El turno guardado de Bria, listo para salir por WhatsApp. */
export const answerForWhatsApp = (turn) => {
  if (!turn) return REPLIES.failed;
  if (turn.accessCards?.length || turn.accessCapture) return REPLIES.vaultOnly;
  const text = toWhatsAppText(turn.text);
  if (!text) return REPLIES.failed;
  const options = (turn.quickReplies || []).map((option) => String(option || '').trim()).filter(Boolean);
  if (!options.length) return text;
  const list = options.length === 1 ? `«${options[0]}»` : `${options.slice(0, -1).map((option) => `«${option}»`).join(', ')} o «${options.at(-1)}»`;
  return `${text}\n\nPuedes responder: ${list}.`;
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
