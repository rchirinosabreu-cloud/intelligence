import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Google OAuth skips a revoked connection, deactivates it, and uses the next healthy connection', async () => {
  const oauthService = await import('../src/services/googleCalendarOAuthService.js');

  assert.equal(typeof oauthService.authorizeGoogleCalendarConnections, 'function');

  const deactivated = [];
  const clients = new Map([
    ['social', {
      setCredentials() {},
      async getAccessToken() {
        const error = new Error('Token has been expired or revoked');
        error.code = 'invalid_grant';
        throw error;
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

test('Google OAuth reports reauthorization when every active connection is revoked', async () => {
  const { authorizeGoogleCalendarConnections } = await import('../src/services/googleCalendarOAuthService.js');
  assert.equal(typeof authorizeGoogleCalendarConnections, 'function');

  await assert.rejects(
    authorizeGoogleCalendarConnections([
      { id: 'social', encryptedTokens: 'social' }
    ], {
      createOAuthClient: () => ({
        setCredentials() {},
        async getAccessToken() {
          const error = new Error('invalid_grant');
          error.code = 'invalid_grant';
          throw error;
        }
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
        return { id: 'event-1', title: 'Client meeting' };
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

test('calendar services wire recovery into event and Meet creation without hiding Google details', async () => {
  const oauthService = await read('src/services/googleCalendarOAuthService.js');
  const eventService = await read('src/services/operationalEventService.js');
  const calendarService = await read('src/services/calendarService.js');
  const activityRoutes = await read('src/routes/api/activity.js');

  assert.match(oauthService, /lastSyncedAt:\s*\{\s*sort:\s*'desc',\s*nulls:\s*'last'\s*\}/);
  assert.match(oauthService, /authorizeGoogleCalendarConnections/);
  assert.match(eventService, /createSyncedOperationalEvent/);
  assert.doesNotMatch(eventService, /googleSyncStatus:\s*'ERROR'[\s\S]{0,300}throw new Error/);
  assert.match(calendarService, /Central OAuth Meet creation failed:[\s\S]*throw error/);
  assert.match(activityRoutes, /events\/generate-meet[\s\S]*isGoogleOAuthReauthError/);
  assert.match(activityRoutes, /Error generating Meet link/);
});
