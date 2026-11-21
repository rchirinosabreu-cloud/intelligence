import { getApiBaseUrl } from './apiBaseUrl.js';

// Pase de reproducción en la pantalla (21 de noviembre de 2026). Un `<video>` no puede mandar la cabecera de
// sesión; con el pase en la dirección el navegador pide el video por pedazos y arranca sin bajarlo entero.
// El pase vive solo en la memoria de la pestaña, se comparte entre todas las tarjetas y se renueva a la mitad
// de su vida. Si no se consigue, quien llama vuelve al camino de siempre (bajar el archivo con la sesión).

let current = null;

const authHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export function getMediaTicket({ fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
    if (current && current.expiresAt > now()) return current.promise;
    const entry = { expiresAt: now() + 60_000 };
    entry.promise = Promise.resolve()
        .then(() => fetchImpl(`${getApiBaseUrl()}/api/content/media-ticket`, { method: 'POST', headers: authHeaders() }))
        .then(response => (response.ok ? response.json() : null))
        .then((data) => {
            if (!data?.ticket) { if (current === entry) current = null; return null; }
            entry.expiresAt = now() + (Number(data.expiresIn) || 600) * 500;
            return data.ticket;
        })
        .catch(() => { if (current === entry) current = null; return null; });
    current = entry;
    return entry.promise;
}

/** Al cerrar sesión, o cuando un video rechaza el pase. */
export function clearMediaTicket() { current = null; }

/** `#t=` hace que el iPhone pinte el primer cuadro sin tener que darle a reproducir. */
export const mediaStreamUrl = (source, ticket) => `${source}${String(source).includes('?') ? '&' : '?'}access_token=${encodeURIComponent(ticket)}#t=0.001`;
