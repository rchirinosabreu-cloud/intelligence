import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { taskDraftItems, taskDraftReply, taskDraftStage } from '../src/lib/briaTaskDraft.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';
import { PLATFORM_OPERATIONS } from '../src/lib/platformCatalog.js';

const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const client = { id: 'client', name: 'Cuenta ficticia', isArchived: false };
const setup = () => {
  const members = [{ id: 'owner-member', name: 'Marina', userId: 'owner', isActive: true }, { id: 'nora', name: 'Nora Sáenz', isActive: true }, { id: 'nora2', name: 'Nora Gómez', isActive: true }];
  const writes = [], stored = new Map();
  const service = createBriaTaskDraftService({
    db: {
      client: { findMany: async () => [client], findUnique: async () => client },
      teamMember: { findUnique: async ({ where }) => members.find(m => m.id === where.id || m.userId && m.userId === where.userId), findMany: async ({ where }) => members.filter(m => where.OR.some(c => c.name?.contains && m.name.toLowerCase().includes(c.name.contains.toLowerCase()))) },
      task: { findUnique: async ({ where }) => stored.get(where.id) }
    },
    createTask: async (payload, { taskId }) => { writes.push(payload); const row = { ...payload, id: taskId }; stored.set(taskId, row); return row; }
  });
  const prepare = (args = {}, previous) => service.prepare({ user, question: 'Cuenta ficticia: pedido humano', args: { ...(previous ? {} : { titulo: 'Ensayo de producción', cliente: client.name, responsable: 'yo', fecha: '2026-10-29' }), ...args }, request: { intent: previous ? 'ADJUST' : 'PREPARE', evidence: 'pedido humano' }, previous });
  return { service, prepare, members, writes };
};

test('task capabilities survive corrections, appear in approval and reach native creation only after confirmation', async () => {
  const f = setup();
  let draft = await f.prepare({ especial: true, colaboradores: ['Nora Sáenz'], contexto: '@Nora Sáenz revisa el ensayo.' });
  assert.equal(draft.isSpecial, true);
  assert.deepEqual(draft.collaborators.map(m => m.id), ['nora']);
  draft = await f.prepare({ fecha: '2026-10-30' }, draft);
  assert.match(taskDraftReply(draft).answer, /Proyecto especial: Sí/);
  assert.match(taskDraftReply(draft).answer, /Colaboradores: Nora Sáenz/);
  assert.equal(draft.context, '@Nora Sáenz revisa el ensayo.');
  assert.equal(f.writes.length, 0);
  await f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' });
  assert.equal(f.writes[0].isSpecial, true);
  assert.deepEqual(f.writes[0].collaboratorIds, ['nora']);
  assert.deepEqual(f.writes[0].initial_comments, [{ content: draft.context }]);
  await f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' });
  assert.equal(f.writes.length, 1);
});

test('ambiguous or missing collaborator blocks approval; clarification and removal preserve other fields', async () => {
  const f = setup();
  for (const name of ['Nora', 'Persona inexistente']) {
    const draft = await f.prepare({ especial: true, colaboradores: [name] });
    assert.equal(taskDraftStage(draft), 'COLLABORATORS');
    assert.ok(!taskDraftReply(draft).quickReplies.includes('Crear pendiente'));
    await assert.rejects(() => f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' }));
    const clarified = await f.prepare({ colaboradores: ['Nora Gómez'] }, draft);
    assert.equal(taskDraftStage(clarified), 'READY');
    const removed = await f.prepare({ colaboradores: [], especial: false }, clarified);
    assert.deepEqual(removed.collaborators, []);
    assert.equal(removed.isSpecial, false);
    assert.equal(removed.title, draft.title);
  }
  assert.equal(f.writes.length, 0);
});

test('unresolved requested effects stay visible and prevent confirmation until resolved', async () => {
  const f = setup();
  const draft = await f.prepare({ sinResolver: ['Falta definir quién podrá ver la tarea.'] });
  assert.equal(taskDraftStage(draft), 'UNRESOLVED');
  assert.match(taskDraftReply(draft).answer, /quién podrá ver/);
  await assert.rejects(() => f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' }));
  const edited = await f.prepare({ fecha: '2026-10-30' }, draft);
  assert.equal(taskDraftStage(edited), 'UNRESOLVED');
  assert.equal(taskDraftStage(await f.prepare({ sinResolver: [] }, edited)), 'READY');
});

test('inactive collaborators are rechecked before creating, and assignees are not silently added twice', async () => {
  const f = setup();
  const draft = await f.prepare({ colaboradores: ['Nora Sáenz', 'Nora Sáenz', 'yo'] });
  assert.deepEqual(taskDraftItems(draft)[0].collaborators.map(m => m.id), ['nora']);
  f.members[1].isActive = false;
  await assert.rejects(() => f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' }), /colaborador/i);
  assert.equal(f.writes.length, 0);
});

test('batch items can explicitly clear inherited special status and collaborators', async () => {
  const f = setup();
  const draft = await f.prepare({ especial: true, colaboradores: ['Nora Sáenz'], pendientes: [{ titulo: 'Uno', especial: false, colaboradores: [] }, { titulo: 'Dos' }] });
  const items = taskDraftItems(draft);
  assert.equal(items[0].isSpecial, false);
  assert.deepEqual(items[0].collaborators, []);
  assert.equal(items[1].isSpecial, true);
  assert.deepEqual(items[1].collaborators.map(m => m.id), ['nora']);
});

test('platform discovery lists capability families and complete operations without guessing search words', async () => {
  const [map] = createBriaPlatformTools({ actions: {}, platform: {} });
  const directory = (await map.run({})).data;
  assert.ok(directory.familias.some(f => f.familia === 'activity'));
  const activity = (await map.run({ familia: 'activity' })).data;
  assert.ok(activity.operaciones.some(op => op.operacion === 'GET /activity/status'));
  assert.equal(activity.operaciones.length, Object.keys(PLATFORM_OPERATIONS).filter(key => key.split(' ')[1].startsWith('/activity/')).length);
  const miss = (await map.run({ busqueda: 'inexistente-zzzz' })).data;
  assert.ok(miss.familias.length > 0);
  assert.doesNotMatch(miss.instruccion, /no se hace desde el chat/);
  const tasks = (await map.run({ familia: 'tasks' })).data;
  assert.match(tasks.operaciones.find(op => op.operacion === 'POST /tasks').campos, /isSpecial/);
});

test('generic operations cannot silently replace a task draft, including its unresolved requirements', async () => {
  const f = setup();
  const draft = await f.prepare({ sinResolver: ['Definir visibilidad'] });
  const pendingAction = { id: draft.id, ownerId: user.userId, type: 'TASK_CREATE', status: 'DRAFT', draft };
  let preparations = 0;
  const tools = createBriaPlatformTools({ actions: { prepare: async () => { preparations++; return { type: 'PLATFORM', status: 'DRAFT', missing: [] }; } }, platform: {} });
  const reply = await tools[2].run({ metodo: 'POST', ruta: '/tasks', cuerpo: {}, que_hace: 'Crear tarea', nuevo: true }, { user, pendingAction });
  assert.equal(preparations, 0);
  assert.deepEqual(reply.pendingAction, pendingAction);
  assert.equal(reply.data.done, false);
  assert.match(reply.data.error, /borrador/);
});
