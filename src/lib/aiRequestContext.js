import { AsyncLocalStorage } from 'node:async_hooks';

// Contexto de la petición para el registro de uso de IA (27 de septiembre de 2026). Así el
// control de salida sabe quién pidió la llamada y desde qué módulo sin que cada servicio
// tenga que pasarlo a mano. Fuera de una petición (tareas programadas) no hay contexto.

const storage = new AsyncLocalStorage();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_ID = /^[a-z0-9_-]{20,}$/i;

export const normalizeRoute = (method, url) => {
    const path = String(url || '').split('?')[0].replace(/\/+$/, '');
    const normalized = path.split('/').map((segment) => (UUID.test(segment) || /^\d+$/.test(segment) || LONG_ID.test(segment) ? ':id' : segment)).join('/');
    return `${String(method || 'GET').toUpperCase()} ${normalized.slice(0, 200)}`;
};

export const moduleOf = (url) => String(url || '').split('?')[0].replace(/^\/api\/?/, '').split('/')[0] || null;

export const aiRequestContextMiddleware = (req, res, next) => {
    storage.run({
        actorId: req.user?.userId || req.user?.id || null,
        module: moduleOf(req.originalUrl),
        route: normalizeRoute(req.method, req.originalUrl)
    }, next);
};

export const runWithAiContext = (context, fn) => storage.run({ actorId: null, module: null, route: null, ...context }, fn);

export const currentAiContext = () => storage.getStore() || null;
