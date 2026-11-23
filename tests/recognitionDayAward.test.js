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
