import test from 'node:test';
import assert from 'node:assert/strict';
import * as league from '../src/lib/platformLeague.js';

test('podium keeps every tied member and ranks by distinct score (1, 1, 2), never alphabetical winners', () => {
  assert.equal(typeof league.leaguePodiumGroups, 'function');
  const lanes = [15, 15, 10, 10, 10, 0].map((score, i) => ({ id: String(i), name: String(i), score }));
  const groups = league.leaguePodiumGroups(lanes);
  assert.deepEqual(groups.map(group => ({ rank: group.rank, ids: group.people.map(p => p.id) })), [
    { rank: 1, ids: ['0', '1'] }, { rank: 2, ids: ['2', '3', '4'] }
  ]);
  // Cuatro primeros empatados siguen teniendo segundo y tercero (Rodny, 9 de noviembre de 2026).
  assert.deepEqual(league.leaguePodiumGroups([25, 25, 25, 25, 20, 15, 15, 10].map((score, i) => ({ id: String(i), name: String(i), score }))).map(g => [g.rank, g.people.length]), [[1, 4], [2, 1], [3, 2]]);
  assert.equal(league.leagueRank(10, [25, 25, 25, 25, 20, 15, 15, 10].map(score => ({ score }))), 4);
  assert.deepEqual(league.leaguePodiumGroups(lanes.map(p => ({ ...p, score: 0 }))), []);
  assert.deepEqual(league.leaguePodiumGroups(lanes.map(p => ({ ...p, score: 5 })))[0].people.length, 6);
  assert.deepEqual(league.leaguePodiumGroups([20, 15, 10, 5].map((score, i) => ({ name: String(i), score }))).map(g => g.rank), [1, 2, 3]);
});
