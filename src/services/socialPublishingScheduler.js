import { processDuePublications } from './socialPublishingService.js';

// El cron del publicador (29 de septiembre de 2026): cada minuto, como el aviso de compromiso vencido.
// La bandera `running` evita solapar ciclos en la misma réplica; entre réplicas manda el lease de la fila.
export const SOCIAL_PUBLISHING_INTERVAL_MS = 60 * 1000;
export const SOCIAL_PUBLISHING_START_DELAY_MS = 20 * 1000;

export function initSocialPublishingScheduler({
  process = processDuePublications,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let running = false;
  const run = async () => {
    if (running) return { skipped: true };
    running = true;
    try {
      return await process();
    } catch (error) {
      logger.error('[SocialPublishing] Falló el ciclo del publicador:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(run, SOCIAL_PUBLISHING_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(run, SOCIAL_PUBLISHING_INTERVAL_MS);
  intervalTimer.unref?.();
  logger.info('[SocialPublishing] Publicador de Instagram y Facebook configurado cada minuto.');
  return { startupTimer, intervalTimer, run };
}
