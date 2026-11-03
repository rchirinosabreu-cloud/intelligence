import test from 'node:test';
import assert from 'node:assert/strict';
import * as league from '../src/lib/platformLeague.js';

test('podium keeps every tied member and uses competition ranks, never alphabetical winners', () => {
  assert.equal(typeof league.leaguePodiumGroups, 'function');
  const lanes = [15, 15, 10, 10, 10, 0].map((score, i) => ({ id: String(i), name: String(i), score }));
  const groups = league.leaguePodiumGroups(lanes);
  assert.deepEqual(groups.map(group => ({ rank: group.rank, ids: group.people.map(p => p.id) })), [
    { rank: 1, ids: ['0', '1'] }, { rank: 3, ids: ['2', '3', '4'] }
  ]);
  assert.deepEqual(league.leaguePodiumGroups(lanes.map(p => ({ ...p, score: 0 }))), []);
  assert.deepEqual(league.leaguePodiumGroups(lanes.map(p => ({ ...p, score: 5 })))[0].people.length, 6);
  assert.deepEqual(league.leaguePodiumGroups([20, 15, 10, 5].map((score, i) => ({ name: String(i), score }))).map(g => g.rank), [1, 2, 3]);
});
