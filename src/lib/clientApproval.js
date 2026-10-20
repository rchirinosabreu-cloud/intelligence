// La aprobación que llega por fuera del portal (Rodny, 19 y 20 de octubre de 2026). La lectura de los chats de
// WhatsApp mostró que el cliente aprueba por el chat en 13 de los 14 grupos, y que la plataforma no guardaba quién,
// cuándo ni por dónde aprobó una pieza: el equipo publicaba sin saber si estaba aprobada y Bria tampoco lo veía.
// Desde hoy toda aprobación deja su marca en `ContentItem.clientApproval`: la del portal sola, la de WhatsApp, correo,
// llamada o reunión en un clic de quien la recibió, y la del desplegable de Estado a nombre de quien lo movió.
// Lógica pura, compartida por la pantalla, el servidor, la cola de redes y Bria.

export const APPROVAL_CHANNELS = Object.freeze([
  { value: 'PORTAL', label: 'el portal', byHand: false },
  { value: 'WHATSAPP', label: 'WhatsApp', byHand: true },
  { value: 'CORREO', label: 'correo', byHand: true },
  { value: 'LLAMADA', label: 'una llamada', byHand: true },
  { value: 'REUNION', label: 'una reunión', byHand: true },
  { value: 'EQUIPO', label: 'el equipo, desde el editor', byHand: false }
]);
/** Los canales que una persona puede marcar: por donde el cliente aprueba cuando no usa el portal. */
export const HAND_CHANNELS = APPROVAL_CHANNELS.filter((channel) => channel.byHand).map((channel) => channel.value);
export const APPROVAL_NOTE_MAX = 300;
// Las piezas creadas desde este día llevan siempre su marca (el portal y el editor la ponen solos); las anteriores
// pueden estar aprobadas sin marca, así que una pieza vieja sin marca no es una alarma.
export const CLIENT_APPROVAL_SINCE = '2026-10-21';
// Volver a estos estados deja sin efecto la aprobación anterior: el cliente tiene la palabra otra vez.
const CLEARING_STATUSES = new Set(['BORRADOR', 'EN_REVISION', 'DEVUELTO']);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const bogotaDay = (value) => { const d = new Date(new Date(value).getTime() - 5 * 3_600_000); return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };
const approvalError = (message) => Object.assign(new Error(message), { status: 400, statusCode: 400, code: 'CLIENT_APPROVAL_INVALID' });

export const channelLabel = (value) => APPROVAL_CHANNELS.find((channel) => channel.value === value)?.label || null;

/** La marca que se guarda. `actor`: { userId, name }; el portal no tiene actor. */
export const normalizeClientApproval = (input = {}, { actor = null, now = new Date() } = {}) => {
  const channel = String(input.channel || input.canal || '').trim().toUpperCase();
  if (!APPROVAL_CHANNELS.some((row) => row.value === channel)) throw approvalError('Dime por dónde aprobó el cliente: WhatsApp, correo, una llamada o una reunión.');
  const note = String(input.note ?? input.nota ?? '').trim();
  if (note.length > APPROVAL_NOTE_MAX) throw approvalError(`La nota de la aprobación pasa de ${APPROVAL_NOTE_MAX} caracteres.`);
  return {
    channel,
    note: note || null,
    byUserId: actor?.userId || actor?.id || null,
    byName: actor?.name || null,
    at: new Date(input.at || now).toISOString()
  };
};

/**
 * Qué marca le corresponde a un cambio de estado. Devuelve `{ clientApproval }` para escribir, o `{}` si no toca.
 * Aprobar sin decir por dónde se anota a nombre de quien movió el estado; aprobar desde el portal se anota como portal.
 */
export const approvalStamp = (data = {}, { fromClientReview = false, actor = null, now = new Date() } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(data, 'status')) return {};
  const status = String(data.status || '');
  if (status === 'APROBADO') {
    if (data.clientApproval && typeof data.clientApproval === 'object') return { clientApproval: normalizeClientApproval(data.clientApproval, { actor, now }) };
    return { clientApproval: normalizeClientApproval({ channel: fromClientReview ? 'PORTAL' : 'EQUIPO' }, { actor, now }) };
  }
  if (CLEARING_STATUSES.has(status)) return { clientApproval: null };
  return {};
};

/** «Aprobada por WhatsApp el 20 de octubre · anotó Kamila». Para la tarjeta y para Bria. */
export const approvalLabel = (approval) => {
  if (!approval?.channel) return null;
  const where = approval.channel === 'PORTAL' ? 'en el portal' : approval.channel === 'EQUIPO' ? 'desde el editor' : `por ${channelLabel(approval.channel)}`;
  const who = approval.byName ? ` · anotó ${String(approval.byName).split(/\s+/)[0]}` : '';
  return `Aprobada ${where} el ${bogotaDay(approval.at)}${who}`;
};

/** Una pieza nueva sin marca de aprobación: la cola de redes lo avisa, sin frenar. */
export const missingApprovalNotice = (item) => {
  if (!item || item.clientApproval || item.status === 'PUBLICADO') return null;
  // Sin fecha de creación no se sabe si la pieza es anterior a la marca: no se avisa.
  if (!item.createdAt) return null;
  if (new Date(item.createdAt).toISOString().slice(0, 10) < CLIENT_APPROVAL_SINCE) return null;
  return 'Esta pieza no tiene la aprobación del cliente marcada. Si te la dio por WhatsApp, correo o en una llamada, márcala en «El cliente aprobó por…» antes de programar.';
};

/** Las piezas con publicación armada en redes y sin aprobación marcada (solo las creadas desde que existe la marca). */
export const scheduledWithoutApproval = (items = []) => items.filter((item) => missingApprovalNotice(item)
  && (item.publications || []).some((row) => ['SCHEDULED', 'PUBLISHING'].includes(row?.status)));
