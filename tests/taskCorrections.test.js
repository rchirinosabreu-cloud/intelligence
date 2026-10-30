import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskUpdate } from '../src/services/taskUpdateGate.js';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { familyOperations } from '../src/lib/platformCatalog.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

const actor = { userId: 'author', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const setup = () => {
  const clients = [{ id: 'old', name: 'Cuenta Norte', isArchived: false }, { id: 'new', name: 'Agencia Faro', isArchived: false }];
  const rows = ['one', 'two'].map(id => ({ id, title: `Trabajo ${id}`, clientId: 'old', client: clients[0], creatorId: 'author', status: 'PENDIENTE', isPrivate: false, assignee: { id: 'member', userId: 'worker', name: 'Persona' }, collaborators: [], viewers: [] }));
  const writes = [];
  const db = { task: {
    findUnique: async ({ where }) => rows.find(row => row.id === where.id),
    findMany: async ({ where }) => rows.filter(row => where.id.in.includes(row.id)),
    findFirst: async () => null
  }, client: { findUnique: async ({ where }) => clients.find(row => row.id === where.id), findMany: async () => clients } };
  const service = createBriaActionService({ db, updateTask: async (...args) => writes.push(args) });
  return { db, rows, clients, service, writes };
};

test('a creator corrects the client and title, reviews another revision, then executes only that revision', async () => {
  const { service, writes } = setup();
  const first = await service.prepare({ user: actor, type: 'TASK_UPDATE', args: { tarea: 'one', cliente: 'new', titulo: 'Preparar propuesta' } });
  assert.deepEqual(first.payload, { clientId: 'new', title: 'Preparar propuesta' });
  assert.match(first.summary.join('\n'), /Cuenta Norte → Agencia Faro/);
  assert.equal(writes.length, 0);
  const revised = await service.prepare({ user: actor, type: 'TASK_UPDATE', previous: first, args: { tarea: 'one', titulo: 'Revisar propuesta' } });
  assert.deepEqual(revised.payload, { clientId: 'new', title: 'Revisar propuesta' });
  await service.execute({ user: actor, action: revised });
  assert.deepEqual(writes, [['one', revised.payload, 'author']]);
});

test('a reviewed client correction covers the selected batch and keeps permission checks at execution', async () => {
  const { service, rows, writes } = setup();
  const action = await service.prepare({ user: actor, type: 'TASKS_STATUS', args: { tareas: ['one', 'two'], cliente: 'new' } });
  assert.equal(action.missing.length, 0);
  assert.equal(action.payload.items.length, 2);
  assert.match(action.summary.join('\n'), /Agencia Faro/);
  assert.equal(writes.length, 0);
  rows[1].creatorId = 'other';
  rows[1].isPrivate = true;
  const result = await service.execute({ user: actor, action });
  assert.deepEqual(writes, [['one', { clientId: 'new' }, 'author']]);
  assert.match(result.text, /No cambiaron/);
});

test('client correction preserves native permissions and rejects invalid destinations or moving a linked piece alone', async () => {
  const { db, rows, clients } = setup();
  const editor = { ...actor, role: 'EDITOR' };
  const attempt = (user = editor, payload = { clientId: 'new' }) => checkTaskUpdate({ db, user, taskId: 'one', payload });
  await attempt();
  await attempt({ ...editor, userId: 'worker' });
  await assert.rejects(attempt({ ...editor, userId: 'stranger' }), { gateStatus: 403 });
  await assert.rejects(attempt(actor, { clientId: '' }), { gateStatus: 400 });
  await assert.rejects(attempt(actor, { clientId: 'missing' }), { gateStatus: 400 });
  clients[1].isArchived = true;
  await assert.rejects(attempt(), { gateStatus: 400 });
  clients[1].isArchived = false;
  rows[0].contentItemId = 'piece';
  await assert.rejects(attempt(), { gateStatus: 409 });
  await attempt(actor, { clientId: 'old', contentObjective: 'Corregir objetivo' });
});

test('the platform map exposes native client and linked-title correction fields', () => {
  const edit = familyOperations('tasks').find(row => row.key === 'PATCH /tasks/:taskId');
  assert.match(edit.campos, /clientId/);
  assert.match(edit.campos, /contentObjective/);
});

test('correction survives a conversation revision and writes only after approval, once', async () => {
  const { service: actions, writes } = setup();
  let stored = { id: 'chat', revision: 0, turns: [] }, turn = 0;
  const repository = {
    get: async () => stored,
    append: async (_actor, _id, revision, question, result) => {
      assert.equal(revision, stored.revision);
      const reply = typeof result === 'function' ? await result() : result;
      stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] };
      return stored;
    }
  };
  const conversation = createBriaConversationService({ repository, actions, resolveActor: async () => ({ ref: actor.userId, role: actor.role }), assistant: { ask: async request => {
    turn++;
    if (turn > 2) return { answer: 'El cambio ya terminó.', sources: [] };
    const pendingAction = await actions.prepare({ user: actor, type: 'TASK_UPDATE', previous: request.pendingAction, args: { tarea: 'one', ...(turn === 1 ? { cliente: 'new' } : { titulo: 'Revisión de propuesta' }) } });
    return { answer: 'Revisa el cambio antes de aprobar.', sources: [], pendingAction };
  } } });
  await conversation.send({ user: actor, id: 'chat', question: 'Corrige el cliente; es de Agencia Faro.' });
  await conversation.send({ user: actor, id: 'chat', question: 'Ajusta también el título. Todavía no guardes.' });
  assert.equal(writes.length, 0);
  await assert.rejects(conversation.send({ user: actor, id: 'chat', question: 'Confirmar', expectedRevision: 1 }), { status: 409 });
  assert.equal(writes.length, 0);
  await conversation.send({ user: actor, id: 'chat', question: 'Confirmar', expectedRevision: 2 });
  assert.deepEqual(writes, [['one', { clientId: 'new', title: 'Revisión de propuesta' }, 'author']]);
  await conversation.send({ user: actor, id: 'chat', question: 'Confirmar' });
  assert.equal(writes.length, 1);
});

test('a destination archived or an origin changed after review blocks the correction', async () => {
  for (const changed of ['destination', 'origin']) {
    const { service, rows, clients, writes } = setup();
    const action = await service.prepare({ user: actor, type: 'TASK_UPDATE', args: { tarea: 'one', cliente: 'new' } });
    if (changed === 'destination') clients[1].isArchived = true;
    else rows[0].clientId = 'different';
    await assert.rejects(service.execute({ user: actor, action }));
    assert.equal(writes.length, 0);
  }
});
