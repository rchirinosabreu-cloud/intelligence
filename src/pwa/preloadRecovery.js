import { lazy } from 'react';
import { isChunkLoadError } from '../lib/appErrors.js';
import { reportClientError } from '../lib/clientErrorReporter.js';

export const PRELOAD_RECOVERY_KEY = 'brainstudio:preload-recovery';

const getBuildVersion = () => (
  typeof __BUILD_SHA__ === 'undefined' ? 'development' : __BUILD_SHA__
);

const createRecoveryMarker = ({ buildVersion, location }) => (
  `${buildVersion}:${location?.pathname || '/'}${location?.search || ''}`
);

const browserDefaults = () => {
  const windowRef = typeof window === 'undefined' ? null : window;
  let storage = null;
  try { storage = windowRef?.sessionStorage || null; } catch { storage = null; }
  return {
    storage,
    buildVersion: getBuildVersion(),
    location: windowRef?.location,
    reload: () => windowRef?.location.reload()
  };
};

/**
 * Recarga la página una sola vez por versión y pantalla cuando falta un archivo de la app.
 * Devuelve `true` si pidió la recarga, y `false` si esa misma versión y pantalla ya se
 * intentaron: entonces el error sube y la persona ve la pantalla de versión, sin bucle.
 */
export const attemptVersionRecovery = ({ storage, buildVersion, location, reload, onRecover } = {}) => {
  const marker = createRecoveryMarker({ buildVersion, location });
  let previousMarker = null;

  try {
    previousMarker = storage?.getItem(PRELOAD_RECOVERY_KEY);
  } catch (error) {
    console.error('[PreloadRecovery] No fue posible leer el estado de recuperación.', error);
  }

  // If the same build and route already failed after a refresh, let React's
  // error boundary render a useful fallback instead of creating a reload loop.
  if (previousMarker === marker) return false;

  try {
    storage?.setItem(PRELOAD_RECOVERY_KEY, marker);
  } catch (error) {
    console.error('[PreloadRecovery] No fue posible guardar el estado de recuperación.', error);
  }

  try { onRecover?.(); } catch { /* registrar nunca impide recuperar */ }
  reload();
  return true;
};

/** La misma recuperación con lo que da el navegador; la usa la pantalla de error. */
export const attemptBrowserVersionRecovery = (onRecover) => attemptVersionRecovery({ ...browserDefaults(), onRecover });

export const createVitePreloadErrorHandler = ({
  buildVersion,
  storage,
  location,
  reload,
  onRecover
}) => (event) => {
  if (attemptVersionRecovery({ storage, buildVersion, location, reload, onRecover })) {
    event?.preventDefault?.();
  }
};

// Mientras la página se recarga, la importación queda pendiente: Suspense sigue mostrando
// «cargando» y la pantalla de error nunca llega a pintarse (Rodny, 5 de octubre de 2026: a
// Elisa le salía «No pudimos cargar esta sección» cada vez que entraba tras un despliegue).
const untilReload = () => new Promise(() => {});

const reportVersionReload = (error) => reportClientError({
  kind: 'version-reload',
  error: error || new Error('Failed to fetch dynamically imported module (recuperación automática)')
});

/** Carga un módulo; si es de una versión anterior, recarga una vez en vez de fallar. */
export const loadWithRecovery = async (factory, options = {}) => {
  const recovery = { ...browserDefaults(), ...options };
  try {
    const module = await factory();
    // Vite ya atendió el fallo (`vite:preloadError`) y pidió la recarga: la importación llega vacía.
    if (module) return module;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;
    const recovering = attemptVersionRecovery({ ...recovery, onRecover: options.onRecover ?? (() => reportVersionReload(error)) });
    if (!recovering) throw error;
  }
  return untilReload();
};

/** `React.lazy` con la recuperación de versión. Todo módulo de `App.jsx` se carga así. */
export const lazyWithRecovery = (factory) => lazy(() => loadWithRecovery(factory));

export const installVitePreloadRecovery = ({
  windowRef = typeof window === 'undefined' ? null : window,
  storage = windowRef?.sessionStorage,
  buildVersion = getBuildVersion(),
  resetDelayMs = 15_000
} = {}) => {
  if (!windowRef?.addEventListener) return () => {};

  const handler = createVitePreloadErrorHandler({
    buildVersion,
    storage,
    location: windowRef.location,
    reload: () => windowRef.location.reload(),
    onRecover: () => reportVersionReload()
  });

  windowRef.addEventListener('vite:preloadError', handler);

  // A page that remains healthy can attempt one automatic recovery again if a
  // later deployment replaces its lazy-loaded chunks.
  const resetTimer = windowRef.setTimeout(() => {
    try {
      storage?.removeItem(PRELOAD_RECOVERY_KEY);
    } catch (error) {
      console.error('[PreloadRecovery] No fue posible limpiar el estado de recuperación.', error);
    }
  }, resetDelayMs);

  return () => {
    windowRef.removeEventListener('vite:preloadError', handler);
    windowRef.clearTimeout(resetTimer);
  };
};
