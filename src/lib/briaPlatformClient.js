// Bria habla con la API con la sesión de la persona que le habla (Rodny, 10 de octubre de 2026: «quiero que Bria
// tenga permiso para todo en la plataforma, ella vive ahí … según los módulos a los que ese usuario tiene acceso»).
//
// No se emite ninguna sesión nueva ni existe una segunda tabla de permisos: la llamada lleva **el mismo token** con
// el que la persona abrió el chat, entra por la misma puerta que la pantalla —`authenticateToken`, el módulo, el rol,
// los guardianes de cada ruta— y la API responde exactamente lo que le respondería a ella. Si su sesión vence o se
// revoca, Bria se queda sin manos en ese mismo instante. El rastro queda en la auditoría operativa con su nombre y
// la marca `x-brain-via: bria`. El token nunca se guarda: viaja en la petición y muere con ella.

export const PLATFORM_RESPONSE_LIMIT = 60_000;

export const normalizePlatformPath = (path) => {
  const text = String(path || '').trim();
  if (!text.startsWith('/')) throw Object.assign(new Error('La ruta debe empezar por «/».'), { status: 400, code: 'BRIA_PLATFORM_PATH' });
  if (text.includes('..') || /\s/.test(text) || text.includes('//')) throw Object.assign(new Error('Esa ruta no es válida.'), { status: 400, code: 'BRIA_PLATFORM_PATH' });
  return text.startsWith('/api/') ? text.slice(4) : text;
};

const humanStatus = (status, body) => {
  const message = body && typeof body === 'object' ? (body.error || body.message) : null;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (status === 401) return 'Tu sesión no se aceptó: vuelve a entrar.';
  if (status === 403) return 'No tienes permiso para eso.';
  if (status === 404) return 'Eso no existe.';
  if (status === 423) return 'Está bloqueado por un compromiso con hora.';
  if (status >= 500) return 'La plataforma falló al atenderlo.';
  return `La plataforma respondió ${status}.`;
};

export const createBriaPlatformClient = ({ baseUrl = `http://127.0.0.1:${process.env.PORT || 3000}`, fetchFn = (...args) => fetch(...args), limit = PLATFORM_RESPONSE_LIMIT } = {}) => ({
  async call({ token, method = 'GET', path, body }) {
    if (!token) throw Object.assign(new Error('Esta conversación no trae tu sesión: recarga la página e inténtalo de nuevo.'), { status: 401, code: 'BRIA_PLATFORM_SESSION' });
    const route = normalizePlatformPath(path);
    const verb = String(method || 'GET').toUpperCase();
    const withBody = body !== undefined && body !== null && verb !== 'GET';
    const response = await fetchFn(`${baseUrl}/api${route}`, {
      method: verb,
      headers: { Authorization: `Bearer ${token}`, 'x-brain-via': 'bria', Accept: 'application/json', ...(withBody ? { 'Content-Type': 'application/json' } : {}) },
      ...(withBody ? { body: JSON.stringify(body) } : {})
    });
    const type = response.headers?.get?.('content-type') || '';
    let data = null, text = '';
    if (type.includes('application/json')) data = await response.json().catch(() => null);
    else text = await response.text().catch(() => '');
    const ok = response.status >= 200 && response.status < 300;
    const raw = data !== null ? JSON.stringify(data) : text;
    return {
      ok, status: response.status, data,
      text: raw.length > limit ? `${raw.slice(0, limit)}… [respuesta recortada: ${raw.length} caracteres]` : raw,
      truncated: raw.length > limit,
      error: ok ? null : humanStatus(response.status, data)
    };
  }
});

let instance;
export const getBriaPlatformClient = () => instance ||= createBriaPlatformClient();
