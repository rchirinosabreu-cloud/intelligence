import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('finaliza la conferencia activa usando el espacio persistente y la cuenta organizadora', async () => {
  const { endGoogleMeetConference } = await import('../src/services/googleMeetConferenceService.js');
  const calls = [];
  const db = { operationalEvent: {
    findUnique: async () => ({ id: 'event-1', type: 'PROJECT', meetingLink: null, googleMeetSpaceName: 'spaces/space-123', googleConnectionId: 'connection-1', googleLinks: [] }),
    update: async () => ({})
  } };
  const result = await endGoogleMeetConference('event-1', {
    db,
    getAuth: async id => ({ oauth2Client: {}, connection: { id } }),
    request: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; },
    getAccessToken: async () => 'oauth-token'
  });
  assert.deepEqual(result, { ended: true, spaceName: 'spaces/space-123' });
  assert.equal(calls[0].url, 'https://meet.googleapis.com/v2/spaces/space-123:endActiveConference');
  assert.equal(calls[0].options.method, 'POST');
});

test('arma el cierre solo cuando Fireflies queda solo después de que hubo personas', async () => {
  const { evaluateMeetAutoCloseState } = await import('../src/services/googleMeetConferenceService.js');
  const participants = [
    { latestEndTime: '2026-08-21T16:00:00Z', signedinUser: { displayName: 'Rodny' } },
    { anonymousUser: { displayName: 'Fireflies.ai Notetaker' } }
  ];
  const now = new Date('2026-08-21T16:02:00Z');
  assert.deepEqual(evaluateMeetAutoCloseState({ participants, onlyBotSince: null, now }), { action: 'ARM', onlyBotSince: now });
  assert.equal(evaluateMeetAutoCloseState({ participants, onlyBotSince: new Date('2026-08-21T16:00:30Z'), now }).action, 'WAIT');
  assert.equal(evaluateMeetAutoCloseState({ participants, onlyBotSince: new Date('2026-08-21T15:59:30Z'), now }).action, 'CLOSE');
});

test('nunca cierra mientras quede una persona activa ni antes de que alguien haya participado', async () => {
  const { evaluateMeetAutoCloseState } = await import('../src/services/googleMeetConferenceService.js');
  const fireflies = { anonymousUser: { displayName: 'Fireflies.ai Notetaker' } };
  const human = { signedinUser: { displayName: 'Rodny' } };
  assert.equal(evaluateMeetAutoCloseState({ participants: [fireflies, human], onlyBotSince: new Date() }).action, 'RESET');
  assert.equal(evaluateMeetAutoCloseState({ participants: [fireflies], onlyBotSince: null }).action, 'IGNORE');
});

test('incluye reuniones antiguas con espacio Meet aunque el sync haya perdido tipo y enlace', async () => {
  const { autoCloseFinishedFirefliesMeetings } = await import('../src/services/googleMeetConferenceService.js');
  let query;
  await autoCloseFinishedFirefliesMeetings({
    db: { operationalEvent: { findMany: async options => { query = options; return []; } } },
    now: new Date('2026-08-21T17:40:00Z')
  });
  assert.deepEqual(query.where.OR, [
    { googleMeetSpaceName: { not: null } },
    { type: 'MEETING', meetingLink: { not: null } }
  ]);
  assert.equal(query.where.captureWithFireflies, true);
});

test('pausa Fireflies si Google ya cerró y la grabación continúa después del horario', async () => {
  const { autoCloseFinishedFirefliesMeetings } = await import('../src/services/googleMeetConferenceService.js');
  const updates = [];
  const firefliesBodies = [];
  const event = {
    id: 'event-1',
    title: 'Prueba 04 - Fireflies',
    type: 'PROJECT',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    googleMeetSpaceName: 'spaces/space-123',
    googleMeetEndedAt: null,
    googleMeetOnlyBotSince: null,
    googleConnectionId: 'connection-1',
    startAt: new Date('2026-08-21T17:20:00Z'),
    endAt: new Date('2026-08-21T17:25:00Z'),
    googleLinks: []
  };
  const db = { operationalEvent: {
    findMany: async () => [event],
    update: async input => { updates.push(input); return {}; }
  } };
  const request = async (url, options) => {
    if (url.startsWith('https://meet.googleapis.com/')) {
      return { ok: true, json: async () => ({ name: 'spaces/space-123' }) };
    }
    firefliesBodies.push(JSON.parse(options.body));
    if (firefliesBodies.length === 1) {
      return { ok: true, json: async () => ({ data: { active_meetings: [{
        id: 'fireflies-meeting-1', title: event.title, meeting_link: event.meetingLink,
        start_time: event.startAt.toISOString(), state: 'active'
      }] } }) };
    }
    return { ok: true, json: async () => ({ data: { updateMeetingState: { success: true, action: 'pause_recording' } } }) };
  };
  const result = await autoCloseFinishedFirefliesMeetings({
    db,
    request,
    getAuth: async () => ({ oauth2Client: {} }),
    getAccessToken: async () => 'google-token',
    firefliesApiKey: 'fireflies-token',
    now: new Date('2026-08-21T17:28:00Z')
  });
  assert.deepEqual(result, [{ eventId: 'event-1', action: 'FIREFLIES_PAUSED' }]);
  assert.equal(firefliesBodies[1].variables.input.action, 'pause_recording');
  assert.equal(updates.at(-1).data.googleMeetEndedAt.toISOString(), '2026-08-21T17:28:00.000Z');
});

test('recupera enlaces de Meet creados por la plataforma desde ubicación o descripción de Google Calendar', async () => {
  const { getMeetLinkFromGoogleEvent } = await import('../src/services/operationalEventService.js');
  assert.equal(
    getMeetLinkFromGoogleEvent({ location: 'https://meet.google.com/abc-defg-hij' }),
    'https://meet.google.com/abc-defg-hij'
  );
  assert.equal(
    getMeetLinkFromGoogleEvent({ description: 'Agenda\n\nGoogle Meet: https://meet.google.com/xyz-abcd-efg' }),
    'https://meet.google.com/xyz-abcd-efg'
  );
});

test('el cierre es automático y no aparece como botón en el calendario', async () => {
  const [routes, calendarService, calendarUi, autoSync, schema] = await Promise.all([
    readFile(new URL('../src/routes/api/activity.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/calendarService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/googleCalendarAutoSyncService.js', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(routes, /\/events\/:id\/end-conference/);
  assert.match(calendarService, /googleMeetSpaceName/);
  assert.doesNotMatch(calendarUi, /Finalizar reunión/);
  assert.match(calendarUi, /googleMeetSpaceName/);
  assert.match(autoSync, /autoCloseFinishedFirefliesMeetings/);
  assert.ok(
    autoSync.indexOf('await autoCloseFinishedFirefliesMeetings()') < autoSync.indexOf('await syncAllGoogleCalendars()'),
    'el monitor de Meet debe ejecutarse antes de la sincronización de Calendar'
  );
  assert.match(schema, /googleMeetOnlyBotSince\s+DateTime\?/);
  assert.match(schema, /googleMeetEndedAt\s+DateTime\?/);
});
