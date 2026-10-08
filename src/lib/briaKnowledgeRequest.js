import { getApiBaseUrl } from './apiBaseUrl.js';
export const requestKnowledge = async (suffix = '', options = {}, transport = globalThis.fetch) => {
  const token = globalThis.localStorage?.getItem('authToken');
  const base = import.meta.env ? getApiBaseUrl() : '';
  const response = await transport(`${base}/api/bria/knowledge${suffix}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[BriaMemory]', payload);
    throw new Error(payload.message || 'No se pudo consultar la memoria.');
  }
  return payload;
};
