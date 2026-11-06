import test from 'node:test';
import assert from 'node:assert/strict';
import * as order from '../src/lib/taskOrder.js';
import { projectTaskParticipations, taskCardKey } from '../src/lib/taskParticipationBoard.js';

const sorted = rows => {
  assert.equal(typeof order.compareTaskBoardOrder, 'function');
  return [...rows].sort(order.compareTaskBoardOrder);
};

test('Realizado puts the newest personal or individual completion first, regardless of manual priority', () => {
  const shared = projectTaskParticipations([{ id: 'shared', status: 'EN_CURSO', sharedProgress: true, sortOrder: 0,
    completedAt: null, participants: [
      { memberId: 'ana', status: 'REALIZADA', completedAt: '2026-11-05T18:00:00Z' },
      { memberId: 'bea', status: 'REALIZADA', completedAt: '2026-11-03T18:00:00Z' },
      { memberId: 'carlos', status: 'PENDIENTE', completedAt: null }
    ] }]);
  const individual = { id: 'individual', status: 'REALIZADA', sortOrder: -20, completedAt: '2026-11-04T18:00:00Z' };
  const rows = sorted([individual, ...shared]);
  assert.deepEqual(rows.filter(row => row.status === 'REALIZADA').map(taskCardKey), [shared[0].boardKey, 'individual', shared[1].boardKey]);
  assert.equal(rows.find(row => row.participation?.memberId === 'carlos').status, 'PENDIENTE');
});

test('a missing personal completion never borrows the global date; unknown dates go last with stable ties', () => {
  const rows = [
    { id: 'unknown', boardKey: 'unknown:ana', status: 'REALIZADA', completedAt: '2030-01-01', participation: { memberId: 'ana', completedAt: null } },
    { id: 'invalid', status: 'REALIZADA', completedAt: 'not-a-date' },
    { id: 'b', status: 'REALIZADA', completedAt: '2026-11-05T18:00:00Z', sortOrder: 0 },
    { id: 'a', status: 'REALIZADA', completedAt: '2026-11-05T18:00:00Z', sortOrder: 99 }
  ];
  assert.deepEqual(sorted(rows).map(taskCardKey), ['a', 'b', 'invalid', 'unknown:ana']);
  assert.deepEqual(sorted([...rows].reverse()).map(taskCardKey), ['a', 'b', 'invalid', 'unknown:ana']);
});

test('open and reopened cards preserve the existing manual queue order', () => {
  const rows = [
    { id: 'first', status: 'PENDIENTE', sortOrder: 0, dueDate: '2026-11-09' },
    { id: 'working', status: 'EN_CURSO', sortOrder: 1 },
    { id: 'reopened', status: 'PENDIENTE', sortOrder: 8, completedAt: null },
    { id: 'returned', status: 'DEVUELTA', sortOrder: 3 }
  ];
  assert.deepEqual(sorted([...rows].reverse()), [...rows].sort(order.compareTaskOrder));
  assert.equal(rows[2].completedAt, null);
});
