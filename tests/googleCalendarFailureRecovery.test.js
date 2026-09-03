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

test('a successful Google write is not rolled back locally when only sync metadata persistence fails', async () => {
  const { createSyncedOperationalEvent, updateSyncedOperationalEvent } = await import('../src/services/operationalEventService.js');
  const metadataError = Object.assign(new Error('metadata pending'), {
    code: 'GOOGLE_SYNC_METADATA_PENDING',
    preserveLocal: true
  });
  let deleted = false;
  let restored = false;

  await assert.rejects(createSyncedOperationalEvent({
    createLocalEvent: async () => ({ id: 'created-1' }),
    syncToGoogle: async () => { throw metadataError; },
    deleteLocalEvent: async () => { deleted = true; }
  }), candidate => candidate === metadataError);
  await assert.rejects(updateSyncedOperationalEvent({
    updateLocalEvent: async () => ({ id: 'updated-1' }),
    syncToGoogle: async () => { throw metadataError; },
    restoreLocalEvent: async () => { restored = true; }
  }), candidate => candidate === metadataError);

  assert.equal(deleted, false);
  assert.equal(restored, false);
});

test('linked Google synchronization errors use a dedicated retry path', async () => {
  const { retryOperationalEventGoogleSync } = await import('../src/services/operationalEventService.js');
  assert.equal(typeof retryOperationalEventGoogleSync, 'function');

  const calls = [];
  const result = await retryOperationalEventGoogleSync('event-1', null, {
    findEvent: async id => {
      calls.push(`find:${id}`);
      return { id, googleLinks: [{ googleEventId: 'google-1', isOrganizer: true }] };
    },
    syncToGoogle: async event => {
      calls.push(`sync:${event.id}`);
      return { ...event, googleSyncStatus: 'SYNCED' };
    }
  });

  assert.equal(result.googleSyncStatus, 'SYNCED');
  assert.deepEqual(calls, ['find:event-1', 'sync:event-1']);
});

test('event mutations and linked retries require a manager role', async () => {
  const activityRoutes = await read('src/routes/api/activity.js');
  const calendar = await read('src/components/modules/Activity/OperationalCalendar.jsx');

  assert.match(activityRoutes, /router\.post\('\/events',\s*requireManagerRole/);
  assert.match(activityRoutes, /router\.patch\('\/events\/:id',\s*requireManagerRole/);
  assert.match(activityRoutes, /router\.delete\('\/events\/:id',\s*requireManagerRole/);
  assert.match(activityRoutes, /router\.post\('\/google-calendar\/errors\/:id\/retry',\s*requireManagerRole/);
  assert.match(activityRoutes, /retryOperationalEventGoogleSync/);
  assert.match(calendar, /google-calendar\/errors\/\$\{eventId\}\/retry/);
  assert.match(calendar, /linkedRetryMutation\.mutate\(event\.id\)/);
  assert.doesNotMatch(calendar, /reconciliationMutation\.mutate\(\{ eventIds: \[event\.id\]/);
});

test('calendar event input rejects unsupported types and recurrence endings before the event begins', async () => {
  const { validateOperationalEventInput } = await import('../src/services/operationalEventService.js');

  assert.throws(
    () => validateOperationalEventInput({
      title: 'Prueba',
      type: 'INVALID',
      recurrence: 'NONE',
      startAt: '2026-09-03T14:00:00.000Z',
      endAt: '2026-09-03T15:00:00.000Z'
    }),
    candidate => candidate.code === 'INVALID_EVENT_TYPE'
  );

  assert.throws(
    () => validateOperationalEventInput({
      title: 'Semanal',
      type: 'PROJECT',
      recurrence: 'WEEKLY',
      recurrenceEnd: '2026-09-01T05:00:00.000Z',
      startAt: '2026-09-03T14:00:00.000Z',
      endAt: '2026-09-03T15:00:00.000Z'
    }),
    candidate => candidate.code === 'INVALID_EVENT_RECURRENCE'
  );
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

test('linked Google updates carry their ETag and surface concurrent edits as conflicts', async () => {
  const { getGooglePatchOptions, classifyGoogleCalendarSyncError } = await import('../src/services/operationalEventService.js');
  assert.deepEqual(getGooglePatchOptions({ googleEtag: '"etag-123"' }), {
    headers: { 'If-Match': '"etag-123"' }
  });
  assert.equal(getGooglePatchOptions({}), undefined);
  assert.equal(classifyGoogleCalendarSyncError(Object.assign(new Error('Precondition Failed'), { code: 412 })), 'GOOGLE_CALENDAR_CONFLICT');

  const service = await read('src/services/operationalEventService.js');
  const routes = await read('src/routes/api/activity.js');
  assert.match(service, /calendar\.events\.patch\([\s\S]*getGooglePatchOptions\(targetLink/);
  assert.match(routes, /GOOGLE_CALENDAR_CONFLICT/);
  assert.match(routes, /status\(409\)/);
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
