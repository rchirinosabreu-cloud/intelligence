import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl.js';
import { FINAL_ASSETS_PER_ITEM, planFinalAssetUpload } from './uploadLimits.js';

// Gestión y Parrillas entregan por las mismas rutas. El servidor conserva revisión,
// límites y permisos; añadir material no mueve una tarea ni publica en redes.
export async function uploadFinalPiece(itemId, files, options = {}) {
  const replace = options.replace === true;
  const expectedRevision = options.expectedRevision;
  if (replace && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    throw new Error('Actualiza la pieza para conocer la revisión de la entrega antes de sustituirla.');
  }
  const { problem, mode } = planFinalAssetUpload(files, replace ? { maxFiles: FINAL_ASSETS_PER_ITEM } : undefined);
  if (problem) throw new Error(problem);
  const { client = axios, apiBase = getApiBaseUrl(), token = localStorage.getItem('authToken'), onProgress } = options;
  const base = `${apiBase}/api/content/items/${encodeURIComponent(itemId)}/${replace ? 'delivery' : 'final-assets'}`;
  const headers = { Authorization: `Bearer ${token}` };
  const requestId = replace ? options.requestId || crypto.randomUUID() : undefined;
  if (mode === 'server') {
    const body = new FormData();
    files.forEach(file => body.append('files', file));
    if (replace) {
      body.append('expectedRevision', String(expectedRevision));
      body.append('requestId', requestId);
    }
    return (await client.post(replace ? `${base}/replace` : base, body, { headers })).data;
  }
  onProgress?.(0);
  const { data: upload } = await client.post(`${base}/direct-upload`, {
    files: files.map(file => ({ name: file.name, size: file.size, mimeType: file.type })),
    ...(replace ? { expectedRevision, requestId } : {}),
  }, { headers });
  if (replace && upload.committed === true) return upload.delivery;
  const tickets = replace ? upload.tickets : upload;
  if (!Array.isArray(tickets) || tickets.length !== files.length || (replace && !upload.uploadId)) {
    throw new Error('No se pudo preparar la entrega completa. Vuelve a intentarlo.');
  }
  const total = files.reduce((sum, file) => sum + (file.size || 0), 0) || 1;
  const sent = new Array(files.length).fill(0);
  await Promise.all(tickets.map((ticket, index) => client.put(ticket.url, files[index], {
    headers: { 'Content-Type': ticket.mimeType },
    onUploadProgress: event => {
      sent[index] = event.loaded || 0;
      onProgress?.(Math.min(99, Math.round(sent.reduce((sum, value) => sum + value, 0) / total * 100)));
    }
  })));
  return (await client.post(`${base}/confirm`, replace ? { uploadId: upload.uploadId, expectedRevision, requestId } : {
    uploads: tickets.map(ticket => ({ key: ticket.key, name: ticket.name }))
  }, { headers })).data;
}
