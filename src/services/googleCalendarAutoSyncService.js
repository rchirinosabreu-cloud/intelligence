import { renewGoogleCalendarWatchChannels, syncAllGoogleCalendars } from './operationalEventService.js';

const DEFAULT_INTERVAL_MS = 60_000;
let intervalId = null;
let running = false;

export const runGoogleCalendarAutoSync = async () => {
  if (running) return [];
  running = true;
  try {
    const result = await syncAllGoogleCalendars();
    await renewGoogleCalendarWatchChannels();
    return result;
  } catch (error) {
    console.error('[Google Calendar] Falló la sincronización automática:', error.response?.data || error.message);
    return [];
  } finally {
    running = false;
  }
};

export const startGoogleCalendarAutoSync = (intervalMs = Number(process.env.GOOGLE_CALENDAR_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS) => {
  if (intervalId) return intervalId;
  setTimeout(() => runGoogleCalendarAutoSync(), 5_000).unref?.();
  intervalId = setInterval(runGoogleCalendarAutoSync, intervalMs);
  intervalId.unref?.();
  return intervalId;
};
