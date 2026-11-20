import { getApiBaseUrl } from './apiBaseUrl.js';
// «Bria se adelanta» (10 de octubre de 2026): leer los avisos de hoy y ocultar uno. Misma sesión que el chat.
export const requestBriaNudges = async (suffix = '', { method = 'GET', body } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const response = await fetch(`${base}/api/bria/nudges${suffix}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('[BriaNudge] No se pudo completar la consulta:', data); throw new Error(data.message || 'No se pudieron leer los avisos de Bria.'); }
  return data;
};

/** Enviar con aprobación (20 de noviembre de 2026): la respuesta que la persona revisó, para ese correo. A quién va lo decide el servidor. */
export const sendMailReply = async ({ messageId, text }) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const response = await fetch(`${base}/api/bria/mail/reply`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ messageId, text }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('[BriaNudge] No se pudo enviar la respuesta:', data); throw new Error(data.message || 'No se pudo enviar la respuesta.'); }
  return data;
};
