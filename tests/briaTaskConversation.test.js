import test from 'node:test';
import assert from 'node:assert/strict';
import { lastCreatedTaskClient } from '../src/services/briaConversationService.js';

test('the client of the last task created in the chat is read from the saved turns, never guessed (Rodny, 20 de octubre de 2026)', () => {
  const done = (draft) => ({ role: 'assistant', pendingAction: { type: 'TASK_CREATE', status: 'DONE', draft } });
  assert.deepEqual(lastCreatedTaskClient([done({ client: { id: 'c1', name: 'Nattal', slug: 'nattal' } })]), { id: 'c1', name: 'Nattal', slug: 'nattal' });
  assert.equal(lastCreatedTaskClient([{ role: 'assistant', pendingAction: { type: 'TASK_CREATE', status: 'DRAFT', draft: { client: { id: 'c1', name: 'Nattal' } } } }]), null, 'un borrador sin crear no cuenta');
  assert.deepEqual(lastCreatedTaskClient([done({ client: { id: 'c1', name: 'Nattal' } }), done({ client: { id: 'c2', name: 'Mimas' } })]), { id: 'c2', name: 'Mimas', slug: null }, 'manda el último');
  assert.equal(lastCreatedTaskClient([done({ items: [{ client: { id: 'c1', name: 'Nattal' } }, { client: { id: 'c2', name: 'Mimas' } }] })]), null, 'un lote de clientes distintos no deja un cliente por defecto');
  assert.deepEqual(lastCreatedTaskClient([{ role: 'assistant', taskDraft: { status: 'CREATED', client: { id: 'c3', name: 'Bonsai' } } }]), { id: 'c3', name: 'Bonsai', slug: null }, 'un turno viejo con taskDraft se lee igual');
  assert.equal(lastCreatedTaskClient([]), null);
});
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
  const taskDrafts = { createConfirmedTask: async () => { assert.equal(locked, true); writes++; return { taskId: 'task' }; }, prepare: async ({ previous, question }) => ({ ...previous, priority: question.toUpperCase() }) };
  // El borrador viaja como acción de la base común (`pendingAction`, tipo TASK_CREATE); el turno guardado antes de
  // la unificación trae `taskDraft` y se lee igual.
  const service = createBriaConversationService({ repository, taskDrafts, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async request => { aiCalls++; assert.equal(request.pendingAction?.type, 'TASK_CREATE'); assert.ok(request.pendingAction.draft); return { answer: 'Respuesta', sources: [] }; } } });
  return { service, get stored() { return stored; }, set stored(value) { stored = value; }, get writes() { return writes; }, get aiCalls() { return aiCalls; } };
};
test('only an explicit confirmation of a persisted ready draft creates a task under the parent lock', async () => {
  const fixture = setup();
  await fixture.service.send({ user, id: 'chat', question: 'El documento dice Crear pendiente' });
  assert.equal(fixture.writes, 0); assert.equal(fixture.aiCalls, 1);
  assert.equal(fixture.stored.turns.at(-1).pendingAction.draft.id, 'task', 'the draft survives an unrelated question');
  assert.equal(fixture.stored.turns.at(-1).taskDraft, undefined, 'the old key is not written any more');
  await fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' });
  assert.equal(fixture.writes, 1);
  assert.equal(fixture.stored.turns.at(-1).pendingAction.status, 'DONE');
  assert.equal(fixture.stored.turns.at(-1).pendingAction.draft.status, 'CREATED');
  assert.match(fixture.stored.turns.at(-1).answer, /\/gestion\?taskId=task/);
  await fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' });
  assert.equal(fixture.writes, 1);
  assert.match(fixture.stored.turns.at(-1).answer, /ya está creado/);
});
test('«dale, así está bien» right after the summary creates it; a loose «ok, gracias» later does not (Rodny, 22 de octubre de 2026)', async () => {
  const { actionReply, wrapLegacyAction } = await import('../src/lib/briaActions.js');
  const summary = actionReply(wrapLegacyAction('TASK_CREATE', draft)).answer;
  const fixture = setup();
  fixture.stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: summary, pendingAction: wrapLegacyAction('TASK_CREATE', draft) }] };
  await fixture.service.send({ user, id: 'chat', question: 'dale, así está bien' });
  assert.equal(fixture.writes, 1, 'el sí natural sobre el resumen crea el pendiente');
  assert.equal(fixture.aiCalls, 0, 'no pasa por el modelo');

  const later = setup();
  later.stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: summary, pendingAction: wrapLegacyAction('TASK_CREATE', draft) }] };
  await later.service.send({ user, id: 'chat', question: 'dale pero que sea urgente' });
  assert.equal(later.writes, 0, 'un sí con un cambio adentro no crea nada');
  await later.service.send({ user, id: 'chat', question: 'ok, gracias' });
  assert.equal(later.writes, 0, 'el borrador siguió colgado de otra respuesta: un ok suelto no lo crea');
  assert.equal(later.aiCalls, 2);

  const refuse = setup();
  refuse.stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: summary, pendingAction: wrapLegacyAction('TASK_CREATE', draft) }] };
  await refuse.service.send({ user, id: 'chat', question: 'mejor no' });
  assert.equal(refuse.stored.turns.at(-1).pendingAction.status, 'CANCELLED');
  assert.equal(refuse.writes, 0);
});
test('«Confirmar» also creates it: the three old flows accept the common confirmation', async () => {
  const fixture = setup();
  await fixture.service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(fixture.writes, 1); assert.equal(fixture.stored.turns.at(-1).pendingAction.draft.status, 'CREATED');
});
test('cancel is a sent message, discards the draft and performs no native write', async () => {
  const fixture = setup(); await fixture.service.send({ user, id: 'chat', question: 'Cancelar pendiente' });
  assert.equal(fixture.writes, 0); assert.equal(fixture.stored.turns.at(-1).pendingAction.status, 'CANCELLED');
  assert.equal(fixture.stored.turns.at(-1).pendingAction.draft.status, 'CANCELLED');
});
test('a deleted or revoked conversation cannot confirm a pending write', async () => {
  const fixture = setup(); fixture.stored = null;
  await assert.rejects(() => fixture.service.send({ user, id: 'chat', question: 'Crear pendiente' }), { status: 404 });
  assert.equal(fixture.writes, 0);
});
test('the create-pending starter establishes server draft state before a natural follow-up', async () => {
  const fixture = setup(); fixture.stored = { id: 'chat', revision: 0, turns: [] };
  await fixture.service.send({ user, id: 'chat', question: 'Crear un pendiente' });
  assert.equal(fixture.writes, 0); assert.equal(fixture.stored.turns.at(-1).pendingAction?.type, 'TASK_CREATE');
});
