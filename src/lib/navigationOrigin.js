import { PLATFORM_MODULES } from './platformModules.js';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026: «un problema GENERAL que estoy viendo en la plataforma es la
// dificultad de viajar y regresar al módulo o ventana donde uno estaba»). Quien sale de una pantalla por un enlace de
// la plataforma lleva en el estado de la navegación de dónde viene: la dirección, un nombre que se lee y la posición en
// la página. La pantalla de llegada le ofrece «Volver a …» y lo deja donde estaba. Regla pura: la usan el botón de
// `BackToOrigin` y cada enlace que viaja.

const MAX_LABEL = 60;
const FALLBACK_LABEL = 'la pantalla anterior';
const MAX_ORIGINS = 12;

// Pantallas que no son un módulo de la lista, o que dentro de un módulo se llaman distinto. Las más concretas, primero.
const SCREENS = [
    ['/clientes/operacion/', 'Operación'],
    ['/cliente/', 'Espacio del cliente'],
    ['/salud-operativa', 'Salud operativa'],
    ['/gobierno-ia', 'Gobierno de IA'],
    ['/perfil', 'Perfil'],
];

const isInternal = (path) => typeof path === 'string' && path.startsWith('/')
    && !path.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(path);
const clip = (text) => String(text || '').trim().slice(0, MAX_LABEL);
const startsWithPath = (pathname, prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
const pathnameOf = (path) => String(path || '').split(/[?#]/)[0];
const position = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
const locationPath = ({ pathname, search = '', hash = '' }) => `${pathname}${search || ''}${hash || ''}`;

// Solo procedencia de navegación. Nunca se copia el estado completo de una pantalla, que puede contener un pedido
// para crear algo o un borrador. Limitar y quitar ciclos evita que un viaje largo infle history.state indefinidamente.
const cleanOrigin = (from, seen = new Set(), depth = 0) => {
    if (!from || !isInternal(from.path) || depth >= MAX_ORIGINS) return null;
    const pathname = pathnameOf(from.path);
    if (seen.has(pathname)) return null;
    seen.add(pathname);
    const result = { path: from.path, label: clip(from.label) || labelForPath(from.path), scrollY: position(from.scrollY) };
    if (typeof from.key === 'string') result.key = from.key.slice(0, 80);
    const previous = cleanOrigin(from.previous, seen, depth + 1);
    if (previous) result.previous = previous;
    return result;
};

/** El nombre de una pantalla por su dirección: «Gestión», «Parrillas», «Operación»… */
export const labelForPath = (path) => {
    const pathname = String(path || '').split(/[?#]/)[0];
    if (pathname === '/' || pathname === '') return 'Inicio';
    const screen = SCREENS.find(([prefix]) => startsWithPath(pathname, prefix));
    if (screen) return screen[1];
    const module = PLATFORM_MODULES.find((item) => startsWithPath(pathname, item.path));
    // «Gestión (Tareas)» es el nombre de la casilla de permisos; en un botón basta «Gestión».
    return module ? module.label.replace(/\s*\(.*\)$/, '') : FALLBACK_LABEL;
};

// El nombre que la pantalla abierta se puso a sí misma («Operación · Verona»). Uno solo a la vez: es la pantalla abierta.
let pageLabel = null;
export const setPageLabel = (pathname, label) => { pageLabel = label ? { pathname, label: clip(label) } : null; };
export const clearPageLabel = (pathname) => { if (pageLabel?.pathname === pathname) pageLabel = null; };

/** Lo que lleva una navegación que sale de esta pantalla: `navigate(to, { state: originState(location) })`. */
export const originState = (location, { label, scrollY = 0, originPath } = {}) => {
    const { pathname, key, state } = location;
    const path = isInternal(originPath) && pathnameOf(originPath) === pathname ? originPath : locationPath(location);
    const from = {
        path,
        label: clip(label) || (pageLabel?.pathname === pathname ? pageLabel.label : '') || labelForPath(pathname),
        scrollY: position(scrollY),
    };
    if (typeof key === 'string') from.key = key;
    const previous = cleanOrigin(state?.from, new Set([pathnameOf(path)]), 1);
    if (previous) from.previous = previous;
    return { from };
};

/** Un cambio de selección mantiene el origen; salir de pantalla agrega un paso a la cadena. */
export const navigationState = (location, destination, { state, ...options } = {}) => {
    const targetPath = typeof destination === 'string' ? pathnameOf(destination) : destination?.pathname;
    if (targetPath === location.pathname) return { ...(location.state || {}), ...(state || {}) };
    return { ...(state || {}), ...originState(location, options) };
};

/** Volver recupera el paso anterior, sin ejecutar de nuevo instrucciones de la pantalla de origen. */
export const navigationReturnState = (origin) => {
    const from = cleanOrigin(origin);
    if (!from) return {};
    return {
        restoreScrollY: from.scrollY,
        restoreScrollKey: from.key || `${from.path}:${from.scrollY}`,
        ...(from.previous ? { from: from.previous } : {}),
    };
};

/**
 * El origen al que se puede volver desde esta pantalla, o `null`. Nunca una dirección de fuera, y nunca la misma
 * pantalla: abrir una tarea dentro de Gestión cambia la consulta, no de pantalla, y «Volver a Gestión» ahí no dice nada.
 */
export const readOrigin = (state, { pathname }) => {
    let from = cleanOrigin(state?.from);
    while (from && pathnameOf(from.path) === pathname) from = from.previous || null;
    return from;
};
