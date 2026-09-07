import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/services/operationalEventService.js';
import { readFile } from 'node:fs/promises';

const event = () => ({ id: 'local-event-1', title: 'Calendar test', type: 'PROJECT',
  startAt: new Date('2026-09-07T14:00:00Z'), endAt: new Date('2026-09-07T15:00:00Z'),
  attendeeEmails: [], recurrence: 'NONE', googleConnectionId: 'connection-1', source: 'BRAIN' });
function dependencies(calendar, authorization = { connection: { id: 'connection-1', email: 'test@example.com', calendarId: 'primary' } }) {
  const writes = [];
  const db = { googleCalendarConnection: { updateMany: async () => ({ count: 1 }) }, operationalEvent: { update: async ({ data }) => { writes.push(data); return { ...event(), ...data }; } },
    googleCalendarEventLink: { upsert: async () => ({}) } };
  return { db, writes, authorize: async () => authorization, createCalendar: () => calendar, lock: task => task() };
}

test('no authorized Google account never returns a false successful local event', async () => {
  await assert.rejects(service.syncOperationalEventToGoogle(event(), dependencies({}, null)),
    error => error.code === 'GOOGLE_CALENDAR_NOT_CONNECTED');
});

test('a lost insert response is recovered with the same Google ID without a second insert', async () => {
  const stored = new Map(); let inserts = 0;
  const calendar = { events: {
    get: async ({ eventId }) => { if (!stored.has(eventId)) throw { code: 404 }; return { data: stored.get(eventId) }; },
    insert: async ({ requestBody }) => {
      inserts++;
      stored.set(requestBody.id, { ...requestBody, etag: 'etag', organizer: { email: 'test@example.com' } });
      throw Object.assign(new Error('lost response'), { code: 'ETIMEDOUT' });
    }
  } };
  const deps = dependencies(calendar);
  const result = await service.syncOperationalEventToGoogle(event(), deps);
  assert.equal(result.googleSyncStatus, 'SYNCED');
  assert.match(result.googleEventId, /^[0-9a-v]{5,1024}$/);
  assert.equal(inserts, 1);
  await service.syncOperationalEventToGoogle(event(), deps);
  assert.equal(inserts, 1);
});

test('uncertain Google failure keeps durable pending work and its local identity', async () => {
  const calendar = { events: {
    get: async () => { throw { code: 404 }; },
    insert: async () => { throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }); }
  } };
  const deps = dependencies(calendar);
  await assert.rejects(service.syncOperationalEventToGoogle(event(), deps), error =>
    error.preserveLocal === true && error.eventId === event().id && error.code === 'GOOGLE_SYNC_PENDING');
  assert.equal(deps.writes.at(-1).googleSyncStatus, 'PENDING');
  assert.ok(deps.writes.at(-1).googleNextRetryAt instanceof Date);
});

test('retrying a legacy link uses its saved calendar, even after the active calendar changes', async () => {
  let target;
  const calendar = { events: { get: async () => ({ data: { summary: 'Old' } }), patch: async request => {
    target = request.calendarId;
    return { data: { id: request.eventId, ...request.requestBody } };
  } } };
  await service.syncOperationalEventToGoogle({ ...event(), googleEventId: 'legacy', googleCalendarId: 'original@example.com' }, dependencies(calendar));
  assert.equal(target, 'original@example.com');
});

test('Meet request identity is stable when an insert must be retried', () => {
  const meeting = { ...event(), type: 'MEETING' };
  const first = service.buildGoogleEventPayload(meeting);
  assert.equal(first.conferenceData.createRequest.requestId, `brain-${meeting.id}`);
});

test('create idempotency rejects key reuse with changed payload or actor', async () => {
  assert.equal(typeof service.getOperationalEventRequestIdentity, 'function');
  const payload = { ...event(), requestId: 'idempotency-key-123' };
  const first = service.getOperationalEventRequestIdentity(payload, 'actor-1');
  assert.deepEqual(first, service.getOperationalEventRequestIdentity({ ...payload }, 'actor-1'));
  assert.notEqual(first.requestHash, service.getOperationalEventRequestIdentity({ ...payload, title: 'Changed' }, 'actor-1').requestHash);
  assert.notEqual(first.requestHash, service.getOperationalEventRequestIdentity(payload, 'actor-2').requestHash);
});

