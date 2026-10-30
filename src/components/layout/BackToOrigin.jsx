import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ChevronLeft } from '@/components/ui/icons';
import { clearPageLabel, originState, readOrigin, setPageLabel } from '@/lib/navigationOrigin';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026). Tres piezas, una sola vez para toda la plataforma:
// - `useNavigateFrom`: el enlace que sale de una pantalla lleva de dónde viene.
// - `BackToOrigin`: la pantalla de llegada ofrece «Volver a …», que deja a la persona donde estaba.
// - `useScrollMemory`: «atrás» del navegador también vuelve a la misma altura de la página.

const SCROLL_KEY = 'brain:scroll-positions';
const MAX_REMEMBERED = 60;
const RESTORE_FOR_MS = 2500;

const readPositions = () => {
  try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}') || {}; } catch { return {}; }
};
const rememberPosition = (key, y) => {
  if (!key) return;
  try {
    const positions = readPositions();
    delete positions[key];
    positions[key] = Math.round(y);
    const keys = Object.keys(positions);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete positions[old];
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(positions));
  } catch { /* Sin almacenamiento, solo no se recuerda la altura. */ }
};

/**
 * Lleva la página a una altura y la sostiene mientras la pantalla termina de cargar (los datos llegan después y la
 * página crece, o una pantalla se sube sola al montarse). Se suelta en cuanto la persona toca la rueda, la pantalla o el
 * teclado: a partir de ahí manda ella.
 */
export const holdScrollAt = (y, win = window) => {
  let stop = false;
  const release = () => { stop = true; };
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  events.forEach((name) => win.addEventListener(name, release, { passive: true, once: true }));
  const started = Date.now();
  let steadySince = null;
  const step = () => {
    if (stop || Date.now() - started > RESTORE_FOR_MS) { events.forEach((name) => win.removeEventListener(name, release)); return; }
    const reachable = win.document.documentElement.scrollHeight - win.innerHeight >= y - 4;
    if (Math.abs(win.scrollY - y) > 4) { steadySince = null; if (reachable || win.scrollY < y) win.scrollTo(0, y); }
    else if (reachable) steadySince ??= Date.now();
    if (steadySince && Date.now() - steadySince > 500) { stop = true; }
    win.requestAnimationFrame(step);
  };
  win.requestAnimationFrame(step);
  return release;
};

/** `navigate` que anota de dónde se sale. `label` cambia el nombre con que se ofrece volver. */
export function useNavigateFrom() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((to, { label, state, ...options } = {}) => navigate(to, {
    ...options,
    state: { ...(state || {}), ...originState(location, { label, scrollY: window.scrollY }) },
  }), [navigate, location]);
}

/** El estado de navegación para un enlace que sale de esta pantalla. */
export function useOriginState(label) {
  const location = useLocation();
  return () => originState(location, { label, scrollY: window.scrollY });
}

/** El nombre con que esta pantalla se ofrece al volver («Operación · Verona»), mientras siga abierta. */
export function usePageLabel(label) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!label) return undefined;
    setPageLabel(pathname, label);
    return () => clearPageLabel(pathname);
  }, [pathname, label]);
}

/** Recuerda la altura de cada pantalla visitada y la devuelve al volver con «atrás» o con «Volver a …». */
export function useScrollMemory() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);
  // La pantalla nueva se anota antes de pintarse: si es más corta, el navegador baja el scroll y ese movimiento es de
  // la nueva, no de la que se acaba de dejar (si no, la anterior quedaba recordada arriba del todo).
  useLayoutEffect(() => { keyRef.current = location.key; }, [location.key]);
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    let frame = null;
    const onScroll = () => {
      if (frame) return;
      const key = keyRef.current;
      frame = window.requestAnimationFrame(() => { frame = null; if (key === keyRef.current) rememberPosition(key, window.scrollY); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    const asked = location.state?.restoreScrollY;
    const remembered = navigationType === 'POP' ? readPositions()[location.key] : undefined;
    const target = Number.isFinite(asked) ? asked : remembered;
    if (!Number.isFinite(target) || target <= 0) return undefined;
    return holdScrollAt(target);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** «← Volver a Operación · Verona», arriba de la pantalla a la que se llegó desde otra. */
export default function BackToOrigin() {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = readOrigin(location.state, location);
  if (!origin) return null;
  return (
    <div className="-mb-5" data-back-to-origin>
      <button type="button" onClick={() => navigate(origin.path, { state: { restoreScrollY: origin.scrollY } })}
        className="-ml-3 inline-flex min-h-9 max-w-full items-center gap-1 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan">
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">Volver a {origin.label}</span>
      </button>
    </div>
  );
}
