// Caché de archivos privados (Rodny, 18 de noviembre de 2026: «cuando se sube un video … se cargará de nuevo …
// que la plataforma sea siempre como más fluida»). Reabrir una pieza volvía a bajar su video entero.
//
// Desde el 21 de noviembre de 2026 la copia se guarda EN EL DISPOSITIVO, en un espacio propio de Intelligence
// dentro del navegador (Rodny: «Dale, procede», tras preguntar si haría pesada la plataforma, si el video
// seguía en el bucket y si la limpieza podía ser automática). Sustituye a la regla del 18 de noviembre de
// «vive solo en la memoria de la pestaña: nada va al disco», que obligaba a bajarlo otra vez al recargar la
// página, abrir otra pestaña o cerrar la app en el celular, y llenaba la memoria de la pestaña.
//
// Reglas:
// - el original vive en el almacenamiento (bucket) y de ahí no se mueve: esto es solo una copia de paso, y si
//   se borra no se pierde nada: la próxima vez se vuelve a traer;
// - limpieza automática, sin que nadie haga nada: al cerrar sesión se borra todo; lo que nadie abre en
//   `MAX_IDLE_MS` (7 días) se borra; con el tope de tamaño lleno (`DISK_LIMIT_*`) se borra lo más viejo primero;
//   si entra otra persona en el mismo navegador, se borra lo de la anterior;
// - la clave es la dirección completa, que lleva la versión del archivo (`?v=<clave del almacenamiento>`): una
//   entrega nueva es otra dirección, nunca se muestran bytes viejos, y la copia de la versión anterior se descarta;
// - un error no se guarda: reintentar vuelve a pedir;
// - nada va a `localStorage`. Donde el navegador no ofrece ese espacio (modo privado, páginas sin https), todo
//   sigue funcionando solo con la memoria de la pestaña, como antes.

const MAX_BYTES = 400 * 1024 * 1024;
const CACHE_NAME = 'intelligence-private-media-v1';
const INDEX_KEY = '/__private-media-index__';
export const PRIVATE_MEDIA_MAX_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const PRIVATE_MEDIA_DISK_LIMIT_DESKTOP = 500 * 1024 * 1024;
export const PRIVATE_MEDIA_DISK_LIMIT_MOBILE = 150 * 1024 * 1024;

const entries = new Map();
const saving = new Map();
let totalBytes = 0;
// Cada cierre de sesión cambia la época: lo que estuviera guardándose en ese momento no vuelve a aparecer.
let epoch = 0;
let indexQueue = Promise.resolve();

const authHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};
const defaultFetch = (...args) => fetch(...args);
const cacheStorage = () => (typeof globalThis.caches !== 'undefined' && typeof globalThis.caches?.open === 'function' ? globalThis.caches : null);
const isMobile = () => {
    if (typeof navigator === 'undefined') return false;
    return navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
};
export const privateMediaDiskLimit = () => (isMobile() ? PRIVATE_MEDIA_DISK_LIMIT_MOBILE : PRIVATE_MEDIA_DISK_LIMIT_DESKTOP);
const withoutVersion = source => String(source).split('?', 1)[0];

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

// --- La copia en el dispositivo ---------------------------------------------------------------------------

async function readIndex(cache) {
    try {
        const stored = await cache.match(INDEX_KEY);
        const index = stored ? await stored.json() : null;
        if (index && typeof index.items === 'object' && index.items) return index;
    } catch { /* un índice ilegible se rehace */ }
    return { owner: null, items: {} };
}

/** Una sola lectura-escritura del índice a la vez en esta pestaña; un fallo del navegador nunca rompe la pantalla. */
function withIndex(work, fallback = null) {
    const storage = cacheStorage();
    if (!storage) return Promise.resolve(fallback);
    const startedIn = epoch;
    const run = async () => {
        const cache = await storage.open(CACHE_NAME);
        const index = await readIndex(cache);
        const result = await work(cache, index);
        if (startedIn !== epoch) { await storage.delete(CACHE_NAME); return fallback; }
        await cache.put(INDEX_KEY, new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } }));
        return result;
    };
    indexQueue = indexQueue.then(run, run).catch(() => fallback);
    return indexQueue;
}

