import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl.js';

export function taskDeliverableUploadPlan(files, limits) {
  if (!files?.length) return { problem: 'Selecciona al menos un archivo.' };
  if (!limits?.maxFiles || !limits?.maxServerBytes || !limits?.maxDirectBytes) return { problem: 'No pudimos comprobar los límites de entrega. Actualiza la tarea.' };
  if (files.length > limits.maxFiles) return { problem: `Puedes entregar hasta ${limits.maxFiles} archivos por conjunto.` };
  if (files.some(file => !Number.isFinite(file.size) || file.size <= 0)) return { problem: 'No se pueden entregar archivos vacíos.' };
  if (files.some(file => file.size > limits.maxDirectBytes)) return { problem: 'Un archivo supera el límite de tamaño permitido.' };
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return { mode: files.some(file => file.size > limits.maxServerBytes) || total > (limits.maxServerTotalBytes || limits.maxServerBytes) ? 'direct' : 'server' };
}

function requestOptions(options) {
  if (!Number.isInteger(options.expectedRevision) || options.expectedRevision < 0 || !options.requestId) throw new Error('Actualiza la entrega antes de guardarla.');
  return { client: options.client || axios, apiBase: options.apiBase ?? getApiBaseUrl(),
    headers: { Authorization: `Bearer ${options.token ?? localStorage.getItem('authToken')}` } };
}

export async function uploadTaskDeliverables(taskId, files, options) {
  const { problem, mode } = taskDeliverableUploadPlan(files, options.limits);
  if (problem) throw new Error(problem);
  const { client, apiBase, headers } = requestOptions(options);
  const base = `${apiBase}/api/tasks/${encodeURIComponent(taskId)}/deliverables`;
  const { expectedRevision, requestId, onProgress } = options;
  if (mode === 'server') {
    const body = new FormData();
    files.forEach(file => body.append('files', file));
    body.append('expectedRevision', String(expectedRevision));
    body.append('requestId', requestId);
    return (await client.post(base, body, { headers })).data;
  }
  onProgress?.(0);
  const { data: ticket } = await client.post(`${base}/direct-upload`, {
    files: files.map(file => ({ name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' })),
    expectedRevision, requestId,
  }, { headers });
  if (ticket.alreadyCommitted) return ticket;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const sent = files.map(() => 0);
  await Promise.all(ticket.uploads.map((upload, index) => client.put(upload.url, files[index], {
    headers: { 'Content-Type': upload.mimeType },
    onUploadProgress: event => {
      sent[index] = event.loaded || 0;
      onProgress?.(Math.min(99, Math.round(sent.reduce((sum, value) => sum + value, 0) / total * 100)));
    },
  })));
  return (await client.post(`${base}/confirm`, { uploads: ticket.uploads, expectedRevision, requestId }, { headers })).data;
}

export async function reorderTaskDeliverables(taskId, order, options) {
  const { client, apiBase, headers } = requestOptions(options);
  return (await client.put(`${apiBase}/api/tasks/${encodeURIComponent(taskId)}/deliverables/order`, {
    order, expectedRevision: options.expectedRevision, requestId: options.requestId,
  }, { headers })).data;
}
