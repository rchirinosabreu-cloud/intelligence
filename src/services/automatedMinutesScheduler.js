import { syncFirefliesMinutes } from './minuteAutomationService.js';

export const FIREFLIES_MINUTES_INTERVAL_MS = 10 * 60 * 1000;
export const FIREFLIES_MINUTES_START_DELAY_MS = 30 * 1000;

export function initAutomatedMinutesScheduler({
  syncMinutes = syncFirefliesMinutes,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let running = false;
  const run = async () => {
    if (running) return { skipped: true };
    running = true;
    try {
      return await syncMinutes();
    } catch (error) {
      logger.error('[AutomatedMinutes] Falló la ejecución automática:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(run, FIREFLIES_MINUTES_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(run, FIREFLIES_MINUTES_INTERVAL_MS);
  intervalTimer.unref?.();
  logger.info('[AutomatedMinutes] Automatización configurada cada 10 minutos.');
  return { startupTimer, intervalTimer, run };
}
