import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { processSystemStreakDailyIncrement, resetSystemStreak } = await import('../src/services/nativeTaskService.js');

function database(overrides = {}, returned = 0) {
  let row = { id: 'global', currentStreak: 3, highestStreak: 10,
    lastResetAt: new Date('2026-09-10T15:00:00Z'), lastIncrementedAt: new Date('2026-09-14T15:00:00Z'),
    trackingStartedAt: new Date('2026-09-10T15:00:00Z'), cleanSinceAt: new Date('2026-09-10T15:00:00Z'), ...overrides };
  const db = {
    systemStreak: {
      findUnique: async () => row,
      create: async ({ data }) => (row = { ...data }),
      update: async ({ data }) => (row = { ...row, ...data }),
    },
    task: { count: async () => returned },
    $executeRaw: async () => 1,
    $transaction: async work => work(db),
  };
  return { db, row: () => row, returned: value => { returned = value; } };
}

function freeze(t, instant) { t.mock.timers.enable({ apis: ['Date'], now: new Date(instant) }); }

test('an open return resets the persisted streak, not only the visible number', async t => {
  freeze(t, '2026-09-14T18:00:00Z');
  const state = database({}, 1);
  await processSystemStreakDailyIncrement(state.db);
  assert.equal(state.row().currentStreak, 0);
  assert.equal(state.row().cleanSinceAt, null);
  assert.equal(state.row().highestStreak, 10);
});

test('deleting the last returned task cannot resurrect three hidden days', async t => {
  freeze(t, '2026-09-14T18:00:00Z');
  const state = database({}, 1);
  await processSystemStreakDailyIncrement(state.db);
  state.returned(0);
  await processSystemStreakDailyIncrement(state.db);
  assert.equal(state.row().currentStreak, 0);
  assert.equal(state.row().cleanSinceAt.toISOString(), '2026-09-14T18:00:00.000Z');
});

test('legacy accumulated days are not treated as verified clean days', async t => {
  freeze(t, '2026-09-14T18:00:00Z');
  const state = database({ trackingStartedAt: null, cleanSinceAt: null });
  await processSystemStreakDailyIncrement(state.db);
  assert.equal(state.row().currentStreak, 0);
  assert.equal(state.row().highestStreak, 10);
  assert.equal(state.row().trackingStartedAt.toISOString(), '2026-09-14T18:00:00.000Z');
});

for (const [instant, expected] of [
  ['2026-09-14T23:59:59Z', 0],
  ['2026-09-15T05:00:00Z', 0],
  ['2026-09-16T04:59:59Z', 0],
  ['2026-09-16T05:00:00Z', 1],
  ['2026-09-18T05:00:00Z', 3],
]) {
  test(`counts completed clean Bogota days at ${instant}: ${expected}`, async t => {
    freeze(t, instant);
    const state = database({ currentStreak: 0, cleanSinceAt: new Date('2026-09-14T18:00:00Z'), lastIncrementedAt: new Date('2026-09-14T18:00:00Z') });
    await processSystemStreakDailyIncrement(state.db);
    assert.equal(state.row().currentStreak, expected);
    await processSystemStreakDailyIncrement(state.db);
    assert.equal(state.row().currentStreak, expected, 'repeated reads must not double count days');
  });
}

test('a full day starting at Bogota midnight earns one day at the next midnight', async t => {
  freeze(t, '2026-09-15T05:00:00Z');
  const state = database({ currentStreak: 0, cleanSinceAt: new Date('2026-09-14T05:00:00Z') });
  await processSystemStreakDailyIncrement(state.db);
  assert.equal(state.row().currentStreak, 1);
});

test('a return breaks the clean period and keeps the previous historical record', async t => {
  freeze(t, '2026-09-14T18:00:00Z');
  const state = database();
  await resetSystemStreak(state.db);
  assert.equal(state.row().currentStreak, 0);
  assert.equal(state.row().cleanSinceAt, null);
  assert.equal(state.row().highestStreak, 10);
});

test('failed streak persistence must abort the task transaction', async () => {
  const state = database();
  state.db.systemStreak.update = async () => { throw new Error('persistence failed'); };
  await assert.rejects(resetSystemStreak(state.db), /persistence failed/);
});

test('a failed returned-task query cannot be presented as a successful clean period', async () => {
  const state = database();
  state.db.task.count = async () => { throw new Error('task query failed'); };
  await assert.rejects(processSystemStreakDailyIncrement(state.db), /task query failed/);
});
