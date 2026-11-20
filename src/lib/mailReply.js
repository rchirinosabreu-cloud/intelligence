// Enviar una respuesta con aprobación (Rodny, 20 de noviembre de 2026). Reglas puras de lo que puede salir: la
// respuesta la escribe o la corrige una persona, va solo a quien escribió el correo y nunca lleva lo que quedó entre
// corchetes por completar ni una contraseña. El destinatario y el asunto los pone el servidor, no la pantalla.

export const MAIL_REPLY_MAX = 4000;
const SECRET_WORDS = /\b(contrase[ñn]as?|passwords?|api key|c[oó]digo de verificaci[oó]n)\b/i;
const NO_REPLY = /^(no-?reply|noreply|no-?responder|donotreply|do-not-reply|mailer-daemon|postmaster|bounces?)([+.\-_]|@)/i;
const oneLine = (value) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const problem = (status, message) => ({ status, message });

/** El asunto de la respuesta: el del correo con «Re:», en una sola línea para que no pueda traer encabezados. */
export const replySubject = (subject) => {
  const clean = oneLine(subject).slice(0, 200);
  if (!clean) return 'Re: (sin asunto)';
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
};

/** Por qué no se puede enviar a esa dirección, o null. `ours`: las direcciones de los buzones de la agencia. */
export const recipientProblem = (to, ours = []) => {
  if (!to) return problem(400, 'Ese correo no trae una dirección a la que responder.');
  if (NO_REPLY.test(to)) return problem(400, 'Esa dirección no recibe respuestas. Escríbele a la persona desde tu correo.');
  if (ours.map((address) => String(address || '').toLowerCase()).includes(to)) return problem(400, 'Ese correo salió de un buzón de la agencia: no hay a quién responder afuera.');
  return null;
};

/** Por qué no se puede enviar esa respuesta, o null. */
export const replyProblem = ({ text, to, ours = [] }) => {
  const body = String(text || '').trim();
  if (!body) return problem(400, 'Escribe la respuesta antes de enviarla.');
  if (body.length > MAIL_REPLY_MAX) return problem(400, `La respuesta es muy larga: van ${body.length} caracteres y caben ${MAIL_REPLY_MAX}.`);
  if (/\[[^\]\n]{1,80}\]/.test(body)) return problem(400, 'Completa lo que quedó entre corchetes antes de enviarla.');
  if (SECRET_WORDS.test(body)) return problem(400, 'Por aquí no se envían contraseñas ni códigos. Quítalos de la respuesta.');
  return recipientProblem(to, ours);
};
