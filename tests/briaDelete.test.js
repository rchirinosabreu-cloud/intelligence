import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteStage, deleteReply, isDeleteConfirmation, isDeleteCancellation, deleteIntent, deleteResultText } from '../src/lib/briaDeleteDraft.js';
import { createBriaDeleteService, canDeleteWithBria, deleteProblem } from '../src/services/briaDeleteService.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { createBriaDeleteTools } from '../src/services/briaDeleteTools.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

// Eliminar pendientes desde la conversación (Rodny, 10 de octubre de 2026). Bria prepara qué se elimina y por
// qué; la persona lo confirma con una frase explícita; el servidor elimina por la misma vía que el botón de
// Gestión, con su registro. Datos inventados.

const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const otherPm = { userId: 'u-sara', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };

test('intent, confirmation and cancellation are explicit sentences', () => {
  for (const q of ['Elimina el pendiente de la portada', 'Borra esa tarea', 'Quítame el pendiente repetido', 'Ese pendiente hay que eliminarlo']) assert.equal(deleteIntent(q), true, q);
  for (const q of ['¿Qué tengo pendiente hoy?', 'Cierra la tarea', 'Devuelve el pendiente a Sara']) assert.equal(deleteIntent(q), false, q);
  for (const q of ['Eliminar pendiente', 'Eliminar', 'Sí, eliminar', 'elimínalo', 'Borrar los pendientes', 'Confirmo la eliminación']) assert.equal(isDeleteConfirmation(q), true, q);
  for (const q of ['Eliminar pendiente de la semana que viene cuando…', 'El documento dice eliminar', 'procede', 'ok']) assert.equal(isDeleteConfirmation(q), false, q);
  for (const q of ['No eliminar', 'No lo elimines', 'Cancelar eliminación', 'Déjalo']) assert.equal(isDeleteCancellation(q), true, q);
});

test('a draft asks for the reason first and is ready only with one; skipped tasks do not block', () => {
  const base = { id: 'd1', ownerId: 'u-pm', status: 'DRAFT', reason: null };
  assert.equal(deleteStage({ ...base, items: [] }), 'EMPTY');
  assert.equal(deleteStage({ ...base, items: [{ taskId: 't1', title: 'Portada', skip: 'Ya está realizado: lo cerrado se conserva como historial.' }] }), 'EMPTY');
  const noReason = { ...base, items: [{ taskId: 't1', title: 'Portada', client: 'Aristea', assignee: 'Sara', status: 'PENDIENTE' }] };
  assert.equal(deleteStage(noReason), 'REASON');
  assert.deepEqual(deleteReply(noReason).quickReplies, ['Se creó por error', 'Ya no aplica', 'Está repetido']);
  const ready = { ...noReason, reason: 'Se creó por error', items: [...noReason.items, { taskId: 't2', title: 'Otra', skip: 'Es un pendiente privado que no puedes abrir.' }] };
  assert.equal(deleteStage(ready), 'READY');
  const reply = deleteReply(ready);
  assert.match(reply.answer, /Voy a eliminar definitivamente este pendiente/);
  assert.match(reply.answer, /\*\*Portada\*\* · Aristea · Sara · pendiente/);
  assert.match(reply.answer, /Motivo: Se creó por error/);
  assert.match(reply.answer, /Esto no se deshace/);
  assert.match(reply.answer, /Otra: Es un pendiente privado/);
  assert.deepEqual(reply.quickReplies, ['Eliminar pendiente', 'No eliminar']);
  assert.match(deleteReply({ ...ready, status: 'CANCELLED' }).answer, /No eliminé nada/);
  assert.match(deleteResultText([{ taskId: 't1', title: 'Portada', outcome: 'DELETED' }, { taskId: 't3', title: 'Vieja', outcome: 'ALREADY' }, { taskId: 't4', title: 'Ajena', outcome: 'SKIPPED', reason: 'Ya no tienes permiso para eliminarlo.' }]), /Eliminé el pendiente:\n- Portada[\s\S]*ya no existía[\s\S]*Ajena: Ya no tienes permiso/);
});