test('legacy clients without a stable request key cannot create duplicate-prone events', async () => {
  await assert.rejects(service.createOperationalEvent(event(), 'actor', {
    lock: task => task(), now: () => new Date('2026-09-01T00:00:00Z'),
    db: { operationalEvent: { findUnique: async () => assert.fail('must reject the missing key before persistence') } }
  }), error => error.code === 'INVALID_EVENT_REQUEST_ID');
});

test('shared DB lock blocks a second process and always releases the session', async () => {
  const module = await import('../src/services/calendarSyncLock.js').catch(() => ({}));
  assert.equal(typeof module.withCalendarSyncLock, 'function');
  let unlocks = 0; let releases = 0;
  const pool = { connect: async () => ({
    query: async sql => { if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] }; unlocks++; return { rows: [] }; },
    release: () => { releases++; }, on() {}, removeListener() {}
  }) };
  await assert.rejects(module.withCalendarSyncLock(async () => { throw new Error('work failed'); }, { pool }), /work failed/);
  assert.equal(unlocks, 1); assert.equal(releases, 1);
  const busyPool = { connect: async () => ({ query: async () => ({ rows: [{ locked: false }] }), release() {}, on() {}, removeListener() {} }) };
  let ran = false;
  await assert.rejects(module.withCalendarSyncLock(async () => { ran = true; }, { pool: busyPool }), e => e.code === 'GOOGLE_CALENDAR_BUSY');
  assert.equal(ran, false);
});

test('durable retry schema is additive and creation/recovery share a persisted request key', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../scripts/ensure-calendar-invitations-schema.js', import.meta.url), 'utf8');
  assert.match(schema, /requestId\s+String\?\s+@unique/);
  assert.match(schema, /requestHash\s+String\?/);
  assert.match(schema, /googleNextRetryAt\s+DateTime\?/);
  assert.match(bootstrap, /ADD COLUMN IF NOT EXISTS "requestId"/);
  assert.match(bootstrap, /ADD COLUMN IF NOT EXISTS "googleNextRetryAt"/);
  assert.doesNotMatch(bootstrap, /DROP TABLE|DROP COLUMN|DELETE FROM/);
});

test('duplicate create requests reuse one durable record; changed payload cannot reuse its key', async () => {
  const rows = []; let syncs = 0;
  const deps = { lock: task => task(), now: () => new Date('2026-09-01T00:00:00Z'), authorize: async () => ({ connection: { id: 'c1', calendarId: 'primary' } }),
    db: { operationalEvent: {
      findUnique: async ({ where }) => rows.find(row => row.requestId === where.requestId),
      create: async ({ data }) => { const row = { id: 'saved', ...data }; rows.push(row); return row; }, delete: async () => assert.fail('must not delete')
    } },
    syncToGoogle: async row => { syncs++; row.googleSyncStatus = 'SYNCED'; return row; }
  };
  const input = { ...event(), requestId: 'stable-request-1' };
  const first = await service.createOperationalEvent(input, 'actor', deps);
  const second = await service.createOperationalEvent(input, 'actor', deps);
  assert.equal(first.id, second.id); assert.equal(rows.length, 1); assert.equal(syncs, 1);
  await assert.rejects(service.createOperationalEvent({ ...input, title: 'Changed' }, 'actor', deps), e => e.code === 'EVENT_REQUEST_CONFLICT');
});

