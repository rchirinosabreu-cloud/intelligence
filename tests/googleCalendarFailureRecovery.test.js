import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Google OAuth deactivates a revoked account and selects the next healthy account', async () => {
  const oauthService = await import('../src/services/googleCalendarOAuthService.js');
  assert.equal(typeof oauthService.authorizeGoogleCalendarConnections, 'function');

  const deactivated = [];
  const clients = new Map([
    ['social', {
      setCredentials() {},
      async getAccessToken() {
        throw Object.assign(new Error('Token has been expired or revoked'), { code: 'invalid_grant' });
      }
    }],
    ['coordinator', {
      setCredentials() {},
      async getAccessToken() { return { token: 'healthy-token' }; }
    }]
  ]);

  const result = await oauthService.authorizeGoogleCalendarConnections([
    { id: 'social', email: 'social.brainstudio@gmail.com', encryptedTokens: 'social' },
    { id: 'coordinator', email: 'coordinadorbrainstudio@gmail.com', encryptedTokens: 'coordinator' }
  ], {
    createOAuthClient: (connection) => clients.get(connection.id),
    decryptTokens: (value) => JSON.stringify({ connection: value }),
    markReauthRequired: async (connection) => deactivated.push(connection.id)
  });

  assert.equal(result.connection.id, 'coordinator');
  assert.deepEqual(deactivated, ['social']);
});

test('Google OAuth requests reconnection when the explicitly selected account is revoked', async () => {
  const { authorizeGoogleCalendarConnections } = await import('../src/services/googleCalendarOAuthService.js');
  assert.equal(typeof authorizeGoogleCalendarConnections, 'function');

  await assert.rejects(
    authorizeGoogleCalendarConnections([{ id: 'social', encryptedTokens: 'social' }], {
      createOAuthClient: () => ({
        setCredentials() {},
        async getAccessToken() { throw Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }); }
      }),
      decryptTokens: () => '{}',
      markReauthRequired: async () => {}
    }),
    (error) => error.code === 'GOOGLE_CALENDAR_REAUTH_REQUIRED' && error.reconnectRequired === true
  );
});

test('event creation removes the local record when Google Calendar rejects the sync', async () => {
  const eventService = await import('../src/services/operationalEventService.js');
  assert.equal(typeof eventService.createSyncedOperationalEvent, 'function');

  const calls = [];
  await assert.rejects(
    eventService.createSyncedOperationalEvent({
      createLocalEvent: async () => {
        calls.push('create');
        return { id: 'event-1' };
      },
      syncToGoogle: async () => {
        calls.push('sync');
        throw new Error('invalid_grant');
      },
      deleteLocalEvent: async (id) => calls.push(`delete:${id}`)
    }),
    /invalid_grant/
  );

  assert.deepEqual(calls, ['create', 'sync', 'delete:event-1']);
});

test('event updates restore the previous local values when Google Calendar rejects the sync', async () => {
  const eventService = await import('../src/services/operationalEventService.js');
  assert.equal(typeof eventService.updateSyncedOperationalEvent, 'function');

  const calls = [];
  await assert.rejects(
    eventService.updateSyncedOperationalEvent({
      updateLocalEvent: async () => {
        calls.push('update');
        return { id: 'event-1', title: 'Cambio no confirmado' };
      },
      syncToGoogle: async () => {
        calls.push('sync');
        throw Object.assign(new Error('Invalid start time.'), { code: 'INVALID_GOOGLE_EVENT_TIME' });
      },
      restoreLocalEvent: async () => calls.push('restore:event-1')
    }),
    candidate => candidate.code === 'INVALID_GOOGLE_EVENT_TIME'
  );

  assert.deepEqual(calls, ['update', 'sync', 'restore:event-1']);
});

test('invalid event ranges are rejected before calendar persistence', async () => {
  const { normalizeOperationalEventRange } = await import('../src/services/operationalEventService.js');

  assert.throws(
    () => normalizeOperationalEventRange({
      startAt: '2026-09-03T15:00:00.000Z',
      endAt: '2026-09-03T14:00:00.000Z'
    }),
    candidate => candidate.code === 'INVALID_EVENT_RANGE'
  );
});

test('calendar date rejections return a useful validation response instead of a generic 500', async () => {
  const activityRoutes = await read('src/routes/api/activity.js');

  assert.match(activityRoutes, /INVALID_EVENT_RANGE/);
  assert.match(activityRoutes, /INVALID_GOOGLE_EVENT_TIME/);
  assert.match(activityRoutes, /status\(422\)/);
  assert.match(activityRoutes, /fechas? y horas?/i);
});

test('multi-account calendar wiring validates recent connections and exposes real Meet errors', async () => {
  const oauthService = await read('src/services/googleCalendarOAuthService.js');
  const eventService = await read('src/services/operationalEventService.js');
  const calendarService = await read('src/services/calendarService.js');
  const activityRoutes = await read('src/routes/api/activity.js');

  assert.match(oauthService, /lastSyncedAt:\s*\{\s*sort:\s*'desc',\s*nulls:\s*'last'\s*\}/);
  assert.match(oauthService, /authorizeGoogleCalendarConnections/);
  assert.match(eventService, /createSyncedOperationalEvent/);
  assert.match(eventService, /captureWithFireflies/);
  assert.match(calendarService, /Central OAuth Meet creation failed:[\s\S]*throw error/);
  assert.match(activityRoutes, /events\/generate-meet[\s\S]*isGoogleOAuthReauthError/);
  assert.match(activityRoutes, /Error generating Meet link/);
});
