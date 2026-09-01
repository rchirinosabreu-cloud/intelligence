import { reconcileBriaMemory } from './briaMemoryService.js';

export const BRIA_MEMORY_INTERVAL_MS = 10 * 60 * 1000;
export const BRIA_MEMORY_START_DELAY_MS = 60 * 1000;

export function initBriaMemoryScheduler({
  reconcile = reconcileBriaMemory,
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
      logger.error('[BriaMemory] Falló la conciliación automática:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(run, BRIA_MEMORY_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(run, BRIA_MEMORY_INTERVAL_MS);
  intervalTimer.unref?.();
  logger.info('[BriaMemory] Conciliación automática configurada cada 10 minutos.');
  return { startupTimer, intervalTimer, run };
}
