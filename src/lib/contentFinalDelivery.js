import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl.js';
import { planFinalAssetUpload } from './uploadLimits.js';

// Gestión y Parrillas entregan por las mismas rutas. El servidor conserva revisión,
// límites y permisos; añadir material no mueve una tarea ni publica en redes.
export async function uploadFinalPiece(itemId, files, options = {}) {
  const { problem, mode } = planFinalAssetUpload(files);
  if (problem) throw new Error(problem);
  const { client = axios, apiBase = getApiBaseUrl(), token = localStorage.getItem('authToken'), onProgress } = options;
  const base = `${apiBase}/api/content/items/${encodeURIComponent(itemId)}/final-assets`;
  const headers = { Authorization: `Bearer ${token}` };
  if (mode === 'server') {
    const body = new FormData();
    files.forEach(file => body.append('files', file));
    return (await client.post(base, body, { headers })).data;
  }
  onProgress?.(0);
  const { data: tickets } = await client.post(`${base}/direct-upload`, {
    files: files.map(file => ({ name: file.name, size: file.size, mimeType: file.type }))
  }, { headers });
  const total = files.reduce((sum, file) => sum + (file.size || 0), 0) || 1;
  const sent = new Array(files.length).fill(0);
  await Promise.all(tickets.map((ticket, index) => client.put(ticket.url, files[index], {
    headers: { 'Content-Type': ticket.mimeType },
    onUploadProgress: event => {
      sent[index] = event.loaded || 0;
      onProgress?.(Math.min(99, Math.round(sent.reduce((sum, value) => sum + value, 0) / total * 100)));
    }
  })));
  return (await client.post(`${base}/confirm`, {
    uploads: tickets.map(ticket => ({ key: ticket.key, name: ticket.name }))
  }, { headers })).data;
}
