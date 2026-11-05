import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConfirmedTaskMove, projectTaskMove } from '../src/lib/taskMoveConfirmation.js';

test('pending movement projects only position, never status, dates, clocks or cache', () => {
  const moving = { id: 'a', status: 'EN_CURSO', completedAt: null, startedAt: '2026-11-05T12:00:00Z', sortOrder: 8, openSessions: [{ id: 'clock' }] };
  const other = { id: 'b', status: 'REALIZADA', title: 'Cambio recibido mientras guardaba' };
  const rows = [moving, other];
  const projected = projectTaskMove(rows, { taskId: 'a', columnId: 'REALIZADA', index: 1 }, task => task.status);
  assert.deepEqual(projected.map(row => row.id), ['b', 'a']);
  assert.equal(projected[1].pendingColumnId, 'REALIZADA');
  for (const key of Object.keys(moving)) assert.deepEqual(projected[1][key], moving[key]);
  assert.equal(projected[0], other);
  assert.equal(Object.hasOwn(moving, 'pendingColumnId'), false);
  assert.equal(projectTaskMove(rows, null, task => task.status), rows, 'rollback keeps current server data, including other updates');
});

test('pending movement respects destination index and does not resurrect missing cards', () => {
  const rows = [{ id: 'a', status: 'PENDIENTE' }, { id: 'b', status: 'EN_CURSO' }, { id: 'c', status: 'EN_CURSO' }];
  assert.deepEqual(projectTaskMove(rows, { taskId: 'a', columnId: 'EN_CURSO', index: 1 }, task => task.status).map(row => row.id), ['b', 'a', 'c']);
  assert.deepEqual(projectTaskMove(rows, { taskId: 'c', columnId: 'EN_CURSO', index: 0 }, task => task.status).map(row => row.id), ['a', 'c', 'b']);
  assert.equal(projectTaskMove(rows, { taskId: 'missing', columnId: 'EN_CURSO', index: 0 }, task => task.status), rows);
});

test('a confirmed move preserves board relations and uses server dates and order', () => {
  const row = { id: 'a', status: 'EN_CURSO', title: 'Trabajo', sortOrder: 0, completedAt: null,
    collaborators: [{ id: 'member', name: 'Ana' }], openSessions: [{ memberId: 'member' }],
    assigneeName: 'Leo', clientName: 'Faro', plan: { id: 'plan' }, taskAttachments: [{ id: 'file' }] };
  const untouched = { id: 'b', status: 'PENDIENTE' };
  const saved = { id: 'a', status: 'REALIZADA', sortOrder: 7, completedAt: '2026-11-05T16:01:02Z',
    startedAt: null, accumulatedWorkMs: 71000, isReturned: false,
    collaborators: [{ memberId: 'member', member: { name: 'Ana' } }] };
  const result = applyConfirmedTaskMove([row, untouched], saved);
  assert.equal(result[0].status, 'REALIZADA');
  assert.equal(result[0].sortOrder, 7);
  assert.equal(result[0].completedAt, saved.completedAt);
  assert.equal(result[0].startedAt, null);
  assert.equal(result[0].accumulatedWorkMs, 71000);
  assert.deepEqual(result[0].openSessions, []);
  for (const key of ['title', 'collaborators', 'assigneeName', 'clientName', 'plan', 'taskAttachments']) assert.deepEqual(result[0][key], row[key]);
  assert.equal(result[1], untouched);
  assert.equal(row.status, 'EN_CURSO');
});

test('a confirmed start does not invent dates, working sessions or missing fields', () => {
  const row = { id: 'a', status: 'PENDIENTE', completedAt: null, sortOrder: 3, openSessions: [] };
  const [saved] = applyConfirmedTaskMove([row], { id: 'a', status: 'EN_CURSO', startedAt: null });
  assert.equal(saved.status, 'EN_CURSO');
  assert.equal(saved.startedAt, null);
  assert.equal(saved.sortOrder, 3);
  assert.deepEqual(saved.openSessions, []);
  assert.equal(applyConfirmedTaskMove(undefined, { id: 'a', status: 'EN_CURSO' }), undefined);
});

test('a confirmed pause clears running sessions, without rewriting other cards', () => {
  const [saved] = applyConfirmedTaskMove([{ id: 'a', status: 'EN_CURSO', openSessions: [{ id: 'session' }] }], { id: 'a', status: 'PENDIENTE', startedAt: null });
  assert.deepEqual(saved.openSessions, []);
  assert.equal(saved.status, 'PENDIENTE');
});
