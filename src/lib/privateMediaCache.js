// Caché de archivos privados en la memoria de la pestaña (Rodny, 18 de noviembre de 2026: «cuando se sube un
// video … se cargará de nuevo … que la plataforma sea siempre como más fluida»). Reabrir una pieza volvía a
// bajar su video entero porque cada tarjeta pedía los bytes al montarse y los soltaba al cerrarse.
//
// Reglas, que sustituyen a la de «no conservar una caché global de archivos privados» del 9 de noviembre:
// - vive solo en la memoria de la pestaña: nada va al disco ni a `localStorage`, y cerrar sesión la vacía;
// - la clave es la dirección completa, que lleva la versión del archivo (`?v=<clave del almacenamiento>`): una
//   entrega nueva es otra dirección, así que nunca se muestran bytes viejos;
// - un error no se guarda: reintentar vuelve a pedir;
// - tiene tope (`MAX_BYTES`): se suelta lo usado hace más tiempo, nunca lo que una pantalla está mostrando.

const MAX_BYTES = 400 * 1024 * 1024;
const entries = new Map();
let totalBytes = 0;

const authHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

function evict() {
    if (totalBytes <= MAX_BYTES) return;
    const idle = [...entries.entries()].filter(([, entry]) => entry.url && entry.refs === 0).sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key, entry] of idle) {
        if (totalBytes <= MAX_BYTES) break;
        URL.revokeObjectURL(entry.url);
        totalBytes -= entry.size;
        entries.delete(key);
    }
}

/**
 * Pide el archivo con la sesión y devuelve `{ url, release }`. Quien lo muestra llama `release()` al dejar de
 * mostrarlo; el archivo se queda en memoria para la próxima vez.
 */
export async function acquirePrivateMedia(source, { fetchImpl = (...args) => fetch(...args) } = {}) {
    let entry = entries.get(source);
    if (!entry) {
        entry = { refs: 0, usedAt: Date.now(), size: 0, url: null };
        entry.promise = fetchImpl(source, { headers: authHeaders() })
            .then(async (response) => {
                if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
                const blob = await response.blob();
                if (entries.get(source) !== entry) return URL.createObjectURL(blob);
                entry.url = URL.createObjectURL(blob);
                entry.size = blob.size || 0;
                totalBytes += entry.size;
                evict();
                return entry.url;
            })
            .catch((error) => { if (entries.get(source) === entry) entries.delete(source); throw error; });
        entries.set(source, entry);
    }
    entry.refs += 1;
    entry.usedAt = Date.now();
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        entry.refs = Math.max(0, entry.refs - 1);
        entry.usedAt = Date.now();
        // Olvidada mientras se mostraba: al soltarla ya nadie más la tiene.
        if (entries.get(source) !== entry) { if (entry.refs === 0 && entry.url) URL.revokeObjectURL(entry.url); return; }
        evict();
    };
    try {
        return { url: await entry.promise, release };
    } catch (error) {
        release();
        throw error;
    }
}

/** ¿Ya está en memoria? Para pintar sin parpadeo de «Cargando…». */
export function cachedPrivateMedia(source) {
    return entries.get(source)?.url || null;
}

/** Olvida un archivo (reintentar tras un fallo de reproducción). */
export function forgetPrivateMedia(source) {
    const entry = entries.get(source);
    if (!entry) return;
    entries.delete(source);
    if (entry.url) { totalBytes -= entry.size; if (entry.refs === 0) URL.revokeObjectURL(entry.url); }
}

/** Al cerrar sesión: nada de lo que vio una persona queda para la siguiente. */
export function clearPrivateMedia() {
    for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    entries.clear();
    totalBytes = 0;
}

export const PRIVATE_MEDIA_MAX_BYTES = MAX_BYTES;
