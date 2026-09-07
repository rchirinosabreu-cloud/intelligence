import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/services/operationalEventService.js';
import { EventEmitter } from 'node:events';
import { withCalendarSyncLock } from '../src/services/calendarSyncLock.js';
import prisma from '../src/lib/prisma.js';

const connection = { id: 'account-1', email: 'owner@example.com', calendarId: 'primary', syncToken: 'old-token', syncVersion: 2, connectedAt: new Date('2026-01-01'), isActive: true };
const googleEvent = (extra = {}) => ({
  id: 'google-1', iCalUID: 'uid-1', summary: 'Reunión Google',
  start: { dateTime: '2026-09-07T09:00:00-05:00' }, end: { dateTime: '2026-09-07T10:00:00-05:00' },
  updated: '2026-09-07T12:00:00Z', organizer: { email: 'owner@example.com' }, ...extra
});
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (key === 'OR') return value.some(candidate => matches(row, candidate));
  if (key === 'AND') return value.every(candidate => matches(row, candidate));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('in' in value) return value.in.includes(row[key]);
    if ('not' in value) return row[key] !== value.not;
    if ('notIn' in value) return !value.notIn.includes(row[key]);
  }
  if (value instanceof Date) return new Date(row[key]).getTime() === value.getTime();
  return (row[key] ?? null) === value;
});
function persistence(events = [], links = []) {
  const state = { events: structuredClone(events), links: structuredClone(links), connection: structuredClone(connection), commits: [], failLink: false };
  const db = {
    operationalEvent: {
      findUnique: async ({ where }) => state.events.find(row => matches(row, where)) || null,
      findFirst: async ({ where }) => state.events.find(row => matches(row, where)) || null,
      findMany: async ({ where } = {}) => state.events.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: `local-${state.events.length + 1}`, ...data }; state.events.push(row); return row; },
      update: async ({ where, data }) => { const row = state.events.find(row => matches(row, where)); assert.ok(row); Object.assign(row, data); return row; },
      delete: async ({ where }) => { state.events = state.events.filter(row => !matches(row, where)); },
      updateMany: async ({ where, data }) => { const rows = state.events.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; }
    },
    googleCalendarEventLink: {
      findFirst: async ({ where, include }) => { const row = state.links.find(row => matches(row, where)); return row ? { ...row, ...(include ? { operationalEvent: state.events.find(event => event.id === row.operationalEventId) } : {}) } : null; },
      findMany: async ({ where }) => state.links.filter(row => matches(row, where)),
      count: async ({ where }) => state.links.filter(row => matches(row, where)).length,
      delete: async ({ where }) => { state.links = state.links.filter(row => !matches(row, where)); },
      upsert: async ({ where, create, update }) => {
        if (state.failLink) throw new Error('link persistence unavailable');
        const row = state.links.find(row => matches(row, where.connectionId_calendarId_googleEventId));
        if (row) { Object.assign(row, update); return row; }
        const created = { id: `link-${state.links.length + 1}`, ...create }; state.links.push(created); return created;
      }
    },
    googleCalendarConnection: {
      findUnique: async () => state.connection,
      update: async ({ data }) => { Object.assign(state.connection, data); return state.connection; },
      updateMany: async ({ where, data }) => { if (!matches(state.connection, where)) return { count: 0 }; Object.assign(state.connection, data); state.commits.push(data); return { count: 1 }; }
    },
    teamMember: { findMany: async () => [] },
    $transaction: async callback => {
      const snapshot = structuredClone({ events: state.events, links: state.links });
      try { return await callback(db); } catch (error) { Object.assign(state, snapshot); throw error; }
    }
  };
  return { db, state };
}
const localEvent = extra => ({ id: 'local-1', source: 'BRAIN', googleSyncStatus: 'SYNCED', googleICalUID: 'uid-1', googleRecurringEventId: null, googleOriginalStartAt: null, googleUpdatedAt: new Date('2026-09-07T11:00Z'), title: 'Local', ...extra });
const eventLink = extra => ({ id: 'link-1', operationalEventId: 'local-1', connectionId: 'account-1', calendarId: 'primary', googleEventId: 'google-1', isOrganizer: true, ...extra });

test('a failed event-link write rolls the imported event back atomically', async () => {
  assert.equal(typeof service.importGoogleCalendarEvent, 'function');
  const { db, state } = persistence(); state.failLink = true;
  await assert.rejects(service.importGoogleCalendarEvent(googleEvent(), connection, [], db), /link persistence/);
  assert.equal(state.events.length, 0);
});

