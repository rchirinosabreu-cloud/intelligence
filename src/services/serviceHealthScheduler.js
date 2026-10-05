import { serviceHealthService } from './serviceHealthService.js';

// Semáforo de servicios (4 de octubre de 2026): el reloj late cada minuto y cada servicio se comprueba
// cuando le toca según su intervalo (5 minutos la mayoría, media hora el correo, una hora la TRM).
// La bandera `running` evita solapar ciclos; un fallo se registra y el siguiente minuto se intenta otra vez.
export const SERVICE_HEALTH_TICK_MS = 60 * 1000;
export const SERVICE_HEALTH_START_DELAY_MS = 45 * 1000;

export function initServiceHealthScheduler({
  run = () => serviceHealthService().runDueChecks(),
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let running = false;
  const tick = async () => {
    if (running) return { skipped: true };
    running = true;
    try {
      return await run();
    } catch (error) {
      logger.error('[ServiceHealth] Falló el ciclo de comprobaciones:', error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(tick, SERVICE_HEALTH_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(tick, SERVICE_HEALTH_TICK_MS);
  intervalTimer.unref?.();
  logger.info('[ServiceHealth] Semáforo de servicios configurado (latido cada minuto).');
  return { startupTimer, intervalTimer, tick };
}
