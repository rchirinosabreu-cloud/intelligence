import { PLATFORM_MODULES } from './platformModules.js';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026: «un problema GENERAL que estoy viendo en la plataforma es la
// dificultad de viajar y regresar al módulo o ventana donde uno estaba»). Quien sale de una pantalla por un enlace de
// la plataforma lleva en el estado de la navegación de dónde viene: la dirección, un nombre que se lee y la posición en
// la página. La pantalla de llegada le ofrece «Volver a …» y lo deja donde estaba. Regla pura: la usan el botón de
// `BackToOrigin` y cada enlace que viaja.

const MAX_LABEL = 60;
const FALLBACK_LABEL = 'la pantalla anterior';

// Pantallas que no son un módulo de la lista, o que dentro de un módulo se llaman distinto. Las más concretas, primero.
const SCREENS = [
    ['/clientes/operacion/', 'Operación'],
    ['/cliente/', 'Espacio del cliente'],
    ['/salud-operativa', 'Salud operativa'],
    ['/gobierno-ia', 'Gobierno de IA'],
    ['/perfil', 'Perfil'],
];

const isInternal = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
const clip = (text) => String(text || '').trim().slice(0, MAX_LABEL);
const startsWithPath = (pathname, prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);

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
export const originState = ({ pathname, search = '' }, { label, scrollY = 0 } = {}) => ({
    from: {
        path: `${pathname}${search || ''}`,
        label: clip(label) || (pageLabel?.pathname === pathname ? pageLabel.label : '') || labelForPath(pathname),
        scrollY: Math.max(0, Math.round(Number(scrollY) || 0)),
    },
});

/**
 * El origen al que se puede volver desde esta pantalla, o `null`. Nunca una dirección de fuera, y nunca la misma
 * pantalla: abrir una tarea dentro de Gestión cambia la consulta, no de pantalla, y «Volver a Gestión» ahí no dice nada.
 */
export const readOrigin = (state, { pathname, search = '' }) => {
    const from = state?.from;
    if (!from || !isInternal(from.path)) return null;
    const fromPathname = from.path.split(/[?#]/)[0];
    if (from.path === `${pathname}${search || ''}` || fromPathname === pathname) return null;
    return {
        path: from.path,
        label: clip(from.label) || labelForPath(from.path),
        scrollY: Math.max(0, Math.round(Number(from.scrollY) || 0)),
    };
};
