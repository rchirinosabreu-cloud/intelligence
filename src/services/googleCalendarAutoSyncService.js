import { renewGoogleCalendarWatchChannels, syncAllGoogleCalendars } from './operationalEventService.js';
import { autoCloseFinishedFirefliesMeetings } from './googleMeetConferenceService.js';

const DEFAULT_INTERVAL_MS = 60_000;
let intervalId = null;
let running = false;

export const runGoogleCalendarAutoSync = async () => {
  if (running) return [];
  running = true;
  let result = [];
  try {
    const meetResults = await autoCloseFinishedFirefliesMeetings();
    const relevantMeetResults = meetResults.filter(item => item.action !== 'IGNORE');
    if (relevantMeetResults.length > 0) console.info('[Google Meet] Resultado del monitor automático:', relevantMeetResults);
  } catch (error) {
    console.error('[Google Meet] Falló el monitor automático de Fireflies:', error.response?.data || error.message);
  }
  try {
    result = await syncAllGoogleCalendars();
    await renewGoogleCalendarWatchChannels();
  } catch (error) {
    console.error('[Google Calendar] Falló la sincronización automática:', error.response?.data || error.message);
  } finally {
    running = false;
  }
  return result;
};

export const startGoogleCalendarAutoSync = (intervalMs = Number(process.env.GOOGLE_CALENDAR_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS) => {
  if (intervalId) return intervalId;
  setTimeout(() => runGoogleCalendarAutoSync(), 5_000).unref?.();
  intervalId = setInterval(runGoogleCalendarAutoSync, intervalMs);
  intervalId.unref?.();
  return intervalId;
};
