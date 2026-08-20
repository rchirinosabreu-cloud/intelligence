import express from 'express';
import {
  getOperationalEvents,
  createOperationalEvent,
  updateOperationalEvent,
  deleteOperationalEvent,
  syncGoogleCalendarToOperationalEvents,
  syncAllGoogleCalendars
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
  setActiveGoogleCalendar
} from '../../services/googleCalendarOAuthService.js';
import { requireManagerRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

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

router.post('/events', async (req, res) => {
  try {
    const event = await createOperationalEvent(req.body, req.user?.userId || null);
    res.json(event);
  } catch (error) {
    console.error('[Activity API] Error creating event:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to create event', details: error.message });
  }
});

router.post('/events/generate-meet', async (req, res) => {
  const { title, startAt, endAt, description } = req.body;
  try {
    const meetingLink = await createMeetEvent(title, startAt, endAt, description);
    if (!meetingLink) throw new Error("Could not generate link");
    res.json({ meetingLink });
  } catch (error) {
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
    res.status(500).json({ error: 'Failed to sync Google Calendar', details: error.message });
  }
});

router.patch('/events/:id', async (req, res) => {
  try {
    const event = await updateOperationalEvent(req.params.id, req.body);
    res.json(event);
  } catch (error) {
    console.error('[Activity API] Error updating event:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to update event', details: error.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await deleteOperationalEvent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Activity API] Error deleting event:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to delete event', details: error.message });
  }
});

export default router;