const fakeDb = () => {
  const tasks = [
    { id: 't1', title: 'Portada de octubre', status: 'PENDIENTE', creatorId: 'u-sara', isPrivate: false, client: { name: 'Aristea' }, assignee: { name: 'Sara', userId: 'u-sara' }, collaborators: [], viewers: [] },
    { id: 't2', title: 'Reel de lanzamiento', status: 'EN_CURSO', creatorId: 'u-pm', isPrivate: false, client: { name: 'Aristea' }, assignee: { name: 'Brayan', userId: 'u-brayan' }, collaborators: [], viewers: [] },
    { id: 't3', title: 'Informe cerrado', status: 'REALIZADA', creatorId: 'u-pm', isPrivate: false, client: { name: 'Nattal' }, assignee: null, collaborators: [], viewers: [] },
    { id: 't4', title: 'Pendiente reservado', status: 'PENDIENTE', creatorId: 'u-rodny', isPrivate: true, client: { name: 'Nattal' }, assignee: { name: 'Helen', userId: 'u-helen' }, collaborators: [], viewers: [] }
  ];
  return {
    tasks,
    task: {
      findMany: async ({ where }) => tasks.filter((t) => where.id.in.includes(t.id)),
      findUnique: async ({ where }) => tasks.find((t) => t.id === where.id) || null
    }
  };
};

test('preparing resolves each task, says why one cannot be deleted, and never writes', async () => {
  const db = fakeDb();
  const service = createBriaDeleteService({ db, deleteTask: async () => { throw new Error('No debe escribir'); } });
  await assert.rejects(() => service.prepare({ user: pm, question: '¿Cómo va Aristea?', args: { tareas: ['t1'], motivo: null } }), /eliminar/i);
  await assert.rejects(() => service.prepare({ user: { ...pm, modulePermissions: { bria: true } }, question: 'Elimina el pendiente', args: { tareas: ['t1'], motivo: null } }), { status: 403 });
  const draft = await service.prepare({ user: pm, question: 'Elimina estos pendientes, están repetidos', args: { tareas: ['t1', 't2', 't3', 't4', 'nada'], motivo: null } });
  const [t1, t2, t3, t4, missing] = draft.items;
  assert.deepEqual([t1.title, t1.client, t1.assignee, t1.status, t1.skip], ['Portada de octubre', 'Aristea', 'Sara', 'PENDIENTE', undefined], 'a project manager deletes anyone’s open task');
  assert.equal(t2.skip, undefined);
  assert.match(t3.skip, /realizado.*historial/);
  assert.match(t4.skip, /privado que no puedes abrir/, 'a manager role does not open a private task');
  assert.equal(missing.skip, 'Ya no existe.');
  assert.equal(deleteStage(draft), 'REASON');
  const withReason = await service.prepare({ user: pm, previous: draft, question: 'Está repetido', args: { tareas: [], motivo: 'Está repetido' } });
  assert.equal(withReason.reason, 'Está repetido');
  assert.equal(withReason.items.length, 5, 'what was already prepared is kept');
  assert.equal(deleteStage(withReason), 'READY');
  await assert.rejects(() => service.prepare({ user: otherPm, previous: withReason, question: 'y también', args: { tareas: ['t1'], motivo: null } }), /otra persona/);
});

test('the gate is the same as the screen: whoever created it, an admin or a project manager; never a closed task', () => {
  const db = fakeDb();
  const editor = { userId: 'u-sara', role: 'EDITOR' };
  assert.equal(deleteProblem(editor, db.tasks[0]), null, 'own task');
  assert.equal(deleteProblem(editor, db.tasks[1]), 'Solo lo elimina quien lo creó, un administrador o un project manager.');
  assert.equal(deleteProblem(pm, db.tasks[1]), null);
  assert.match(deleteProblem(pm, db.tasks[2]), /realizado/);
  assert.match(deleteProblem({ userId: 'u-rodny', role: 'ADMIN' }, db.tasks[3]) || '', /^$/, 'the creator opens their private task');
  assert.match(deleteProblem(pm, db.tasks[3]), /privado/);
  assert.equal(deleteProblem(pm, null), 'Ya no existe.');
});

