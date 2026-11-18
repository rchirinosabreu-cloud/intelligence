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
