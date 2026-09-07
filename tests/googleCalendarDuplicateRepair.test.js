import test from 'node:test';
import assert from 'node:assert/strict';

const service = await import('../src/services/calendarDuplicateRepair.js').catch(() => ({}));
const row = (id, connectionId, extra = {}) => ({
  id, source: 'GOOGLE', title: 'Private event', description: 'Keep original text', type: 'MEETING',
  startAt: new Date('2026-09-11T14:00:00Z'), endAt: new Date('2026-09-11T15:00:00Z'),
  recurrence: 'NONE', googleRecurrence: [], recurrenceEnd: null, googleRecurringEventId: null,
  googleOriginalStartAt: null, googleTimeZone: 'America/Bogota', isAllDay: false,
  googleSyncStatus: 'SYNCED', googleSyncError: null, googleCancelled: false, requestId: null,
  googleEventId: 'same-google-id', googleICalUID: 'same-uid', googleConnectionId: connectionId,
  googleCalendarId: 'primary', googleEtag: `etag-${connectionId}`, attendeeEmails: [], memberIds: [],
  createdAt: new Date('2026-09-07T16:45:29Z'), updatedAt: new Date('2026-09-07T20:00:00Z'),
  googleLinks: [{ id: `link-${id}`, operationalEventId: id, connectionId, calendarId: 'primary',
    googleEventId: 'same-google-id', googleICalUID: 'same-uid', googleEtag: `etag-${connectionId}`,
    isOrganizer: connectionId === 'owner', createdAt: new Date('2026-09-07T16:45:29Z'), updatedAt: new Date('2026-09-07T20:00:00Z') }],
  ...extra
});
const pair = () => [row('a-guest', 'guest'), row('b-owner', 'owner')];
function plan(events = pair()) {
  assert.equal(typeof service.planCalendarDuplicateRepair, 'function');
  return service.planCalendarDuplicateRepair(events);
}
function persistence(events = pair()) {
  const state = { events: structuredClone(events).map(({ googleLinks, ...event }) => event), links: structuredClone(events.flatMap(event => event.googleLinks)), txOptions: null, failMove: false };
  const matches = (value, where) => Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && 'in' in expected) return expected.in.includes(value[key]);
    if (expected instanceof Date) return new Date(value[key]).getTime() === expected.getTime();
    return value[key] === expected;
  });
  const db = {
    operationalEvent: {
      findMany: async ({ where } = {}) => state.events.filter(event => !where || matches(event, where)).map(event => ({ ...event, googleLinks: state.links.filter(link => link.operationalEventId === event.id) })),
      updateMany: async ({ where, data }) => { const selected = state.events.filter(event => matches(event, where)); selected.forEach(event => Object.assign(event, data, { updatedAt: new Date('2026-09-07T21:00:00Z') })); return { count: selected.length }; }
    },
    googleCalendarEventLink: { updateMany: async ({ where, data }) => {
      if (state.failMove) throw new Error('link failure');
      const selected = state.links.filter(link => matches(link, where)); selected.forEach(link => Object.assign(link, data)); return { count: selected.length };
    } },
    $transaction: async (callback, options) => {
      state.txOptions = options;
      const snapshot = structuredClone({ events: state.events, links: state.links });
      try { return await callback(db); } catch (error) { Object.assign(state, snapshot); throw error; }
    }
  };
  return { db, state, options: { db, lock: async task => task() } };
}

test('duplicate repair plans one canonical organizer without exposing event content', () => {
  const result = plan();
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].canonicalId, 'b-owner');
  assert.deepEqual(result.groups[0].duplicateIds, ['a-guest']);
  assert.equal(result.groups[0].linkMoves.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /Private event|Keep original text|same-uid/);
  assert.equal(result.groups[0].fingerprint, plan(pair().reverse()).groups[0].fingerprint);
});

for (const [name, change] of [
  ['different recurrence', { recurrence: 'GOOGLE', googleRecurrence: ['RRULE:FREQ=WEEKLY'] }],
  ['same UID but different Google event ID', { googleEventId: 'another-instance' }],
  ['different content', { description: 'Different content' }],
  ['different original instance date', { googleOriginalStartAt: new Date('2026-09-10T14:00Z') }],
  ['pending write', { googleSyncStatus: 'PENDING' }],
  ['error write', { googleSyncStatus: 'ERROR' }],
  ['new idempotent request', { requestId: 'new-request' }],
  ['Brain provenance', { source: 'BRAIN' }],
  ['already cancelled', { googleCancelled: true }],
  ['different author', { createdById: 'other-user' }]
]) {
  test(`duplicate repair rejects ${name}`, () => {
    const result = plan([pair()[0], { ...pair()[1], ...change }]);
    assert.equal(result.groups.length, 0);
    assert.equal(result.rejected.length, 1);
  });
}

