import express from 'express';
import {
  getOperationalEvents,
  createOperationalEvent,
  updateOperationalEvent,
  deleteOperationalEvent,
  syncGoogleCalendarToOperationalEvents,
  syncAllGoogleCalendars,
  getOperationalEventReconciliationPreview,
  reconcilePendingOperationalEvents,
  dismissOperationalEventGoogleError,
  dismissOperationalEventReconciliation,
  retryOperationalEventGoogleSync
} from '../../services/operationalEventService.js';
import { getTeamActivityStatus } from '../../services/activityStatusService.js';
import { createMeetEvent } from '../../services/calendarService.js';
import {
  getGoogleCalendarAuthUrl,
  verifyGoogleCalendarOAuthState,
  storeGoogleCalendarOAuthCode,
  getCentralGoogleCalendarConnectionStatus,
  getGoogleCalendarConnections,
  listAccessibleGoogleCalendars,
  setActiveGoogleCalendar,
  isGoogleOAuthReauthError,
  markGoogleCalendarReauthRequired
} from '../../services/googleCalendarOAuthService.js';
import { requireManagerRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

const sendOperationalEventSaveError = (res, error, fallbackError) => {
  if (error.code === 'EVENT_NOT_FOUND') {
    return res.status(404).json({ error: 'El evento ya no existe', code: error.code, details: error.message });
  }
  if (['INVALID_EVENT_RANGE', 'INVALID_GOOGLE_EVENT_TIME', 'INVALID_EVENT_TITLE', 'INVALID_EVENT_TYPE', 'INVALID_EVENT_RECURRENCE', 'INVALID_EVENT_ATTENDEES'].includes(error.code)) {
    return res.status(422).json({
      error: error.code === 'INVALID_EVENT_RANGE' || error.code === 'INVALID_GOOGLE_EVENT_TIME'
        ? 'Revisa las fechas y horas del evento'
        : 'Revisa los datos del evento',
      code: error.code,
      details: error.code === 'INVALID_GOOGLE_EVENT_TIME'
        ? 'Google Calendar rechazó la fecha u hora del evento. Verifica el rango y activa “Todo el día” cuando corresponda.'
        : error.message
    });
  }
  if (error.code === 'GOOGLE_CALENDAR_CONFLICT') {
    return res.status(409).json({
      error: 'El evento cambió en Google Calendar',
      code: error.code,
      details: 'Google Calendar recibió otra modificación antes que esta. Sincroniza el calendario, revisa la versión más reciente y vuelve a guardar.'
    });
  }
  if (error.code === 'GOOGLE_SYNC_METADATA_PENDING') {
    return res.status(503).json({
      error: 'Google Calendar recibió el cambio; falta confirmar la sincronización local',
      code: error.code,
      details: 'El evento conserva el cambio. Usa Sincronizar para completar la confirmación sin duplicarlo.'
    });
  }
  return res.status(500).json({ error: fallbackError, details: error.message });
};

// Get real-time status for the map
router.get('/status', async (req, res) => {
  try {
    const status = await getTeamActivityStatus();
    res.json(status);
  } catch (error) {
    console.error('[Activity API] Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch activity status' });
  }
});

// Operational Calendar Events
router.get('/events', async (req, res) => {
  const { start, end } = req.query;
  try {
    const events = await getOperationalEvents(start, end);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/events', requireManagerRole, async (req, res) => {
  try {
    const event = await createOperationalEvent(req.body, req.user?.userId || null);
    res.json(event);
  } catch (error) {
    console.error('[Activity API] Error creating event:', error.response?.data || error);
    if (isGoogleOAuthReauthError(error)) {
      return res.status(401).json({
        error: 'Google Calendar requiere reconexión',
        code: 'GOOGLE_CALENDAR_REAUTH_REQUIRED',
        reconnectRequired: true,
        details: error.message
      });
    }
    return sendOperationalEventSaveError(res, error, 'Failed to create event');
  }
});

router.post('/events/generate-meet', requireManagerRole, async (req, res) => {
  const { title, startAt, endAt, description, googleConnectionId } = req.body;
  try {
    const meeting = await createMeetEvent(title, startAt, endAt, description, googleConnectionId);
    if (!meeting?.meetingLink) throw new Error('No se pudo generar el enlace');
    res.json(meeting);
  } catch (error) {
    console.error('[Activity API] Error generating Meet link:', error.response?.data || error);
    if (isGoogleOAuthReauthError(error)) {
      return res.status(401).json({
        error: 'Google Calendar requiere reconexión',
        code: 'GOOGLE_CALENDAR_REAUTH_REQUIRED',
        reconnectRequired: true,
        details: error.message
      });
    }
    res.status(500).json({ error: 'Failed to generate Meet link', details: error.message });
  }
});

router.get('/google-calendar/status', async (req, res) => {
  try {
    const status = await getCentralGoogleCalendarConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('[Activity API] Error fetching Google Calendar status:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Google Calendar status', details: error.message });
  }
});

router.get('/google-calendar/auth-url', requireManagerRole, async (req, res) => {
  try {
    res.json({ url: getGoogleCalendarAuthUrl(req.query.email || null) });
  } catch (error) {
    console.error('[Activity API] Error generating Google Calendar OAuth URL:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to generate Google Calendar OAuth URL', details: error.message });
  }
});

