export const PRELOAD_RECOVERY_KEY = 'brainstudio:preload-recovery';

const getBuildVersion = () => (
  typeof __BUILD_SHA__ === 'undefined' ? 'development' : __BUILD_SHA__
);

const createRecoveryMarker = ({ buildVersion, location }) => (
  `${buildVersion}:${location?.pathname || '/'}${location?.search || ''}`
);

export const createVitePreloadErrorHandler = ({
  buildVersion,
  storage,
  location,
  reload
}) => (event) => {
  const marker = createRecoveryMarker({ buildVersion, location });
  let previousMarker = null;

  try {
    previousMarker = storage?.getItem(PRELOAD_RECOVERY_KEY);
  } catch (error) {
    console.error('[PreloadRecovery] No fue posible leer el estado de recuperación.', error);
  }

  // If the same build and route already failed after a refresh, let React's
  // error boundary render a useful fallback instead of creating a reload loop.
  if (previousMarker === marker) return;

  event?.preventDefault?.();

  try {
    storage?.setItem(PRELOAD_RECOVERY_KEY, marker);
  } catch (error) {
    console.error('[PreloadRecovery] No fue posible guardar el estado de recuperación.', error);
  }

  reload();
};

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
    reload: () => windowRef.location.reload()
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
