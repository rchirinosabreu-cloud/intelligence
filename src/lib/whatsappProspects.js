// Prospectos por WhatsApp (Rodny, 26 de noviembre de 2026): «cuando una persona llegue desde una campaña y escriba al
// WhatsApp de Brain Studio, debe existir un mecanismo para registrar ese contacto dentro del CRM, identificar su
// origen, almacenar su información, asignar estado y permitir seguimiento». El número es el de Bria: quien no es del
// equipo (no vinculó su WhatsApp desde el perfil) es un prospecto. Aquí viven las reglas puras; el servicio
// (src/services/whatsappProspectService.js) guarda y avisa.
import { isWindowOpen } from './whatsappAlerts.js';
import { normalizeWaId, isBsuid } from './whatsappBridge.js';

/** Si la misma persona vuelve a escribir tras este silencio, se le avisa otra vez a quien la atiende. */
export const PROSPECT_RENOTIFY_AFTER_MS = 12 * 60 * 60 * 1000;
/** Una bienvenida por persona; si vuelve después de este tiempo, recibe otra. */
export const PROSPECT_WELCOME_AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Lo más largo que se guarda de un mensaje y de una respuesta del equipo (WhatsApp acepta 4.096). */
export const PROSPECT_TEXT_MAX = 4096;
/** Etapas en las que una oportunidad ya no se reabre con un mensaje nuevo: se crea otra. */
export const CLOSED_STAGES = Object.freeze(['GANADO', 'PERDIDO', 'DESCARTADO']);

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

/**
 * Lo que Meta manda cuando alguien escribe desde un anuncio que abre WhatsApp (Click to WhatsApp) o desde una
 * publicación: `referral` con el anuncio. Solo se guardan los campos conocidos, recortados; los enlaces solo si son https.
 */
export const parseReferral = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const url = clip(raw.source_url, 500);
  const referral = {
    sourceType: clip(raw.source_type, 20),
    sourceId: clip(raw.source_id, 60),
    sourceUrl: url && /^https:\/\//i.test(url) ? url : null,
    headline: clip(raw.headline, 200),
    body: clip(raw.body, 500),
    ctwaClid: clip(raw.ctwa_clid, 200)
  };
  return Object.values(referral).some(Boolean) ? referral : null;
};

/** El «detalle del origen» de la oportunidad: el anuncio si vino de uno, o que escribió directo. */
export const originDetailFor = (referral) => {
  if (!referral) return 'Escribió directo al WhatsApp';
  const kind = referral.sourceType === 'post' ? 'Publicación' : 'Anuncio';
  const name = referral.headline || (referral.sourceId ? `id ${referral.sourceId}` : null);
  return name ? `${kind}: ${name}`.slice(0, 250) : `${kind} de Meta`;
};

/** La llave para encontrar a la misma persona en el CRM: los últimos 10 dígitos de su número. */
export const phoneKey = (value) => {
  if (!value || isBsuid(value)) return null;
  const digits = normalizeWaId(value);
  return digits.length >= 7 ? digits.slice(-10) : null;
};

/** El número como se muestra y se guarda en la oportunidad: +57 300 123 4567. */
export const leadPhone = (value) => {
  if (!value || isBsuid(value)) return null;
  const digits = normalizeWaId(value);
  if (!digits) return null;
  if (digits.startsWith('57') && digits.length === 12) return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** La primera respuesta, apenas escribe. Dice quién responde, que una persona sigue y dónde está la política de datos. */
export const welcomeText = ({ name = null, privacyUrl = null } = {}) => {
  const hello = firstName(name) ? `¡Hola, ${firstName(name)}!` : '¡Hola!';
  return [
    `${hello} Gracias por escribir a Brain Studio. Soy Bria, la asistente de la agencia.`,
    'Ya le avisé a nuestro equipo comercial y una persona te responde muy pronto. Mientras tanto, cuéntanos qué necesitas para tu marca y para cuándo.',
    privacyUrl ? `Tratamos tus datos según nuestra política: ${privacyUrl}` : null
  ].filter(Boolean).join('\n\n');
};

/** ¿Toca bienvenida? La primera vez, o si pasó mucho desde la anterior. */
export const shouldWelcome = (contact, at = new Date()) => {
  if (!contact?.welcomedAt) return true;
  return at.getTime() - new Date(contact.welcomedAt).getTime() >= PROSPECT_WELCOME_AGAIN_AFTER_MS;
};

/** ¿Se avisa a quien atiende? Siempre en una oportunidad nueva; si no, cuando vuelve tras un silencio largo. */
export const shouldNotify = ({ createdLead, previousInboundAt }, at = new Date()) => {
  if (createdLead) return true;
  if (!previousInboundAt) return true;
  return at.getTime() - new Date(previousInboundAt).getTime() >= PROSPECT_RENOTIFY_AFTER_MS;
};

/** Lo que se guarda como texto de un mensaje entrante: lo escrito, o qué mandó si fue un archivo sin texto. */
const MEDIA_LABELS = Object.freeze({ image: 'Foto', video: 'Video', document: 'Documento', audio: 'Nota de voz', sticker: 'Sticker', location: 'Ubicación', contacts: 'Contacto' });
export const inboundTextFor = (message) => {
  const text = clip(message?.text, PROSPECT_TEXT_MAX);
  const kinds = (message?.medias || (message?.media ? [message.media] : [])).map((media) => media?.kind).filter(Boolean);
  const labels = kinds.map((kind) => `[${MEDIA_LABELS[kind] || 'Archivo'}]`);
  if (!labels.length && !text && message?.type && message.type !== 'text') labels.push(`[${MEDIA_LABELS[message.type] || 'Mensaje que WhatsApp no muestra aquí'}]`);
  return [labels.join(' ') || null, text].filter(Boolean).join(' ') || '[Mensaje vacío]';
};

/** Dentro de las 24 horas desde el último mensaje de la persona se le puede escribir libre; después, solo plantillas. */
export const canReplyFreely = (contact, at = new Date()) => isWindowOpen(contact?.lastInboundAt, at);

/** Un texto del equipo para mandar: sin espacios sobrantes y dentro del largo de WhatsApp. */
export const cleanReply = (value) => {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return { error: 'Escribe el mensaje antes de enviarlo.' };
  if (text.length > PROSPECT_TEXT_MAX) return { error: `El mensaje pasa de ${PROSPECT_TEXT_MAX} caracteres.` };
  return { text };
};

/** Los estados de entrega que Meta manda, en el orden en que avanzan. Un estado viejo nunca pisa uno nuevo. */
const STATUS_ORDER = Object.freeze({ SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 });
export const nextStatus = (current, incoming) => {
  const next = String(incoming || '').toUpperCase();
  if (!STATUS_ORDER[next]) return current || null;
  if (!current || !STATUS_ORDER[current]) return next;
  return STATUS_ORDER[next] > STATUS_ORDER[current] ? next : current;
};

/** Los estados de un aviso de Meta: `[{ messageId, status, at }]`, solo de nuestro número. */
export const parseStatuses = (body, phoneNumberId = null) => {
  const out = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const value = change.value || {};
      if (phoneNumberId && value.metadata?.phone_number_id && String(value.metadata.phone_number_id) !== String(phoneNumberId)) continue;
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!status?.id || !STATUS_ORDER[String(status.status || '').toUpperCase()]) continue;
        const seconds = Number(status.timestamp);
        out.push({ messageId: String(status.id), status: String(status.status).toUpperCase(), at: Number.isFinite(seconds) ? new Date(seconds * 1000) : null });
      }
    }
  }
  return out;
};