async function sweep(cache, index, { now = Date.now(), limit = privateMediaDiskLimit(), keep = null } = {}) {
    const drop = async (source) => { delete index.items[source]; await cache.delete(source, { ignoreVary: true }); };
    for (const [source, item] of Object.entries(index.items)) {
        if (source !== keep && now - (item.usedAt || 0) > PRIVATE_MEDIA_MAX_IDLE_MS) await drop(source);
    }
    const total = () => Object.values(index.items).reduce((sum, item) => sum + (item.size || 0), 0);
    const oldestFirst = Object.entries(index.items).filter(([source]) => source !== keep).sort((a, b) => (a[1].usedAt || 0) - (b[1].usedAt || 0));
    for (const [source] of oldestFirst) {
        if (total() <= limit) break;
        await drop(source);
    }
}

const diskGet = source => withIndex(async (cache, index) => {
    const stored = await cache.match(source, { ignoreVary: true });
    if (!stored) { delete index.items[source]; return null; }
    const blob = await stored.blob();
    index.items[source] = { size: blob.size, usedAt: Date.now() };
    return blob;
});

/** Guarda una respuesta completa. Escribe directo al disco: el archivo no pasa por la memoria de la pestaña. */
async function diskPut(source, response, startedIn = epoch) {
    const storage = cacheStorage();
    if (!storage || response.status !== 200) return false;
    const declared = Number(response.headers?.get?.('content-length')) || 0;
    if (declared > privateMediaDiskLimit() || startedIn !== epoch) return false;
    try {
        const cache = await storage.open(CACHE_NAME);
        await cache.put(source, response);
        if (startedIn !== epoch) { await storage.delete(CACHE_NAME); return false; }
    } catch { return false; }
    return withIndex(async (cache, index) => {
        const stored = await cache.match(source, { ignoreVary: true });
        if (!stored) return false;
        const size = declared || (await stored.blob()).size;
        for (const other of Object.keys(index.items)) {
            if (other !== source && withoutVersion(other) === withoutVersion(source)) { delete index.items[other]; await cache.delete(other, { ignoreVary: true }); }
        }
        index.items[source] = { size, usedAt: Date.now() };
        await sweep(cache, index, { keep: size <= privateMediaDiskLimit() ? source : null });
        return Boolean(index.items[source]);
    }, false);
}

const diskDelete = source => withIndex(async (cache, index) => { delete index.items[source]; await cache.delete(source, { ignoreVary: true }); });

// --- Lo que usan las pantallas ----------------------------------------------------------------------------

function adopt(source, blob) {
    const url = URL.createObjectURL(blob);
    const entry = { refs: 0, usedAt: Date.now(), size: blob.size || 0, url, blob, promise: Promise.resolve({ url, blob }) };
    entries.set(source, entry);
    totalBytes += entry.size;
    evict();
    return entry;
}

function load(source, entry, fetchImpl) {
    const startedIn = epoch;
    return (async () => {
        let blob = await diskGet(source);
        if (!blob) {
            const response = await fetchImpl(source, { headers: authHeaders() });
            if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
            const copy = cacheStorage() && typeof response.clone === 'function' ? response.clone() : null;
            blob = await response.blob();
            if (copy) diskPut(source, copy, startedIn);
        }
        if (entries.get(source) !== entry) return { url: URL.createObjectURL(blob), blob };
        entry.url = URL.createObjectURL(blob);
        entry.blob = blob;
        entry.size = blob.size || 0;
        totalBytes += entry.size;
        evict();
        return { url: entry.url, blob };
    })().catch((error) => { if (entries.get(source) === entry) entries.delete(source); throw error; });
}

