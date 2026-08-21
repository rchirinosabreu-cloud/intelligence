import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('finaliza la conferencia activa usando el espacio persistente y la cuenta organizadora', async () => {
  const { endGoogleMeetConference } = await import('../src/services/googleMeetConferenceService.js');
  const calls = [];
  const db = { operationalEvent: {
    findUnique: async () => ({ id: 'event-1', type: 'MEETING', meetingLink: 'https://meet.google.com/abc-defg-hij', googleMeetSpaceName: 'spaces/space-123', googleConnectionId: 'connection-1', googleLinks: [] }),
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
  assert.match(schema, /googleMeetOnlyBotSince\s+DateTime\?/);
  assert.match(schema, /googleMeetEndedAt\s+DateTime\?/);
});
