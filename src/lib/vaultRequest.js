import { getApiBaseUrl } from './apiBaseUrl.js';

// Llamadas a la bóveda. Sin caché: una contraseña nunca debe quedar guardada en el navegador.
export const requestVault = async (suffix = '', options = {}, transport = globalThis.fetch) => {
  const token = globalThis.localStorage?.getItem('authToken');
  const base = import.meta.env ? getApiBaseUrl() : '';
  const response = await transport(`${base}/api/vault${suffix}`, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Vault]', response.status, payload?.code || payload?.error);
    throw Object.assign(new Error(payload.error || payload.message || 'No pudimos completar la operación de la bóveda.'), { status: response.status, code: payload.code });
  }
  return payload;
};

/** Cuánto se ve una contraseña antes de ocultarse sola. */
export const VAULT_REVEAL_MS = 60_000;
