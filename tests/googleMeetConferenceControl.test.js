import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('finaliza la conferencia activa usando el espacio persistente y la cuenta organizadora', async () => {
  const { endGoogleMeetConference } = await import('../src/services/googleMeetConferenceService.js');
  const calls = [];
  const db = {
    operationalEvent: {
      findUnique: async () => ({
        id: 'event-1',
        type: 'MEETING',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        googleMeetSpaceName: 'spaces/space-123',
        googleConnectionId: 'connection-1',
        googleLinks: []
      })
    }
  };

  const result = await endGoogleMeetConference('event-1', {
    db,
    getAuth: async id => ({ oauth2Client: { marker: true }, connection: { id } }),
    request: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({}) };
    },
    getAccessToken: async () => 'oauth-token'
  });

  assert.deepEqual(result, { ended: true, spaceName: 'spaces/space-123' });
  assert.equal(calls[0].url, 'https://meet.googleapis.com/v2/spaces/space-123:endActiveConference');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer oauth-token');
});

test('resuelve y conserva el espacio a partir del enlace para eventos sincronizados', async () => {
  const { endGoogleMeetConference } = await import('../src/services/googleMeetConferenceService.js');
  const updates = [];
  const db = {
    operationalEvent: {
      findUnique: async () => ({
        id: 'event-2',
        type: 'MEETING',
        meetingLink: 'https://meet.google.com/abc-defg-hij?authuser=0',
        googleMeetSpaceName: null,
        googleConnectionId: 'connection-2',
        googleLinks: []
      }),
      update: async input => updates.push(input)
    }
  };
  const urls = [];

  await endGoogleMeetConference('event-2', {
    db,
    getAuth: async () => ({ oauth2Client: {}, connection: { id: 'connection-2' } }),
    getAccessToken: async () => 'oauth-token',
    request: async (url, options) => {
      urls.push({ url, options });
      if (options.method === 'GET') {
        return { ok: true, json: async () => ({ name: 'spaces/resolved-456' }) };
      }
      return { ok: true, json: async () => ({}) };
    }
  });

  assert.equal(urls[0].url, 'https://meet.googleapis.com/v2/spaces/abc-defg-hij');
  assert.equal(urls[1].url, 'https://meet.googleapis.com/v2/spaces/resolved-456:endActiveConference');
  assert.deepEqual(updates[0], {
    where: { id: 'event-2' },
    data: { googleMeetSpaceName: 'spaces/resolved-456' }
  });
});

test('expone el cierre protegido y conserva el identificador al generar y guardar el evento', async () => {
  const [routes, calendarService, calendarUi] = await Promise.all([
    readFile(new URL('../src/routes/api/activity.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/calendarService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(routes, /router\.post\('\/events\/:id\/end-conference',\s*requireManagerRole/);
  assert.match(calendarService, /googleMeetSpaceName/);
  assert.match(calendarUi, /Finalizar reuni[oó]n/);
  assert.match(calendarUi, /googleMeetSpaceName/);
  assert.match(calendarUi, /incluido Fireflies/);
  assert.doesNotMatch(calendarUi, /Brain Studio · Minutas/);
});