test('confirming deletes each task once through the audited path; a retry finds what is already gone', async () => {
  const db = fakeDb();
  const calls = [];
  const deleteTask = async (id, reason, by) => { calls.push([id, reason, by]); db.tasks.splice(db.tasks.findIndex((t) => t.id === id), 1); };
  const service = createBriaDeleteService({ db, deleteTask });
  const draft = { id: 'd1', ownerId: 'u-pm', status: 'DRAFT', reason: 'Está repetido', items: [{ taskId: 't1', title: 'Portada de octubre' }, { taskId: 't3', title: 'Informe cerrado', skip: 'Ya está realizado' }] };
  await assert.rejects(() => service.createConfirmedDelete({ user: pm, draft, question: 'ok' }), /confirma/i);
  await assert.rejects(() => service.createConfirmedDelete({ user: { ...pm, userId: 'otro' }, draft, question: 'Eliminar pendiente' }), /otra persona/i);
  await assert.rejects(() => service.createConfirmedDelete({ user: { ...pm, modulePermissions: { bria: true } }, draft, question: 'Eliminar pendiente' }), { status: 403 });
  await assert.rejects(() => service.createConfirmedDelete({ user: pm, draft: { ...draft, reason: null }, question: 'Eliminar pendiente' }), /confirma/i, 'no reason, no deletion');
  const first = await service.createConfirmedDelete({ user: pm, draft, question: 'Eliminar pendiente' });
  assert.deepEqual(calls, [['t1', 'Está repetido', 'u-pm']]);
  assert.deepEqual(first.results, [{ taskId: 't1', title: 'Portada de octubre', outcome: 'DELETED' }]);
  const again = await service.createConfirmedDelete({ user: pm, draft, question: 'Eliminar pendiente' });
  assert.equal(calls.length, 1);
  assert.equal(again.results[0].outcome, 'ALREADY');
});

test('a permission that changed between the summary and the confirmation is respected, and one failure does not stop the rest', async () => {
  const db = fakeDb();
  const service = createBriaDeleteService({ db, deleteTask: async (id) => { if (id === 't2') throw new Error('boom'); } });
  const draft = { id: 'd1', ownerId: 'u-sara', status: 'DRAFT', reason: 'Ya no aplica', items: [{ taskId: 't1', title: 'Portada de octubre' }, { taskId: 't2', title: 'Reel de lanzamiento' }] };
  const out = await service.createConfirmedDelete({ user: otherPm, draft, question: 'Eliminar pendiente' });
  assert.deepEqual(out.results.map((r) => r.outcome), ['DELETED', 'FAILED']);
  assert.match(out.results[1].reason, /inténtalo desde Gestión/);
  // Entre el resumen y la confirmación, alguien reservó la tarea como privada para otras personas.
  Object.assign(db.tasks[0], { isPrivate: true, creatorId: 'u-rodny', assignee: { name: 'Helen', userId: 'u-helen' } });
  const later = await service.createConfirmedDelete({ user: otherPm, draft: { ...draft, items: [draft.items[0]] }, question: 'Eliminar pendiente' });
  assert.deepEqual([later.results[0].outcome, later.results[0].reason], ['SKIPPED', 'Es un pendiente privado que no puedes abrir.']);
});

