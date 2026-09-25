import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFindingCleanupFilter, runFindingCleanup } from '../scripts/archive-open-review-findings.js';

test('the cleanup only touches what is merely open, never a decision someone took', () => {
  const where = buildFindingCleanupFilter();
  assert.equal(where.status, 'OPEN');
  // VERIFYING (alguien pidió comprobarlo), DISMISSED (alguien lo descartó) y
  // RESOLVED (se comprobó) no entran: no son ruido, son decisiones.
  assert.equal(JSON.stringify(where).includes('VERIFYING'), false);
  assert.equal(JSON.stringify(where).includes('DISMISSED'), false);
});

const fakeDb = (count) => {
  const calls = [];
  return {
    calls,
    contentPlanReviewFinding: {
      count: async (args) => { calls.push(['count', args]); return count; },
      updateMany: async (args) => { calls.push(['update', args]); return { count }; }
    }
  };
};

test('the report changes nothing and says how many would be archived', async () => {
  const db = fakeDb(1104);
  const result = await runFindingCleanup({ db, apply: false, logger: { log() {} } });
  assert.deepEqual(result, { found: 1104, archived: 0 });
  assert.deepEqual(db.calls.map(([kind]) => kind), ['count']);
});

test('archiving marks them stale with a reason, without an actor and without deleting anything', async () => {
  const db = fakeDb(1104);
  const now = new Date('2026-09-25T12:00:00.000Z');
  const result = await runFindingCleanup({ db, apply: true, now, logger: { log() {} } });
  assert.deepEqual(result, { found: 1104, archived: 1104 });
  const [, update] = db.calls.find(([kind]) => kind === 'update');
  assert.equal(update.data.status, 'STALE');
  assert.match(update.data.actionReason, /limpieza/i);
  assert.equal(update.data.lastActionById, null, 'no fue la decisión de una persona');
  assert.equal(update.data.lastActionAt, now);
  assert.equal('delete' in db.contentPlanReviewFinding, false, 'nada se borra');
});

test('with nothing to archive it says so and does not write', async () => {
  const db = fakeDb(0);
  assert.deepEqual(await runFindingCleanup({ db, apply: true, logger: { log() {} } }), { found: 0, archived: 0 });
  assert.equal(db.calls.some(([kind]) => kind === 'update'), false);
});
