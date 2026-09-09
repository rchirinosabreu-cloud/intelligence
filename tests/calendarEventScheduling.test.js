import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/services/operationalEventService.js';

const now = new Date('2026-09-07T16:00:00Z');
const schedule = (startAt, isAllDay = false) => ({ startAt, endAt: new Date(new Date(startAt).getTime() + (isAllDay ? 86400000 : 3600000)), isAllDay });
const input = { title: 'Reunión', type: 'MEETING', requestId: 'schedule-request-1', googleConnectionId: 'selected', ...schedule('2026-09-08T14:00:00Z') };

test('new API requests cannot create past events, including an explicitly supplied year 2001', async () => {
  for (const startAt of ['2001-09-11T13:00:00Z', '2026-09-07T15:59:59Z']) {
    await assert.rejects(service.createOperationalEvent({ ...input, ...schedule(startAt) }, 'actor', {
      lock: task => task(), now: () => now,
      db: { operationalEvent: { findUnique: async () => null, create: async () => assert.fail('must not persist a past event') } },
      authorize: async () => assert.fail('must reject before contacting Google')
    }), error => error.code === 'INVALID_EVENT_PAST' && error.message === 'No puedes elegir una fecha y hora que ya pasó');
  }
});

test('the scheduling guard compares absolute instants and accepts now or a future start', () => {
  assert.equal(typeof service.validateOperationalEventSchedule, 'function');
  assert.doesNotThrow(() => service.validateOperationalEventSchedule(schedule('2026-09-07T11:00:00-05:00'), null, now));
  assert.doesNotThrow(() => service.validateOperationalEventSchedule(schedule('2026-09-08T14:00:00Z'), null, now));
  assert.throws(() => service.validateOperationalEventSchedule(schedule('2026-09-07T10:59:59-05:00'), null, now), error => error.code === 'INVALID_EVENT_PAST');
});

test('all-day creation allows today in Bogota but rejects earlier days, even across UTC midnight', () => {
  const lateBogota = new Date('2026-09-08T02:00:00Z');
  assert.doesNotThrow(() => service.validateOperationalEventSchedule(schedule('2026-09-07T05:00:00Z', true), null, lateBogota));
  assert.throws(() => service.validateOperationalEventSchedule(schedule('2026-09-06T05:00:00Z', true), null, lateBogota), error => error.code === 'INVALID_EVENT_PAST');
  assert.doesNotThrow(() => service.validateOperationalEventSchedule(schedule('2027-01-01T05:00:00Z', true), null, new Date('2026-12-31T15:00:00Z')));
  assert.throws(() => service.validateOperationalEventSchedule(schedule('2026-12-31T05:00:00Z', true), null, new Date('2027-01-01T15:00:00Z')), error => error.code === 'INVALID_EVENT_PAST');
});

test('historical text edits keep their original start but rescheduling into the past is rejected', () => {
  const historical = schedule('2026-09-04T14:00:00Z');
  assert.doesNotThrow(() => service.validateOperationalEventSchedule({ title: 'Updated' }, historical, now));
  assert.doesNotThrow(() => service.validateOperationalEventSchedule({ startAt: '2026-09-04T09:00:00-05:00' }, historical, now));
  assert.throws(() => service.validateOperationalEventSchedule(schedule('2026-09-05T14:00:00Z'), historical, now), error => error.code === 'INVALID_EVENT_PAST');
  assert.throws(() => service.validateOperationalEventSchedule({ isAllDay: true }, historical, now), error => error.code === 'INVALID_EVENT_PAST');
  assert.doesNotThrow(() => service.validateOperationalEventSchedule(schedule('2026-09-08T14:00:00Z'), historical, now));
});

test('a repeated confirmed request still returns its existing event after the start has passed', async () => {
  const identity = service.getOperationalEventRequestIdentity(input, 'actor');
  const existing = { id: 'existing', ...input, ...identity, createdById: 'actor', googleSyncStatus: 'SYNCED' };
  const result = await service.createOperationalEvent(input, 'actor', {
    lock: task => task(), now: () => new Date('2026-09-09T00:00:00Z'),
    db: { operationalEvent: { findUnique: async () => existing } },
    authorize: async () => assert.fail('must reuse the confirmed request')
  });
  assert.equal(result.id, existing.id);
});

test('new creation rechecks the start after authorization before persisting its intent', async () => {
  let currentTime = new Date('2026-09-08T13:59:59Z');
  await assert.rejects(service.createOperationalEvent(input, 'actor', {
    lock: task => task(), now: () => currentTime,
    resolveCreationTarget: async () => ({ calendarId: 'primary' }),
    db: { operationalEvent: { findUnique: async () => null, create: async () => assert.fail('must not persist a start that elapsed') } },
    authorize: async () => { currentTime = new Date('2026-09-08T14:00:01Z'); return { connection: { id: 'selected' } }; }
  }), error => error.code === 'INVALID_EVENT_PAST');
});

test('historical reconciliation cannot publish a new Google event in the past', async () => {
  const result = await service.reconcilePendingOperationalEvents({ eventIds: ['legacy'], connectionId: 'selected' }, {
    withLock: task => task(), now: () => now,
    authorize: async () => ({ connection: { id: 'selected', calendarId: 'original-calendar' } }),
    prismaClient: { operationalEvent: { findMany: async () => [{ id: 'legacy', ...schedule('2001-09-11T13:00:00Z') }], update: async () => assert.fail('must not enqueue a historical publication') } },
    syncToGoogle: async () => assert.fail('must not publish'), logger: { error() {} }
  });
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].error, 'No puedes elegir una fecha y hora que ya pasó');
});

test('explicit reconciliation pins the calendar before its first external write', async () => {
  const result = await service.reconcilePendingOperationalEvents({ eventIds: ['legacy'], connectionId: 'selected' }, {
    withLock: task => task(), now: () => now,
    authorize: async () => ({ connection: { id: 'selected', calendarId: 'original-calendar' } }),
    prismaClient: { operationalEvent: { findMany: async () => [{ id: 'legacy', ...input }], update: async ({ data }) => ({ id: 'legacy', ...input, ...data }) } },
    syncToGoogle: async event => { assert.equal(event.googleCalendarId, 'original-calendar'); assert.equal(event.requestId, 'legacy-reconcile-legacy'); return { ...event, googleSyncStatus: 'SYNCED' }; }, logger: { error() {} }
  });
  assert.equal(result.synced, 1);
});
