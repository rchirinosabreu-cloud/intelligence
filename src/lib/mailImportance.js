// Qué correo merece un aviso de Bria (Rodny, 11 de octubre de 2026: «recordarnos si recibimos un correo importante
// y que … aparezca allí como un recordatorio arribita de Bria»). Lógica pura y de reglas: viene de un contacto de un
// cliente registrado, habla de dinero, aprobaciones o urgencia, o es una respuesta a un hilo que abrió la agencia.
// Bria pondera después el hecho con los demás del pulso; aquí solo se decide si entra y por qué.
//
// Nunca se guarda el cuerpo del correo: de aquí salen remitente, asunto, fecha, motivo y un extracto corto.

const MONEY = /\b(pago|pagar|pagamos|factura|facturaci[oó]n|cuenta de cobro|transferencia|consignaci[oó]n|cotizaci[oó]n|propuesta|presupuesto|contrato|renovaci[oó]n|invoice|payment)\b/i;
const APPROVAL = /\b(aprob(ad[oa]s?|amos|ar|aci[oó]n)|visto bueno|vo\.?\s?bo\.?|autoriz(ad[oa]|amos|ar)|confirma(d[oa]|mos|r)|aceptamos|aceptad[oa])\b/i;
const URGENT = /\b(urgente|urgencia|hoy mismo|lo antes posible|cuanto antes|asap|inmediat[oa]|para hoy|prioridad)\b/i;
const CHANGES = /\b(cambio|cambios|correcci[oó]n|correcciones|ajuste|ajustes|no nos gust|rechaz|devolv|reclamo|queja|molest|inconform)\b/i;
const NOISE_SENDERS = /(no-?reply|noreply|notifications?|mailer-daemon|newsletter|marketing|info@|news@|hello@|team@)/i;
const NOISE_SUBJECTS = /\b(newsletter|unsubscribe|promoci[oó]n|descuento|oferta|webinar|boletín|boletin|tu factura de|recibo de pago|verification code|código de verificaci[oó]n|security alert|alerta de seguridad|password|contraseña)\b/i;
const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'me.com']);

export const MAIL_REASONS = Object.freeze({ CLIENTE: 'de un cliente', DINERO: 'habla de dinero o contrato', APROBACION: 'habla de una aprobación', URGENTE: 'lo marcan urgente', CAMBIOS: 'pide cambios o se queja', RESPUESTA: 'responde a un hilo de la agencia' });

export const addressOf = (value) => { const match = String(value || '').toLowerCase().match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/); return match ? match[0] : null; };
export const domainOf = (address) => { const at = String(address || '').lastIndexOf('@'); return at >= 0 ? String(address).slice(at + 1).toLowerCase() : null; };

/**
 * `clients`: [{ name, emails: [...], domains: [...] }] sacados de las fichas (correo de contacto, cartera, CRM).
 * Devuelve el cliente que escribe, por correo exacto o, si el dominio no es de correo gratuito, por dominio.
 */
export const matchClient = (fromAddress, clients = []) => {
  const address = addressOf(fromAddress);
  if (!address) return null;
  const domain = domainOf(address);
  for (const client of clients) if ((client.emails || []).some((email) => String(email).toLowerCase() === address)) return client;
  if (domain && !FREE_MAIL.has(domain)) for (const client of clients) if ((client.domains || []).some((d) => String(d).toLowerCase() === domain)) return client;
  return null;
};

export const isNoise = ({ from, subject }) => NOISE_SENDERS.test(String(from || '')) || NOISE_SUBJECTS.test(String(subject || ''));

/**
 * `message`: { id, from, fromName, subject, date, snippet, inReplyTo, ourAddresses }.
 * Devuelve null si no merece aviso, o { reasons: [...], severity, client } si sí.
 */
export const assessMail = (message, { clients = [], ourAddresses = [] } = {}) => {
  if (!message || isNoise(message)) return null;
  const from = addressOf(message.from);
  if (!from || ourAddresses.map((a) => String(a).toLowerCase()).includes(from)) return null;
  const text = `${message.subject || ''}\n${message.snippet || ''}`;
  const reasons = [];
  const client = matchClient(from, clients);
  if (client) reasons.push('CLIENTE');
  if (MONEY.test(text)) reasons.push('DINERO');
  if (APPROVAL.test(text)) reasons.push('APROBACION');
  if (URGENT.test(text)) reasons.push('URGENTE');
  if (CHANGES.test(text)) reasons.push('CAMBIOS');
  if (message.inReplyTo && !client) reasons.push('RESPUESTA');
  // Un desconocido que solo dice «urgente» no entra: hace falta cliente, dinero, aprobación o cambios, o una respuesta.
  const strong = reasons.some((r) => ['CLIENTE', 'DINERO', 'APROBACION', 'CAMBIOS', 'RESPUESTA'].includes(r));
  if (!strong) return null;
  const severity = client && (reasons.includes('CAMBIOS') || reasons.includes('URGENTE') || reasons.includes('DINERO')) ? 3 : client || reasons.includes('DINERO') || reasons.includes('APROBACION') ? 2 : 1;
  return { reasons, severity, client: client ? { name: client.name, slug: client.slug || null } : null };
};

const shorten = (value, max) => { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

/** El hecho para el pulso: una frase con quién escribe, de qué y por qué importa; sin cuerpo del correo. */
export const describeMail = (message, assessment, { mailboxLabel } = {}) => {
  const who = message.fromName ? `${message.fromName} (${addressOf(message.from)})` : addressOf(message.from);
  const client = assessment.client ? ` de ${assessment.client.name}` : '';
  const why = assessment.reasons.map((r) => MAIL_REASONS[r]).filter(Boolean).slice(0, 3).join(', ');
  return `Correo${mailboxLabel ? ` en ${mailboxLabel}` : ''}${client} de ${who}: «${shorten(message.subject || '(sin asunto)', 90)}» — ${why}.`;
};

/** Enlace al mensaje en Gmail por su identificador RFC 822; sirve para Gmail y para Workspace. */
export const gmailLink = (messageId) => { const id = String(messageId || '').replace(/^<|>$/g, ''); return id ? `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(id)}` : null; };