test('pull retains Brain provenance and does not overwrite pending local changes', async () => {
  assert.equal(typeof service.importGoogleCalendarEvent, 'function');
  const { db, state } = persistence([localEvent({ title: 'Cambio pendiente', googleSyncStatus: 'RETRY', googleSyncError: 'timeout' })], [eventLink()]);
  await service.importGoogleCalendarEvent(googleEvent(), connection, [], db);
  assert.equal(state.events[0].title, 'Cambio pendiente');
  assert.equal(state.events[0].googleSyncStatus, 'RETRY');
  assert.equal(state.events[0].source, 'BRAIN');
});

test('older guest copies do not replace the organizer payload or canonical account', async () => {
  assert.equal(typeof service.importGoogleCalendarEvent, 'function');
  const { db, state } = persistence([localEvent({ title: 'Actual', googleConnectionId: 'account-1', googleCalendarId: 'primary', googleEventId: 'google-1', googleUpdatedAt: new Date('2026-09-07T13:00Z') })], [eventLink()]);
  await service.importGoogleCalendarEvent(googleEvent({ id: 'guest-copy', summary: 'Viejo' }), { ...connection, id: 'guest', email: 'guest@example.com' }, [], db);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title, 'Actual');
  assert.equal(state.events[0].googleConnectionId, 'account-1');
  assert.equal(state.links.length, 2);
});

test('a recurring exception shares iCalUID without overwriting its series master', async () => {
  assert.equal(typeof service.importGoogleCalendarEvent, 'function');
  const { db, state } = persistence([localEvent({ recurrence: 'WEEKLY', googleEventId: 'series' })]);
  await service.importGoogleCalendarEvent(googleEvent({ id: 'series_20260907', recurringEventId: 'series', originalStartTime: { dateTime: '2026-09-07T09:00:00-05:00' } }), connection, [], db);
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0].recurrence, 'WEEKLY');
  assert.equal(state.events[1].googleRecurringEventId, 'series');
  assert.equal(state.events[1].googleOriginalStartAt.toISOString(), '2026-09-07T14:00:00.000Z');
});

test('cancelled recurring instances are retained as exclusions even without start/end', async () => {
  assert.equal(typeof service.importGoogleCalendarEvent, 'function');
  const { db, state } = persistence();
  await service.importGoogleCalendarEvent({ id: 'series_20260907', recurringEventId: 'series', status: 'cancelled', originalStartTime: { dateTime: '2026-09-07T09:00:00-05:00' } }, connection, [], db);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].googleCancelled, true);
  assert.equal(state.events[0].googleRecurringEventId, 'series');
});

