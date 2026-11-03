import { getApiBaseUrl } from './apiBaseUrl.js';
// La liga del mes (3 de noviembre de 2026): leer la liga de quien pregunta y regalar los cinco puntos de la semana.
// Misma sesión que el resto de la plataforma. Un error trae su `status`, para que la copa sepa que no hay ficha (404).
export const requestLeague = async (suffix = '', { method = 'GET', body } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const response = await fetch(`${base}/api/league${suffix}`, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Liga] No se pudo completar la consulta:', data);
    throw Object.assign(new Error(data.error || data.message || 'No pudimos cargar la liga.'), { status: response.status, code: data.code });
  }
  return data;
};
