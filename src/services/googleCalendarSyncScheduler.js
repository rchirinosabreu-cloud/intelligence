import {
  renewGoogleCalendarWatchChannels,
  syncAllGoogleCalendars
} from './operationalEventService.js';

export const GOOGLE_CALENDAR_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const GOOGLE_CALENDAR_WATCH_RENEWAL_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const GOOGLE_CALENDAR_START_DELAY_MS = 15 * 1000;

export function initGoogleCalendarSyncScheduler({
  syncCalendars = syncAllGoogleCalendars,
  renewWatchChannels = renewGoogleCalendarWatchChannels,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let syncRunning = false;
  let watchRenewalRunning = false;

  const runSync = async () => {
    if (syncRunning) return { skipped: true };
    syncRunning = true;
    try {
      const result = await syncCalendars();
      logger.info('[GoogleCalendarSync] Sincronización automática completada.');
      return result;
    } catch (error) {
      logger.error('[GoogleCalendarSync] Falló la sincronización automática:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      syncRunning = false;
    }
  };

  const renewChannels = async () => {
    if (watchRenewalRunning) return { skipped: true };
    watchRenewalRunning = true;
    try {
      const result = await renewWatchChannels();
      logger.info('[GoogleCalendarSync] Canales webhook de Google verificados.');
      return result;
    } catch (error) {
      logger.error('[GoogleCalendarSync] Falló la renovación de webhooks:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      watchRenewalRunning = false;
    }
  };

  const startupTimer = setTimeoutFn(async () => {
    await renewChannels();
    await runSync();
  }, GOOGLE_CALENDAR_START_DELAY_MS);
  startupTimer.unref?.();

  const syncTimer = setIntervalFn(runSync, GOOGLE_CALENDAR_SYNC_INTERVAL_MS);
  syncTimer.unref?.();

  const watchRenewalTimer = setIntervalFn(renewChannels, GOOGLE_CALENDAR_WATCH_RENEWAL_INTERVAL_MS);
  watchRenewalTimer.unref?.();

  logger.info('[GoogleCalendarSync] Sincronización automática configurada cada 5 minutos.');
  return { startupTimer, syncTimer, watchRenewalTimer };
}