test('weekly expansion excludes cancellations and replaces moved occurrences', () => {
  const series = { id: 'series-local', googleEventId: 'series', googleICalUID: 'uid', recurrence: 'WEEKLY', startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z') };
  const moved = { id: 'moved', googleRecurringEventId: 'series', googleOriginalStartAt: new Date('2026-09-14T14:00Z'), startAt: new Date('2026-09-15T14:00Z'), endAt: new Date('2026-09-15T15:00Z') };
  const cancelled = { id: 'cancelled', googleRecurringEventId: 'series', googleOriginalStartAt: new Date('2026-09-21T14:00Z'), googleCancelled: true, startAt: new Date('2026-09-21T14:00Z'), endAt: new Date('2026-09-21T15:00Z') };
  const result = service.expandOperationalEventOccurrences([series, moved, cancelled], '2026-09-01', '2026-09-30');
  assert.deepEqual(result.map(event => new Date(event.startAt).toISOString()), ['2026-09-07T14:00:00.000Z', '2026-09-15T14:00:00.000Z', '2026-09-28T14:00:00.000Z']);
});

test('full sync covers the entire collection and upgrades old window-limited tokens', async () => {
  assert.equal(typeof service.syncGoogleCalendarConnection, 'function');
  const { db, state } = persistence(); state.connection.syncVersion = 0;
  const requests = [];
  const result = await service.syncGoogleCalendarConnection({ connectionId: connection.id }, {
    prismaClient: db, authorize: async () => ({ connection: state.connection, oauth2Client: {} }),
    createCalendar: () => ({}), listPages: async (_, request) => { requests.push(request); return { items: [], nextSyncToken: 'new-token' }; }
  });
  assert.equal(result.connected, true);
  assert.equal(requests[0].timeMin, undefined);
  assert.equal(requests[0].timeMax, undefined);
  assert.equal(requests[0].syncToken, undefined);
  assert.equal(state.connection.syncVersion, 2);
  assert.equal(state.connection.syncToken, 'new-token');
});

test('failed token-reset full sync leaves cursor cleared and never stamps successful sync', async () => {
  assert.equal(typeof service.syncGoogleCalendarConnection, 'function');
  const { db, state } = persistence();
  await assert.rejects(service.syncGoogleCalendarConnection({}, {
    prismaClient: db, authorize: async () => ({ connection: structuredClone(state.connection), oauth2Client: {} }), createCalendar: () => ({}),
    listPages: async (_, request) => { if (request.syncToken) throw Object.assign(new Error('expired'), { code: 'GOOGLE_SYNC_TOKEN_EXPIRED' }); throw new Error('network down'); }
  }), /network down/);
  assert.equal(state.connection.syncToken, null);
  assert.equal(state.connection.lastSyncedAt, undefined);
});

test('a calendar switch while fetching cannot commit the previous calendar cursor', async () => {
  assert.equal(typeof service.syncGoogleCalendarConnection, 'function');
  const { db, state } = persistence();
  await assert.rejects(service.syncGoogleCalendarConnection({}, {
    prismaClient: db, authorize: async () => ({ connection: structuredClone(state.connection), oauth2Client: {} }), createCalendar: () => ({}),
    listPages: async () => { state.connection.calendarId = 'other-calendar'; return { items: [], nextSyncToken: 'wrong-calendar-token' }; }
  }), error => error.code === 'GOOGLE_CALENDAR_SYNC_STALE');
  assert.equal(state.connection.syncToken, 'old-token');
});

test('custom monthly and daily recurrences expand with COUNT and EXDATE', () => {
  const event = { id: 'custom', recurrence: 'GOOGLE', googleTimeZone: 'America/Bogota', startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z'), googleRecurrence: ['RRULE:FREQ=DAILY;COUNT=4', 'EXDATE:20260909T140000Z'] };
  const result = service.expandOperationalEventOccurrences([event], '2026-09-01', '2026-09-30');
  assert.deepEqual(result.map(item => item.startAt.toISOString()), ['2026-09-07T14:00:00.000Z', '2026-09-08T14:00:00.000Z', '2026-09-10T14:00:00.000Z']);
});

test('recurrence uses the original Google timezone through daylight saving changes', () => {
  const event = { id: 'dst', recurrence: 'WEEKLY', googleTimeZone: 'America/New_York', startAt: new Date('2026-10-26T13:00Z'), endAt: new Date('2026-10-26T14:00Z'), googleRecurrence: ['RRULE:FREQ=WEEKLY;COUNT=3'] };
  const result = service.expandOperationalEventOccurrences([event], '2026-10-25', '2026-11-12');
  assert.deepEqual(result.map(item => item.startAt.toISOString()), ['2026-10-26T13:00:00.000Z', '2026-11-02T14:00:00.000Z', '2026-11-09T14:00:00.000Z']);
});

test('snapshot absence after an expired token marks only confirmed linked events cancelled', async () => {
  const { db, state } = persistence([localEvent({})], [eventLink()]);
  await service.syncGoogleCalendarConnection({}, {
    prismaClient: db, authorize: async () => ({ connection: structuredClone(state.connection), oauth2Client: {} }), createCalendar: () => ({}),
    listPages: async (_, request) => { if (request.syncToken) throw Object.assign(new Error('expired'), { code: 'GOOGLE_SYNC_TOKEN_EXPIRED' }); return { items: [], nextSyncToken: 'new-token' }; }
  });
  assert.equal(state.events[0].googleCancelled, true);
});

test('one failing Google account does not prevent synchronization of another account', async () => {
  assert.match(service.syncAllGoogleCalendars.toString(), /listConnections/, 'all-account sync must enumerate before authorizing each account independently');
  const calls = [];
  const result = await service.syncAllGoogleCalendars({}, {
    listConnections: async () => [{ id: 'broken', email: 'broken@example.com' }, { id: 'healthy', email: 'healthy@example.com' }],
    syncCalendar: async ({ connectionId }) => { calls.push(connectionId); if (connectionId === 'broken') throw new Error('network error'); return { connected: true, imported: 2 }; },
    logger: { error() {} }
  });
  assert.deepEqual(calls, ['broken', 'healthy']);
  assert.equal(result[0].error, 'network error');
  assert.equal(result[1].imported, 2);
});

test('webhook token with a mismatched Google resource ID is rejected', async () => {
  let scheduled = false;
  const result = await service.handleGoogleCalendarWebhook({ 'x-goog-channel-id': 'channel', 'x-goog-channel-token': 'token', 'x-goog-resource-id': 'wrong', 'x-goog-resource-state': 'exists' }, {
    findChannel: async () => ({ connectionId: 'account', resourceId: 'expected' }), scheduleSync: () => { scheduled = true; }
  });
  assert.equal(result.accepted, false);
  assert.equal(scheduled, false);
});

test('a repeated Google page token aborts without endlessly fetching the same events', async () => {
  let requests = 0;
  await assert.rejects(service.listAllGoogleEventPages({ events: { list: async () => {
    requests += 1;
    if (requests > 3) throw new Error('test page safety stop');
    return { data: { items: [], nextPageToken: 'same-token' } };
  } } }, { calendarId: 'primary' }), /página.*repetida/i);
  assert.equal(requests, 2);
});

test('a repaired merged duplicate cannot be picked again by iCalUID', async () => {
  const { db, state } = persistence([localEvent({ googleSyncStatus: 'MERGED', googleCancelled: true }), localEvent({ id: 'canonical' })]);
  await service.importGoogleCalendarEvent(googleEvent(), connection, [], db);
  assert.equal(state.events[0].googleSyncStatus, 'MERGED');
  assert.equal(state.events[1].title, 'Reunión Google');
  assert.equal(state.links[0].operationalEventId, 'canonical');
});

test('editing a New York series keeps its recurrence timezone in the Google payload', () => {
  const payload = service.buildGoogleEventPayload({ id: 'nyc', type: 'MEETING', title: 'NYC', googleTimeZone: 'America/New_York', startAt: new Date('2026-10-26T13:00Z'), endAt: new Date('2026-10-26T14:00Z'), recurrence: 'WEEKLY', attendeeEmails: [] });
  assert.equal(payload.start.timeZone, 'America/New_York');
  assert.equal(payload.start.dateTime, '2026-10-26T13:00:00.000Z');
});

test('unsafe high-frequency recurrences return an explicit limit error', () => {
  assert.throws(() => service.expandOperationalEventOccurrences([{ id: 'dense', recurrence: 'GOOGLE', googleRecurrence: ['RRULE:FREQ=SECONDLY;COUNT=10001'], startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z') }], '2026-09-07', '2026-09-08'), error => error.code === 'GOOGLE_CALENDAR_RECURRENCE_LIMIT');
});

test('calendar reads reject invalid or unbounded date ranges before querying persistence', async () => {
  assert.equal(typeof service.validateOperationalCalendarRange, 'function');
  assert.throws(() => service.validateOperationalCalendarRange('invalid', '2026-09-08'), error => error.code === 'INVALID_CALENDAR_RANGE');
  assert.throws(() => service.validateOperationalCalendarRange('2000-01-01', '2026-09-08'), error => error.code === 'INVALID_CALENDAR_RANGE');
});

test('renewing watch channels continues when the first account cannot authorize', async () => {
  assert.match(service.renewGoogleCalendarWatchChannels.toString(), /listConnections/);
  const watchCalls = [];
  const result = await service.renewGoogleCalendarWatchChannels({
    listConnections: async () => [{ id: 'broken', email: 'broken@example.com' }, { id: 'healthy', email: 'healthy@example.com' }],
    authorize: async id => { if (id === 'broken') throw new Error('invalid_grant'); return { connection: { id, email: 'healthy@example.com', calendarId: 'primary' }, oauth2Client: {} }; },
    withLock: task => task(), logger: { error() {} },
    prismaClient: { googleCalendarSyncChannel: { findFirst: async () => null, create: async () => {} } },
    createCalendar: () => ({ events: { watch: async request => { watchCalls.push(request); return { data: { resourceId: 'resource' } }; } } })
  });
  assert.equal(watchCalls.length, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.renewed, ['healthy@example.com']);
});

test('explicit historical reconciliation persists retry intent before calling Google', async () => {
  assert.match(service.reconcilePendingOperationalEvents.toString(), /withLock/);
  const writes = [];
  const result = await service.reconcilePendingOperationalEvents({ eventIds: ['legacy'], connectionId: 'selected' }, {
    withLock: task => task(), now: () => new Date('2026-09-01T00:00:00Z'), authorize: async () => ({ connection: { id: 'selected' } }),
    prismaClient: { operationalEvent: { findMany: async () => [{ id: 'legacy', startAt: new Date('2026-09-10T14:00:00Z'), endAt: new Date('2026-09-10T15:00:00Z') }], update: async ({ data }) => { writes.push(data); return { id: 'legacy', ...data }; } } },
    syncToGoogle: async event => { assert.equal(event.googleSyncStatus, 'PENDING'); throw new Error('network'); }, logger: { error() {} }
  });
  assert.equal(writes[0].googleConnectionId, 'selected');
  assert.equal(writes[0].googleSyncStatus, 'PENDING');
  assert.equal(result.failed, 1);
});

test('Google metadata pointing to a repaired duplicate follows the remaining canonical UID', async () => {
  const { db, state } = persistence([localEvent({ googleSyncStatus: 'MERGED', googleCancelled: true }), localEvent({ id: 'canonical' })]);
  await service.importGoogleCalendarEvent(googleEvent({ extendedProperties: { private: { brainOperationalEventId: 'local-1' } } }), connection, [], db);
  assert.equal(state.links[0].operationalEventId, 'canonical');
  assert.equal(state.events[0].googleSyncStatus, 'MERGED');
});

test('cancellation rolls back when the shared PostgreSQL lock is lost during persistence', async () => {
  const { db, state } = persistence([localEvent({})], [eventLink(), eventLink({ id: 'other', connectionId: 'other-account' })]);
  const client = new EventEmitter(); client.query = async () => ({ rows: [{ locked: true }] }); client.release = () => {};
  const remove = db.googleCalendarEventLink.delete;
  db.googleCalendarEventLink.delete = async query => { await remove(query); client.emit('error', new Error('connection lost')); };
  await assert.rejects(withCalendarSyncLock(() => service.importGoogleCalendarEvent({ id: 'google-1', status: 'cancelled' }, connection, [], db), { pool: { connect: async () => client } }), error => error.code === 'GOOGLE_SYNC_PENDING');
  assert.equal(state.links.length, 2);
});

test('weekly rules with explicit excluded dates survive a Google round trip', () => {
  const rules = ['RRULE:FREQ=WEEKLY', 'EXDATE:20260914T140000Z'];
  const mapped = service.getGoogleRecurrenceData({ recurrence: rules });
  assert.equal(mapped.recurrence, 'GOOGLE');
  assert.deepEqual(service.buildGoogleRecurrence(mapped), rules);
});

test('RDATE-only Google series retain their explicit dates', () => {
  const rules = ['RDATE:20260907T140000Z,20260914T140000Z'];
  const mapped = service.getGoogleRecurrenceData({ recurrence: rules });
  assert.equal(mapped.recurrence, 'GOOGLE');
  assert.deepEqual(service.buildGoogleRecurrence(mapped), rules);
});

test('cancelling a recurring master also hides previously moved exceptions', () => {
  const master = { id: 'master', googleEventId: 'series', googleICalUID: 'series-uid', recurrence: 'WEEKLY', googleCancelled: true, startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z') };
  const moved = { id: 'exception', googleRecurringEventId: 'series', googleICalUID: 'series-uid', googleOriginalStartAt: new Date('2026-09-14T14:00Z'), startAt: new Date('2026-09-15T14:00Z'), endAt: new Date('2026-09-15T15:00Z') };
  assert.deepEqual(service.expandOperationalEventOccurrences([master, moved], '2026-09-01', '2026-09-30'), []);
});

test('a moved exception outside the cancelled series original range loads its parent before display', async t => {
  const moved = { id: 'exception', googleRecurringEventId: 'series', googleICalUID: 'series-uid', googleOriginalStartAt: new Date('2026-09-14T14:00Z'), startAt: new Date('2026-10-15T14:00Z'), endAt: new Date('2026-10-15T15:00Z') };
  const master = { id: 'master', googleEventId: 'series', googleICalUID: 'series-uid', recurrence: 'WEEKLY', googleCancelled: true, recurrenceEnd: new Date('2026-09-15'), startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z') };
  let reads = 0;
  const previous = prisma.operationalEvent.findMany;
  prisma.operationalEvent.findMany = async () => (++reads === 1 ? [moved] : [master]);
  t.after(() => { prisma.operationalEvent.findMany = previous; });
  assert.deepEqual(await service.getOperationalEvents('2026-10-01', '2026-10-31'), []);
  assert.equal(reads, 2);
});
