import test from 'node:test';
import assert from 'node:assert/strict';
import { validRecipientResource } from '../src/services/recognitionService.js';

const tx = {
  task: { findFirst: async () => { throw new Error('no debía buscar una tarea'); } },
  contentPlan: { findFirst: async ({ where }) => { if (where.id == null) throw new Error('Argument `id` must not be null.'); return { id: where.id }; } }
};

test('«Al día» sin tarea ni parrilla se valida por la persona y no consulta parrillas con id nulo', async () => {
  assert.equal(await validRecipientResource(tx, { kind: 'CAUGHT_UP', taskId: null, planId: null, recipientId: 'u1' }, 'u1'), true);
  assert.equal(await validRecipientResource(tx, { kind: 'CAUGHT_UP', taskId: null, planId: null, recipientId: 'u2' }, 'u1'), false);
});

test('una insignia de parrilla sigue validándose contra su parrilla', async () => {
  assert.deepEqual(await validRecipientResource(tx, { kind: 'PLAN_APPROVED', taskId: null, planId: 'p1', recipientId: 'u1' }, 'u1'), { id: 'p1' });
});

test('«Al día» se muestra en la última tarea que la persona cerró ese día en Logros hoy', async () => {
  const { attachTaskRecognitions } = await import('../src/services/recognitionService.js');
  const recipient = { id: 'u1', name: 'Melissa' };
  const calls = [];
  const db = { recognitionAward: { findMany: async (query) => {
    calls.push(query.where);
    if (query.where.taskId?.in) return [];
    return [{ id: 'a1', kind: 'CAUGHT_UP', taskId: null, planId: null, recipientId: 'u1', dayKey: '2026-11-23', occurredAt: new Date('2026-11-23T22:14:00Z'), recipient }];
  } } };
  const tasks = [
    { id: 't1', completedAt: '2026-11-23T15:00:00Z', assignee: { userId: 'u1' } },
    { id: 't2', completedAt: '2026-11-23T20:30:00Z', assignee: { userId: 'u1' } },
    { id: 't3', completedAt: '2026-11-23T21:00:00Z', assignee: { userId: 'u2' } },
  ];
  const result = await attachTaskRecognitions(db, tasks);
  assert.deepEqual(result.map(task => task.recognitions.map(item => `${item.kind}:${item.taskId}`)), [[], ['CAUGHT_UP:t2'], []]);
  assert.equal(calls[1].kind, 'CAUGHT_UP');
  assert.deepEqual(calls[1].dayKey.in, ['2026-11-23']);
});

// Rodny, 25 de noviembre de 2026: una pieza que vuelve con ajustes y se cierra otro día es trabajo de ese día.
const onFireTx = ({ firstToday, reclosedBefore, state }) => {
  const created = [];
  return { created, tx: {
    user: { findUnique: async () => ({ isActive: true }) },
    task: { findMany: async () => reclosedBefore.map(id => ({ id })) },
    recognitionTaskState: {
      update: async () => ({}),
      count: async ({ where }) => {
        if (where.taskId) return where.taskId.in.length;
        if (where.weekKey) return 20;
        if (where.recipientId) return firstToday;
        return 5;
      },
    },
    recognitionAward: { createMany: async ({ data }) => { created.push(...data); return { count: data.length }; }, findMany: async () => [] },
    operationalTraceEvent: { create: async () => ({}) },
  }, before: { task: { id: 't-now', status: 'EN_CURSO', assigneeId: 'm1', assignee: { id: 'm1', userId: 'u1', isActive: true } }, state } };
};
const closedNow = { id: 't-now', status: 'REALIZADA', assigneeId: 'm1', dueDate: null };
const at = new Date('2026-11-25T21:00:00Z');

test('«On fire» cuenta una tarea reabierta y vuelta a cerrar en un día distinto al de su primer cierre', async () => {
  const { finishTaskRecognition } = await import('../src/services/recognitionService.js');
  const run = onFireTx({ firstToday: 5, reclosedBefore: ['a', 'b'], state: { taskId: 't-now', firstCompletedAt: new Date('2026-11-20T15:00:00Z'), dayKey: '2026-11-20', originalDueDate: null } });
  await finishTaskRecognition(run.tx, run.before, closedNow, at);
  assert.deepEqual(run.created.map(item => [item.kind, item.taskId, item.dedupeKey]), [['DAILY_EIGHT', 't-now', 'v1:DAILY_EIGHT:u1:2026-11-25']]);
});

test('recerrar el mismo día del primer cierre no suma, y un recierre solo puede dar «On fire»', async () => {
  const { finishTaskRecognition } = await import('../src/services/recognitionService.js');
  const sameDay = onFireTx({ firstToday: 8, reclosedBefore: [], state: { taskId: 't-now', firstCompletedAt: new Date('2026-11-25T15:00:00Z'), dayKey: '2026-11-25', originalDueDate: null } });
  await finishTaskRecognition(sameDay.tx, sameDay.before, closedNow, at);
  assert.equal(sameDay.created.length, 0);
  const notEight = onFireTx({ firstToday: 3, reclosedBefore: [], state: { taskId: 't-now', firstCompletedAt: new Date('2026-11-20T15:00:00Z'), dayKey: '2026-11-20', originalDueDate: null } });
  await finishTaskRecognition(notEight.tx, notEight.before, closedNow, at);
  assert.equal(notEight.created.length, 0);
});

test('un primer cierre también suma los recierres del día para llegar a ocho', async () => {
  const { finishTaskRecognition } = await import('../src/services/recognitionService.js');
  const run = onFireTx({ firstToday: 5, reclosedBefore: ['a', 'b', 'c'], state: { taskId: 't-now', firstCompletedAt: null, dayKey: null, originalDueDate: null } });
  await finishTaskRecognition(run.tx, run.before, closedNow, at);
  assert.deepEqual(run.created.map(item => item.kind), ['DAILY_EIGHT']);
});
