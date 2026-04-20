import express from 'express';
import { getOperationalEvents, createOperationalEvent, updateOperationalEvent, deleteOperationalEvent } from '../../services/operationalEventService.js';
import { getTeamActivityStatus } from '../../services/activityStatusService.js';
import { createMeetEvent } from '../../services/calendarService.js';

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
    const event = await createOperationalEvent(req.body);
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
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

router.patch('/events/:id', async (req, res) => {
  try {
    const event = await updateOperationalEvent(req.params.id, req.body);
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await deleteOperationalEvent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