test('background recovery retries only persisted pending intents and reports failure', async () => {
  assert.equal(typeof service.retryPendingGoogleCalendarWrites, 'function');
  const retried = [];
  const failures = [];
  const result = await service.retryPendingGoogleCalendarWrites({
    findPending: async query => {
      assert.deepEqual(query.where.googleSyncStatus.in, ['PENDING', 'PENDING_DELETE']);
      assert.equal(query.take, 20);
      return ['first', 'second'].map(id => ({ id, googleSyncStatus: 'PENDING', googleSyncAttempts: 0, googleNextRetryAt: null }));
    },
    retry: async id => { retried.push(id); if (id === 'first') throw new Error('temporary failure'); return { id }; },
    persistFailure: async query => { failures.push(query); return { count: 1 }; }
  });
  assert.deepEqual(retried, ['first', 'second']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].where.id, 'first');
  assert.equal(failures[0].data.googleSyncStatus, 'PENDING');
  assert.equal(result.failed, 1); assert.equal(result.synced, 1);
});

test('deleting a Google linked event cannot report success when the account is unavailable', async () => {
  assert.equal(typeof service.deleteGoogleEventIfLinked, 'function');
  await assert.rejects(service.deleteGoogleEventIfLinked({ ...event(), googleEventId: 'linked' }, {
    authorize: async () => null
  }), e => e.code === 'GOOGLE_CALENDAR_NOT_CONNECTED');
});

test('a timed-out patch is read back before retrying; acknowledged fields are never sent twice', async () => {
  let stored = { id: 'remote', summary: 'Old', etag: 'before' }; let patches = 0;
  const calendar = { events: {
    get: async () => ({ data: stored }),
    patch: async request => { patches++; stored = { id: 'remote', etag: 'after', ...request.requestBody }; throw Object.assign(new Error('timeout after write'), { code: 'ETIMEDOUT' }); }
  } };
  const candidate = { ...event(), googleEventId: 'remote', googleEtag: 'before' };
  const result = await service.syncOperationalEventToGoogle(candidate, dependencies(calendar));
  assert.equal(result.googleSyncStatus, 'SYNCED');
  await service.syncOperationalEventToGoogle(candidate, dependencies(calendar));
  assert.equal(patches, 1);
});

test('a stale ETag never overwrites different remote content during a retry', async () => {
  const calendar = { events: {
    get: async () => ({ data: { id: 'remote', summary: 'Changed externally', etag: 'new' } }),
    patch: async () => { throw { code: 412 }; }
  } };
  await assert.rejects(service.syncOperationalEventToGoogle({ ...event(), googleEventId: 'remote', googleEtag: 'old' }, dependencies(calendar)), e => e.code === 'GOOGLE_CALENDAR_CONFLICT');
});

