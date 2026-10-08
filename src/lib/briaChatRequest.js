import { getApiBaseUrl } from './apiBaseUrl.js';
export const requestBriaChat = async (suffix = '', { method = 'GET', body } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/api/bria/conversations${suffix}`, { method, credentials: 'same-origin', headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('[BriaConversation] No se pudo completar la consulta:', data); throw new Error(data.message || 'Bria no pudo responder. Intenta nuevamente.'); }
  return data;
};
export const downloadBriaAttachment = async (conversationId, file) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = getApiBaseUrl();
  const response = await fetch(`${base}/api/bria/conversations/${conversationId}/attachments/${file.id}`, { credentials: 'same-origin', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) { const data = await response.json().catch(() => ({})); console.error('[BriaAttachment]', data); throw new Error(data.message || 'No se pudo descargar el adjunto.'); }
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
  link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