test('apply moves every link but preserves copy metadata and both original event records', async () => {
  const { state, options } = persistence();
  const before = structuredClone(state);
  const result = await service.applyCalendarDuplicateRepair(plan(), options);
  assert.equal(result.mergedCount, 1);
  assert.equal(state.events.length, 2);
  const tombstone = state.events.find(event => event.id === 'a-guest');
  assert.equal(tombstone.googleSyncStatus, 'MERGED');
  assert.equal(tombstone.googleCancelled, true);
  assert.equal(tombstone.description, 'Keep original text');
  assert.deepEqual(state.links.map(link => ({ ...link, operationalEventId: undefined })), before.links.map(link => ({ ...link, operationalEventId: undefined })));
  assert.ok(state.links.every(link => link.operationalEventId === 'b-owner'));
  assert.equal(state.txOptions.isolationLevel, 'Serializable');
  assert.doesNotMatch(JSON.stringify(result), /Private event|Keep original text/);
});

test('stale plan rejects all changes before moving links or marking a tombstone', async () => {
  const expected = plan();
  const { state, options } = persistence();
  state.events[0].description = 'Concurrent edit';
  await assert.rejects(service.applyCalendarDuplicateRepair(expected, options), e => e.code === 'CALENDAR_REPAIR_STALE');
  assert.ok(state.events.every(event => event.googleSyncStatus === 'SYNCED'));
  assert.equal(state.links[0].operationalEventId, 'a-guest');
});

test('failed link update rolls the entire repair transaction back', async () => {
  const { state, options } = persistence(); state.failMove = true;
  await assert.rejects(service.applyCalendarDuplicateRepair(plan(), options), /link failure/);
  assert.ok(state.events.every(event => event.googleSyncStatus === 'SYNCED'));
  assert.equal(state.links[0].operationalEventId, 'a-guest');
});

test('receipt persistence failure prevents the database repair from committing', async () => {
  const { state, options } = persistence();
  await assert.rejects(service.applyCalendarDuplicateRepair(plan(), { ...options, persistReceipt: async () => { throw new Error('disk unavailable'); } }), /disk unavailable/);
  assert.ok(state.events.every(event => event.googleSyncStatus === 'SYNCED'));
  assert.equal(state.links[0].operationalEventId, 'a-guest');
});

test('receipt reverses only the recorded link ownership and tombstone flags', async () => {
  const { state, options } = persistence();
  const before = structuredClone({ events: state.events, links: state.links });
  const receipt = await service.applyCalendarDuplicateRepair(plan(), options);
  const reversed = await service.revertCalendarDuplicateRepair(receipt, options);
  assert.equal(reversed.restoredCount, 1);
  assert.deepEqual(state.links, before.links);
  assert.deepEqual(state.events.map(({ updatedAt, ...event }) => event), before.events.map(({ updatedAt, ...event }) => event));
});

test('reversal refuses a receipt after the canonical event changed', async () => {
  const { state, options } = persistence();
  const receipt = await service.applyCalendarDuplicateRepair(plan(), options);
  state.events.find(event => event.id === 'b-owner').title = 'A newer user edit';
  await assert.rejects(service.revertCalendarDuplicateRepair(receipt, options), e => e.code === 'CALENDAR_REPAIR_STALE');
  assert.equal(state.links[0].operationalEventId, 'b-owner');
});

test('a modified reversal receipt cannot move links outside its verified group', async () => {
  const { state, options } = persistence();
  const receipt = await service.applyCalendarDuplicateRepair(plan(), options);
  receipt.groups[0].linkMoves[0].fromEventId = 'unrelated-event';
  await assert.rejects(service.revertCalendarDuplicateRepair(receipt, options), e => e.code === 'CALENDAR_REPAIR_INVALID');
  assert.equal(state.links[0].operationalEventId, 'b-owner');
});

test('CLI defaults to dry-run and refuses apply without a reviewed plan and receipt destination', async () => {
  const cli = await import('../scripts/repair-calendar-duplicates.js').catch(() => ({}));
  assert.equal(typeof cli.parseCalendarRepairArguments, 'function');
  assert.equal(cli.parseCalendarRepairArguments([]).apply, false);
  assert.throws(() => cli.parseCalendarRepairArguments(['--apply']), /plan|receipt/);
  assert.throws(() => cli.parseCalendarRepairArguments(['--apply','--plan','plan.json']), /receipt/);
  assert.equal(cli.parseCalendarRepairArguments(['--apply','--plan','plan.json','--receipt','receipt.json']).apply, true);
});
