import { getApiBaseUrl } from './apiBaseUrl.js';
export const requestBriaChat = async (suffix = '', { method = 'GET', body } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/api/bria/conversations${suffix}`, { method, credentials: 'same-origin', headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('[BriaConversation] No se pudo completar la consulta:', data); throw new Error(data.message || 'Bria no pudo responder. Intenta nuevamente.'); }
  return data;
};
// Respuesta en vivo (9 de octubre de 2026): manda el mensaje pidiendo `text/event-stream`, entrega cada avance a
// `onEvent` (qué está haciendo Bria, el texto que va escribiendo, «borra lo escrito») y devuelve el chat guardado,
// que es el que manda. Si el servidor contesta con el JSON de siempre, se usa tal cual.
export const streamBriaChat = async (suffix, { body, onEvent = () => {} } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/api/bria/conversations${suffix}`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'text/event-stream', ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: multipart ? body : JSON.stringify(body || {}) });
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('[BriaConversation] No se pudo completar la consulta:', data); throw new Error(data.message || 'Bria no pudo responder. Intenta nuevamente.'); }
    return data;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) continue;
      let event; try { event = JSON.parse(data); } catch { continue; }
      if (event.type === 'done') return event.chat;
      if (event.type === 'error') { console.error('[BriaConversation] No se pudo completar la consulta:', event); throw new Error(event.message || 'Bria no pudo responder. Intenta nuevamente.'); }
      onEvent(event);
    }
  }
  console.error('[BriaConversation] La respuesta se cortó antes de terminar.');
  throw new Error('La respuesta se cortó antes de terminar. Revisa tu conexión e intenta de nuevo.');
};
export const downloadBriaAttachment = async (conversationId, file) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = getApiBaseUrl();
  const response = await fetch(`${base}/api/bria/conversations/${conversationId}/attachments/${file.id}`, { credentials: 'same-origin', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) { const data = await response.json().catch(() => ({})); console.error('[BriaAttachment]', data); throw new Error(data.message || 'No se pudo descargar el adjunto.'); }
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
  link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