test('generating a Meet link never creates an untracked Calendar event as fallback', async () => {
  const { createMeetEvent } = await import('../src/services/calendarService.js');
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  try {
  await assert.rejects(createMeetEvent('Meeting', event().startAt, event().endAt, '', null, {
    createSpace: async () => null
  }), e => e.code === 'GOOGLE_CALENDAR_NOT_CONNECTED');
  } finally { if (credentials !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = credentials; }
});

test('failed error-state persistence cannot discard an uncertain remote write', async () => {
  const deps = dependencies({ events: { get: async () => { throw { code: 404 }; }, insert: async () => { throw { code: 'ECONNRESET' }; } } });
  deps.db.operationalEvent.update = async () => { throw new Error('database disconnected'); };
  await assert.rejects(service.syncOperationalEventToGoogle(event(), deps), e => e.preserveLocal === true && e.eventId === event().id);
});

test('merged tombstones cannot invoke Google mutations through a stale client', async () => {
  let authorized = false;
  const deps = dependencies({}); deps.authorize = async () => { authorized = true; throw new Error('must never authorize'); };
  await assert.rejects(service.syncOperationalEventToGoogle({ ...event(), googleSyncStatus: 'MERGED', googleCancelled: true }, deps), e => e.code === 'EVENT_NOT_FOUND');
  await assert.rejects(service.retryOperationalEventGoogleSync('merged', null, {
    lock: task => task(), findEvent: async () => ({ ...event(), googleSyncStatus: 'MERGED', googleCancelled: true }),
    syncToGoogle: async () => assert.fail('must not sync')
  }), e => e.code === 'EVENT_NOT_FOUND');
  assert.equal(authorized, false);
});

test('an insert recovered with externally changed fields is a conflict, never a false SYNCED state', async () => {
  const payload = service.buildGoogleEventPayload(event());
  const deps = dependencies({ events: { get: async () => ({ data: { id: 'remote', ...payload, summary: 'Changed externally' } }) } });
  await assert.rejects(service.syncOperationalEventToGoogle(event(), deps), e => e.code === 'GOOGLE_CALENDAR_CONFLICT');
  assert.equal(deps.writes.at(-1).googleSyncStatus, 'CONFLICT');
});

test('retry cannot retarget an uncertain write to a different Google account', async () => {
  let candidate;
  await service.retryOperationalEventGoogleSync('pending', 'different-account', {
    lock: task => task(), findEvent: async () => ({ ...event(), googleSyncStatus: 'PENDING' }),
    syncToGoogle: async value => { candidate = value; return value; }
  });
  assert.equal(candidate.googleConnectionId, 'connection-1');
});

test('conflict invalidates a previously consumed pull cursor so remote fields can be recovered', async () => {
  const deps = dependencies({ events: { get: async () => ({ data: { ...service.buildGoogleEventPayload(event()), summary: 'Changed remotely' } }) } });
  let reset;
  deps.db.googleCalendarConnection.updateMany = async query => { reset = query; return { count: 1 }; };
  await assert.rejects(service.syncOperationalEventToGoogle(event(), deps), e => e.code === 'GOOGLE_CALENDAR_CONFLICT');
  assert.equal(reset?.where.id, 'connection-1');
  assert.equal(reset?.data.syncToken, null);
});

test('a persisted pending creation cannot be discarded from reconciliation', async () => {
  let query; let locked = false;
  await service.dismissOperationalEventReconciliation('pending', {
    operationalEvent: { updateMany: async input => { query = input; return { count: 0 }; } }
  }, async task => { locked = true; return task(); });
  assert.equal(locked, true);
  assert.equal(query.where.requestId, null);
  assert.ok(query.where.OR.some(item => item.googleSyncStatus?.notIn?.includes('PENDING')));
});

test('editing an event preserves RSVP decisions for existing guests', () => {
  const payload = service.buildGoogleEventPayload({ ...event(), attendeeEmails: ['accepted@example.com', 'new@example.com'],
    attendeeResponses: { 'accepted@example.com': 'accepted' } }, { operation: 'patch' });
  assert.deepEqual(payload.attendees, [{ email: 'accepted@example.com', responseStatus: 'accepted' }, { email: 'new@example.com' }]);
});

test('HTTP conflict status takes precedence over a transport-library error code', () => {
  assert.equal(service.classifyGoogleCalendarSyncError({ code: 'ERR_BAD_RESPONSE', response: { status: 412 } }), 'GOOGLE_CALENDAR_CONFLICT');
  assert.equal(service.classifyGoogleCalendarSyncError({ code: '412' }), 'GOOGLE_CALENDAR_CONFLICT');
});

test('the API rejects ambiguous dates that JavaScript otherwise silently assigns to 2001', () => {
  assert.throws(() => service.normalizeOperationalEventRange({ startAt: '11 sep, 08:00', endAt: '11 sep, 09:00' }), e => e.code === 'INVALID_EVENT_RANGE');
  assert.throws(() => service.normalizeOperationalEventRange({ startAt: '2026-09-11T08:00:00', endAt: '2026-09-11T09:00:00' }), e => e.code === 'INVALID_EVENT_RANGE');
});

test('the API rejects impossible dates instead of silently rolling them into another month', () => {
  assert.throws(() => service.normalizeOperationalEventRange({ startAt: '2026-02-31T08:00:00-05:00', endAt: '2026-02-31T09:00:00-05:00' }), e => e.code === 'INVALID_EVENT_RANGE');
});
