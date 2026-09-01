import {
  BRIA_OBSERVER_INTERVAL_MS,
  BRIA_OBSERVER_START_DELAY_MS,
  reconcileBriaObserver
} from './briaObserverService.js';

export function initBriaObserverScheduler({
  reconcile = reconcileBriaObserver,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let running = false;
  const run = async () => {
    if (running) return { skipped: true };
    running = true;
    try {
      return await reconcile();
    } catch (error) {
      logger.error('[BriaObserver] Falló el escaneo automático:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(run, BRIA_OBSERVER_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(run, BRIA_OBSERVER_INTERVAL_MS);
  intervalTimer.unref?.();
  logger.info('[BriaObserver] Escaneo automático configurado cada 10 minutos.');
  return { startupTimer, intervalTimer, run };
}