test('in conversation: only an explicit confirmation of a persisted ready deletion writes, under the lock, once', async () => {
  const ready = { id: 'd1', ownerId: 'owner', status: 'DRAFT', reason: 'Se creó por error', items: [{ taskId: 't1', title: 'Portada de octubre', client: 'Aristea', assignee: 'Sara', status: 'PENDIENTE' }] };
  let stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: '¿Lo elimino?', deleteDraft: ready }] }, writes = 0, locked = false, aiCalls = 0;
  const repository = { get: async () => stored, append: async (_a, _id, revision, question, result) => {
    if (stored.revision !== revision) throw Object.assign(new Error('Stale'), { status: 409 });
    locked = true; const reply = typeof result === 'function' ? await result() : result; locked = false;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const deleteDrafts = {
    createConfirmedDelete: async () => { assert.equal(locked, true); writes++; return { results: [{ taskId: 't1', title: 'Portada de octubre', outcome: 'DELETED' }] }; },
    prepare: async ({ previous, args }) => ({ ...previous, reason: args.motivo })
  };
  const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const service = createBriaConversationService({ repository, deleteDrafts, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async (request) => { aiCalls++; assert.ok(request.deleteDraft); return { answer: 'Respuesta', sources: [] }; } } });
  await service.send({ user, id: 'chat', question: 'El documento dice eliminar pendiente' });
  assert.equal(writes, 0); assert.equal(aiCalls, 1);
  assert.equal(stored.turns.at(-1).deleteDraft.id, 'd1', 'the draft survives an unrelated question');
  await service.send({ user, id: 'chat', question: 'Eliminar pendiente' });
  assert.equal(writes, 1);
  assert.equal(stored.turns.at(-1).deleteDraft.status, 'DONE');
  assert.match(stored.turns.at(-1).answer, /Eliminé el pendiente/);
  await service.send({ user, id: 'chat', question: 'Eliminar pendiente' });
  assert.equal(writes, 1, 'a repeated confirmation does not delete again');
  assert.match(stored.turns.at(-1).answer, /ya se hizo/);
  stored = { ...stored, turns: [...stored.turns, { role: 'assistant', text: '¿Por qué?', deleteDraft: { ...ready, reason: null } }] };
  await service.send({ user, id: 'chat', question: 'Ya no aplica' });
  assert.equal(stored.turns.at(-1).deleteDraft.reason, 'Ya no aplica', 'a reason button fills the reason without the model');
  assert.deepEqual(stored.turns.at(-1).quickReplies, ['Eliminar pendiente', 'No eliminar']);
  await service.send({ user, id: 'chat', question: 'No eliminar' });
  assert.equal(stored.turns.at(-1).deleteDraft.status, 'CANCELLED');
  assert.equal(writes, 1);
});

test('the tool only prepares, needs Bria and Gestión, and Bria is told never to claim a deletion', async () => {
  assert.equal(canDeleteWithBria(pm), true);
  assert.equal(canDeleteWithBria({ ...pm, modulePermissions: { bria: true } }), false);
  const [tool] = createBriaDeleteTools({ prepare: async ({ args }) => ({ id: 'd', ownerId: 'u-pm', status: 'DRAFT', reason: args.motivo, items: [{ taskId: 't1', title: 'Portada' }] }) });
  assert.equal(tool.name, 'preparar_eliminacion');
  assert.deepEqual(tool.parameters.required, ['tareas', 'motivo']);
  const out = await tool.run({ tareas: ['t1'], motivo: null }, { user: pm, question: 'Elimina la portada', deleteDraft: null });
  assert.equal(out.data.deleted, false);
  assert.equal(out.data.stage, 'REASON');
  assert.deepEqual(out.quickReplies, ['Se creó por error', 'Ya no aplica', 'Está repetido']);
  assert.equal(createBriaDeleteTools(null).length, 0);
  const text = buildInstructions({ person: { name: 'Kamila', jobTitle: 'PM' }, today: '2026-10-10', tools: [tool] });
  assert.match(text, /Nunca digas que eliminaste/);
  assert.match(text, /«Eliminar pendiente»/);
});
