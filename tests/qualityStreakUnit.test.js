import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateSystemStreak, getQualityStreak, recordQualityStreakTransition } from '../src/services/qualityStreakService.js';

function database(row = null) {
  let returned = 0;
  const tx = {
    systemStreak: {
      findUnique: async () => row,
      create: async ({ data }) => (row = { ...data }),
      update: async ({ data }) => (row = { ...row, ...data }),
    },
    task: { count: async () => returned },
    $executeRaw: async () => 1,
  };
  const db = { ...tx, $transaction: async work => work(tx) };
  return { db, tx, row: () => row, returned: count => { returned = count; } };
}
const at = value => new Date(value);

test('first observed empty system starts at zero without retrospective days', async () => {
  const state = database();
  assert.equal((await getOrCreateSystemStreak(state.db)).id, 'global');
  const result = await getQualityStreak(state.db, at('2026-09-14T15:00:00Z'));
  assert.deepEqual(result, { currentStreak: 0, currentStreakDays: 0, maxStreak: 0, currentReturnedTasksCount: 0 });
});

test('daily reads count each complete clean day once, including consecutive polls', async () => {
  const state = database();
  await getQualityStreak(state.db, at('2026-09-14T15:00:00Z'));
  for (const [time, days] of [['2026-09-15T05:00:00Z', 0], ['2026-09-16T05:00:00Z', 1], ['2026-09-17T05:00:00Z', 2]]) {
    for (let poll = 0; poll < 2; poll++) {
      const result = await getQualityStreak(state.db, at(time));
      assert.equal(result.currentStreak, days);
      assert.equal(result.maxStreak, days);
    }
  }
});

test('reintegration cannot reuse days accumulated before an open return', async () => {
  const state = database();
  await getQualityStreak(state.db, at('2026-09-10T05:00:00Z'));
  const before = { status: 'PENDIENTE' }, returned = { status: 'DEVUELTA' };
  state.returned(1);
  await recordQualityStreakTransition(state.tx, before, returned, at('2026-09-12T18:00:00Z'));
  assert.equal(state.row().highestStreak, 2);
  await getQualityStreak(state.db, at('2026-09-14T15:00:00Z'));
  state.returned(0);
  await recordQualityStreakTransition(state.tx, returned, { status: 'EN_CURSO' }, at('2026-09-14T18:00:00Z'));
  assert.equal(state.row().currentStreak, 0);
  assert.equal(state.row().cleanSinceAt.toISOString(), '2026-09-14T18:00:00.000Z');
  assert.equal((await getQualityStreak(state.db, at('2026-09-16T05:00:00Z'))).currentStreak, 1);
});

test('removing one return while another remains never starts a clean period', async () => {
  const state = database();
  state.returned(1);
  await recordQualityStreakTransition(state.tx, { status: 'DEVUELTA' }, null, at('2026-09-14T18:00:00Z'));
  const result = await getQualityStreak(state.db, at('2026-09-20T18:00:00Z'));
  assert.equal(result.currentReturnedTasksCount, 1);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.maxStreak, 0);
  assert.equal(state.row().cleanSinceAt, null);
});

test('unrelated edits and ordinary deletions preserve the current clean period', async () => {
  const state = database();
  await getQualityStreak(state.db, at('2026-09-10T05:00:00Z'));
  const original = state.row().cleanSinceAt.toISOString();
  await recordQualityStreakTransition(state.tx, { status: 'PENDIENTE' }, null, at('2026-09-14T18:00:00Z'));
  await recordQualityStreakTransition(state.tx, { status: 'DEVUELTA' }, { status: 'DEVUELTA' }, at('2026-09-14T18:00:00Z'));
  assert.equal(state.row().cleanSinceAt.toISOString(), original);
});

test('quality endpoint logs and propagates persistence failures instead of returning a stale streak', async t => {
  const state = database();
  const errors = t.mock.method(console, 'error', () => {});
  state.tx.task.count = async () => { throw new Error('unavailable'); };
  await assert.rejects(getQualityStreak(state.db), /unavailable/);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0].arguments[1].message, 'unavailable');
});
