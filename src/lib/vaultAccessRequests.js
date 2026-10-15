// Pedir un acceso de la bóveda (Rodny, 15 de octubre de 2026): «Camila podría decir “necesito la contraseña de
// capcut, por favor solicítasela a Rodny” y la Bria de Rodny le dé un anuncio con dos opciones, compartir y denegar».
// Regla pura y textos en un solo sitio: el aviso de quien decide, la respuesta a quien pidió, las notificaciones y la
// línea que se ve tras decidir. Nunca llevan un usuario ni una contraseña: solo el nombre del acceso y su cliente.
import { bogotaTime, firstName } from './briaNudges.js';

export const ACCESS_REQUEST_KEY = 'ACCESO';
export const ACCESS_NOTE_MAX = 300;
const AGENCY = 'Brain Studio';

// Sin pedirlo (Rodny, 15 de octubre de 2026: «no tiene que pedírmelo directamente, me debería aparecer a mí el anuncio
// de lo que Camila esté solicitando … y así nos adelantamos aún más»): pedir una contraseña que no se puede ver ya es
// el pedido. Una denegación reciente se respeta durante estos días, para no volver a avisar por lo mismo.
export const ACCESS_DENIAL_DAYS = 7;

const nameOf = (credential = {}) => credential.label || credential.platform || 'ese acceso';
const clientOf = (credential = {}) => credential.clientName || AGENCY;

/** Lo que ve un administrador encima de Bria: quién lo pide, de qué es y los dos botones. */
export const requestNudge = (request) => {
  const credential = request.credential || {};
  const parts = [`Acceso de ${clientOf(credential)}.`];
  if (credential.kind === 'BLOQUE' && credential.platformCount > 0) parts.push(`Es un bloque con ${credential.platformCount} accesos: compartirlo deja ver todos.`);
  if (request.note) parts.push(`«${String(request.note).slice(0, ACCESS_NOTE_MAX)}»`);
  if (request.createdAt) parts.push(`Lo pidió a las ${bogotaTime(request.createdAt)}.`);
  return {
    key: `${ACCESS_REQUEST_KEY}:${request.id}`, kind: 'ACCESO_SOLICITADO', personName: request.requesterName || null,
    title: `${firstName(request.requesterName)} necesita la contraseña de ${nameOf(credential)}`,
    body: parts.join(' '), url: null, taskIds: [],
    actions: [
      { label: 'Compartir', decide: { requestId: request.id, decision: 'APPROVE' } },
      { label: 'Denegar', decide: { requestId: request.id, decision: 'DENY' } }
    ]
  };
};

/** Lo que ve quien pidió cuando un administrador decide. */
export const answerNudge = (request) => {
  const credential = request.credential || {}, who = firstName(request.decidedByName), name = nameOf(credential);
  const approved = request.status === 'APPROVED';
  return {
    key: `${ACCESS_REQUEST_KEY}:${request.id}`, kind: approved ? 'ACCESO_COMPARTIDO' : 'ACCESO_DENEGADO', personName: null,
    title: approved ? `${who} compartió contigo la contraseña de ${name}` : `${who} denegó tu acceso a la contraseña de ${name}`,
    body: approved ? 'Ya puedes pedírsela a Bria.' : null, url: null, taskIds: [],
    actions: approved ? [{ label: 'Ver la contraseña', ask: `Dame la contraseña de ${name} de ${clientOf(credential)}` }] : []
  };
};

export const requestNotificationText = (request) => `${firstName(request.requesterName)} necesita la contraseña de ${nameOf(request.credential)} (${clientOf(request.credential)}).`;
export const answerNotificationText = (request) => (request.status === 'APPROVED'
  ? `${firstName(request.decidedByName)} compartió contigo la contraseña de ${nameOf(request.credential)} (${clientOf(request.credential)}).`
  : `${firstName(request.decidedByName)} denegó tu acceso a la contraseña de ${nameOf(request.credential)}.`);

/** La línea que ve quien decidió, después de que el servidor respondió. Cabe en el aviso (70 caracteres). */
export const decisionMessage = (request, { alreadyDecided = false } = {}) => {
  if (alreadyDecided) return `${firstName(request.decidedByName)} ya lo había decidido.`.slice(0, 70);
  const who = firstName(request.requesterName), name = nameOf(request.credential);
  const text = request.status === 'APPROVED' ? `Compartiste la contraseña de ${name} con ${who}.` : `Le negaste a ${who} la contraseña de ${name}.`;
  return text.length <= 70 ? text : (request.status === 'APPROVED' ? `Compartiste el acceso con ${who}.` : `Le negaste el acceso a ${who}.`);
};

export const cleanAccessNote = (note) => {
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, ACCESS_NOTE_MAX) : null;
};