/**
 * Devuelve `{ url, blob, release }`: de la pestaña, de la copia del dispositivo o, si no hay, pidiéndolo con la
 * sesión. Quien lo muestra llama `release()` al dejar de mostrarlo. Con `onlyCached` no toca la red: devuelve
 * `null` si el archivo no está guardado (un video se reproduce entonces por pedazos, sin bajarlo entero).
 */
export async function acquirePrivateMedia(source, { fetchImpl = defaultFetch, onlyCached = false } = {}) {
    let entry = entries.get(source);
    if (!entry && onlyCached) {
        const blob = await diskGet(source);
        if (!blob) return null;
        entry = entries.get(source) || adopt(source, blob);
    }
    if (!entry) {
        entry = { refs: 0, usedAt: Date.now(), size: 0, url: null };
        entries.set(source, entry);
        entry.promise = load(source, entry, fetchImpl);
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
    // `blob` son los mismos bytes, para quien los necesita leer (el visor de PDF): volver a pedir la dirección
    // `blob:` con `fetch` lo bloquea en producción la política de seguridad (`connect-src` no admite `blob:`), y
    // así se rompió el visor de manuales de marca el 18 de noviembre de 2026.
    try {
        const { url, blob } = await entry.promise;
        return { url, blob, release };
    } catch (error) {
        release();
        throw error;
    }
}

/**
 * Guarda el archivo en el dispositivo sin mostrarlo (un video que se está reproduciendo por pedazos): la
 * próxima vez abre al instante. No hace nada si ya está, si el navegador no ofrece el espacio o si la persona
 * pidió ahorrar datos. Devuelve si quedó guardado.
 */
export function savePrivateMedia(source, { fetchImpl = defaultFetch } = {}) {
    const storage = cacheStorage();
    if (!storage || !source) return Promise.resolve(false);
    if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return Promise.resolve(false);
    if (saving.has(source)) return saving.get(source);
    const startedIn = epoch;
    const job = (async () => {
        const cache = await storage.open(CACHE_NAME);
        if (await cache.match(source, { ignoreVary: true })) return true;
        const response = await fetchImpl(source, { headers: authHeaders() });
        if (!response.ok) return false;
        return diskPut(source, response, startedIn);
    })().catch(() => false).finally(() => saving.delete(source));
    saving.set(source, job);
    return job;
}

/** ¿Ya está en memoria? Para pintar sin parpadeo de «Cargando…». */
export function cachedPrivateMedia(source) {
    return entries.get(source)?.url || null;
}

/** Olvida un archivo (reintentar tras un fallo de reproducción). */
export function forgetPrivateMedia(source) {
    diskDelete(source);
    const entry = entries.get(source);
    if (!entry) return;
    entries.delete(source);
    if (entry.url) { totalBytes -= entry.size; if (entry.refs === 0) URL.revokeObjectURL(entry.url); }
}

/** Al cerrar sesión: nada de lo que vio una persona queda para la siguiente, ni en la pestaña ni en el dispositivo. */
export function clearPrivateMedia() {
    for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    entries.clear();
    totalBytes = 0;
    epoch += 1;
    const storage = cacheStorage();
    if (!storage) return Promise.resolve();
    const wipe = () => storage.delete(CACHE_NAME).catch(() => false);
    indexQueue = indexQueue.then(wipe, wipe);
    return indexQueue;
}

/**
 * Al reconocer la sesión: si lo guardado era de otra persona, se borra; después pasa la limpieza por tiempo y
 * por tamaño. `now` y `limit` solo existen para probar la regla.
 */
export function claimPrivateMedia(owner, options = {}) {
    const id = String(owner ?? '');
    if (!id) return Promise.resolve();
    return withIndex(async (cache, index) => {
        if (index.owner && index.owner !== id) {
            for (const source of Object.keys(index.items)) await cache.delete(source, { ignoreVary: true });
            index.items = {};
        }
        index.owner = id;
        await sweep(cache, index, options);
    });
}

export const PRIVATE_MEDIA_MAX_BYTES = MAX_BYTES;
