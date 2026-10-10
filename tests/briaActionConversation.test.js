import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const ready = { id: 'act-1', ownerId: 'owner', type: 'TASK_UPDATE', status: 'DRAFT', title: 'Cambiar la tarea «Reel»', summary: ['Estado: En proceso'], missing: [], warnings: [] };

const setup = (turns) => {
  let stored = { id: 'chat', revision: 1, turns }, writes = 0, locked = false, aiCalls = 0;
  const repository = { get: async () => stored, append: async (_a, _id, revision, question, result) => {
    if (stored.revision !== revision) throw Object.assign(new Error('Stale'), { status: 409 });
    locked = true; const reply = typeof result === 'function' ? await result() : result; locked = false;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const actions = { execute: async ({ action }) => { assert.equal(locked, true, 'runs under the conversation lock'); writes++; return { text: `Listo: ${action.title}.`, sources: [{ kind: 'tarea', id: 't1' }] }; } };
  const service = createBriaConversationService({ repository, actions, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async (request) => { aiCalls++; return { answer: 'Respuesta', sources: [], pendingActionSeen: request.pendingAction?.id || null }; } } });
  return { service, get stored() { return stored; }, get writes() { return writes; }, get aiCalls() { return aiCalls; } };
};

test('«Confirmar» runs the action of the previous answer once, under the lock', async () => {
  const fixture = setup([{ role: 'assistant', text: '¿Lo hago así?', pendingAction: ready }]);
  await fixture.service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(fixture.writes, 1);
  assert.equal(fixture.stored.turns.at(-1).pendingAction.status, 'DONE');
  assert.match(fixture.stored.turns.at(-1).answer, /Listo/);
  await fixture.service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(fixture.writes, 1, 'a done action never runs again');
});

test('an action from an older answer is never confirmed by a loose «confirmar»', async () => {
  const fixture = setup([{ role: 'assistant', text: '¿Lo hago así?', pendingAction: ready }, { role: 'user', text: 'Otra cosa' }, { role: 'assistant', text: 'Te respondo otra cosa' }]);
  await fixture.service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(fixture.writes, 0);
  assert.equal(fixture.aiCalls, 1);
});

test('cancelling discards it, and an incomplete action travels to Bria to be completed', async () => {
  const cancel = setup([{ role: 'assistant', text: '¿Lo hago así?', pendingAction: ready }]);
  await cancel.service.send({ user, id: 'chat', question: 'Cancelar' });
  assert.equal(cancel.stored.turns.at(-1).pendingAction.status, 'CANCELLED');
  assert.equal(cancel.writes, 0);
  const missing = setup([{ role: 'assistant', text: '¿Quién será el responsable?', pendingAction: { ...ready, missing: [{ field: 'responsable', question: '¿Quién?' }] } }]);
  await missing.service.send({ user, id: 'chat', question: 'Camila' });
  assert.equal(missing.stored.turns.at(-1).pendingActionSeen, 'act-1');
  await missing.service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(missing.writes, 0, 'an incomplete action cannot be confirmed');
});