router.get('/google-calendar/connections', requireManagerRole, async (_req, res) => {
  try {
    res.json(await getGoogleCalendarConnections());
  } catch (error) {
    console.error('[Activity API] Error consultando conexiones de Google Calendar:', error.response?.data || error);
    res.status(500).json({ error: 'No se pudieron consultar las conexiones de Google Calendar', details: error.message });
  }
});

router.get('/google-calendar/calendars', requireManagerRole, async (req, res) => {
  try {
    const calendars = await listAccessibleGoogleCalendars(req.query.connectionId || null);
    res.json(calendars);
  } catch (error) {
    console.error('[Activity API] Error listing Google calendars:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to list Google calendars', details: error.message });
  }
});

router.patch('/google-calendar/active-calendar', requireManagerRole, async (req, res) => {
  try {
    const connection = await setActiveGoogleCalendar(req.body.calendarId, req.body.connectionId || null);
    res.json(connection);
  } catch (error) {
    console.error('[Activity API] Error setting active Google calendar:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to set active Google calendar', details: error.message });
  }
});

router.post('/google-calendar/oauth-callback', requireManagerRole, async (req, res) => {
  try {
    const oauthState = verifyGoogleCalendarOAuthState(req.body.state);
    const connection = await storeGoogleCalendarOAuthCode(req.body.code, req.user?.userId || null, oauthState.requestedEmail || null);
    res.json(connection);
  } catch (error) {
    console.error('[Activity API] Error completing Google Calendar OAuth:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to connect Google Calendar', details: error.message });
  }
});

router.post('/google-calendar/sync', requireManagerRole, async (req, res) => {
  try {
    const result = req.body?.connectionId
      ? await syncGoogleCalendarToOperationalEvents(req.body)
      : await syncAllGoogleCalendars(req.body || {});
    res.json(result);
  } catch (error) {
    console.error('[Activity API] Error syncing Google Calendar:', error.response?.data || error);
    if (isGoogleOAuthReauthError(error)) {
      await markGoogleCalendarReauthRequired(req.body?.connectionId || null);
      return res.status(401).json({
        error: 'Google Calendar requiere reconexión',
        code: 'GOOGLE_CALENDAR_REAUTH_REQUIRED',
        reconnectRequired: true,
        details: 'La autorización de Google venció o fue revocada. Vuelve a conectar la cuenta.'
      });
    }
    res.status(500).json({ error: 'Failed to sync Google Calendar', details: error.message });
  }
});

router.get('/google-calendar/reconciliation', requireManagerRole, async (req, res) => {
  try {
    res.json(await getOperationalEventReconciliationPreview(req.query.limit));
  } catch (error) {
    console.error('[Activity API] Error consultando reconciliación de Google Calendar:', error.response?.data || error);
    res.status(500).json({ error: 'No se pudo consultar la reconciliación', details: error.message });
  }
});

router.post('/google-calendar/reconciliation', requireManagerRole, async (req, res) => {
  try {
    res.json(await reconcilePendingOperationalEvents(req.body));
  } catch (error) {
    console.error('[Activity API] Error reconciliando Google Calendar:', error.response?.data || error);
    res.status(400).json({ error: 'No se pudieron reconciliar los eventos', details: error.message });
  }
});

router.patch('/google-calendar/errors/:id/dismiss', requireManagerRole, async (req, res) => {
  try {
    const result = await dismissOperationalEventGoogleError(req.params.id);
    if (!result.count) return res.status(404).json({ error: 'El error ya no está disponible' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Activity API] Error descartando diagnóstico de Google Calendar:', error.response?.data || error);
    res.status(500).json({ error: 'No se pudo descartar el error', details: error.message });
  }
});

router.post('/google-calendar/errors/:id/retry', requireManagerRole, async (req, res) => {
  try {
    res.json(await retryOperationalEventGoogleSync(req.params.id, req.body?.connectionId || null));
  } catch (error) {
    console.error('[Activity API] Error reintentando evento de Google Calendar:', error.response?.data || error);
    return sendOperationalEventSaveError(res, error, 'No se pudo reintentar la sincronización');
  }
});

router.patch('/google-calendar/reconciliation/:id/dismiss', requireManagerRole, async (req, res) => {
  try {
    const result = await dismissOperationalEventReconciliation(req.params.id);
    if (!result.count) return res.status(404).json({ error: 'El evento ya no está pendiente de conciliación' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Activity API] Error descartando conciliación de Google Calendar:', error.response?.data || error);
    res.status(500).json({ error: 'No se pudo descartar de conciliación', details: error.message });
  }
});

router.patch('/events/:id', requireManagerRole, async (req, res) => {
  try {
    const event = await updateOperationalEvent(req.params.id, req.body);
    res.json(event);
  } catch (error) {
    console.error('[Activity API] Error updating event:', error.response?.data || error);
    return sendOperationalEventSaveError(res, error, 'Failed to update event');
  }
});

router.delete('/events/:id', requireManagerRole, async (req, res) => {
  try {
    await deleteOperationalEvent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Activity API] Error deleting event:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to delete event', details: error.message });
  }
});

export default router;
