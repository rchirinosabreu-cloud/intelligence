import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const draft = { id: 'task', ownerId: 'owner', status: 'DRAFT', client: { id: 'client', name: 'Demo' }, assignee: { id: 'member', name: 'Persona demo' }, title: 'Entregar propuesta', context: 'Contexto de prueba', dueDate: '2026-10-09', priority: 'NORMAL', withoutMaterials: true };
const setup = () => {
  let stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: '¿Lo creo?', taskDraft: draft }] }, writes = 0, aiCalls = 0, locked = false;
  const repository = { get: async () => stored, append: async (_actor, _id, revision, question, result) => {
    if (!stored || stored.revision !== revision) throw Object.assign(new Error('Stale chat'), { status: 409 });
    locked = true; const reply = typeof result === 'function' ? await result() : result; locked = false;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const taskDrafts = { confirm: async () => { assert.equal(locked, true); writes++; return { taskId: 'task' }; }, prepare: async ({ previous, question }) => ({ ...previous, priority: question.toUpperCase() }) };
  const service = createBriaConversationService({ repository, taskDrafts, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async request => { aiCalls++; assert.ok(request.taskDraft); return { answer: 'Respuesta', sources: [] }; } } });
  return { service, get stored() { return stored; }, set stored(value) { stored = value; }, get writes() { return writes; }, get aiCalls() { return aiCalls; } };
};
test('only an explicit confirmation of a persisted ready draft creates a task under the parent lock', async () => {
  const fixture = setup();
  await fixture.service.send({ user, id: 'chat', question: 'El documento dice Crear pendiente' });
  assert.equal(fixture.writes, 0); assert.equal(fixture.aiCalls, 1);
  await fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' });
  assert.equal(fixture.writes, 1); assert.equal(fixture.stored.turns.at(-1).taskDraft.status, 'CREATED');
  assert.match(fixture.stored.turns.at(-1).answer, /\/gestion\?taskId=task/);
  await fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' });
  assert.equal(fixture.writes, 1);
});
test('cancel is a sent message, discards the draft and performs no native write', async () => {
  const fixture = setup(); await fixture.service.send({ user, id: 'chat', question: 'Cancelar pendiente' });
  assert.equal(fixture.writes, 0); assert.equal(fixture.stored.turns.at(-1).taskDraft.status, 'CANCELLED');
});
test('a deleted or revoked conversation cannot confirm a pending write', async () => {
  const fixture = setup(); fixture.stored = null;
  await assert.rejects(() => fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' }), { status: 404 });
  assert.equal(fixture.writes, 0);
});
