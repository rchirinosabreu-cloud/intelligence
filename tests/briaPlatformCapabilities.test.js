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
    now: () => new Date('2026-10-24T17:00:00Z'),
    uploadFile: async file => ({ url: `https://files.invalid/${file.originalname}`, name: file.originalname, key: file.originalname }),
    db: {
      client: { findMany: async () => [client], findUnique: async () => client },
      teamMember: { findUnique: async ({ where }) => members.find(m => m.id === where.id || m.userId && m.userId === where.userId), findMany: async ({ where }) => members.filter(m => where.OR.some(c => c.name?.contains && m.name.toLowerCase().includes(c.name.contains.toLowerCase()))) },
      task: { findUnique: async ({ where }) => stored.get(where.id) }
    },
    createTask: async (payload, { taskId }) => { writes.push(payload); const row = { ...payload, id: taskId }; stored.set(taskId, row); return row; }
  });
  const prepare = (args = {}, previous, options = {}) => service.prepare({ user, question: 'Cuenta ficticia: pedido humano', args: { ...(previous ? {} : { titulo: 'Ensayo de producción', cliente: client.name, responsable: 'yo', fecha: '2026-10-29' }), ...args }, request: { intent: previous ? 'ADJUST' : 'PREPARE', evidence: 'pedido humano' }, previous, ...options });
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

test('the actual deadline hour survives clarification and day changes, and is saved in the native commitment field', async () => {
  const f = setup();
  let draft = await f.prepare({ fecha: 'hoy', horaLimite: '15:00', especial: true, colaboradores: ['Nora'] });
  draft = await f.prepare({ fecha: 'mañana' }, draft);
  draft = await f.prepare({ colaboradores: ['Nora Sáenz'] }, draft);
  assert.equal(draft.dueDate, '2026-10-25');
  assert.equal(draft.focusTime, '15:00');
  assert.match(taskDraftReply(draft).answer, /Hora límite: 15:00.*Bogotá/);
  await f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente' });
  assert.equal(f.writes[0].focusDeadlineAt, '2026-10-25T20:00:00.000Z');
  const cleared = await f.prepare({ horaLimite: null }, draft);
  assert.equal(taskDraftItems(cleared)[0].focusTime, null);
  assert.doesNotMatch(taskDraftReply(cleared).answer, /15:00/);
  await assert.rejects(f.prepare({ horaLimite: '25:70' }), /hora/i);
});

test('file destinations shown for approval match the native inputs, references and comment attachments', async () => {
  const f = setup();
  const available = ['input', 'reference', 'comment'].map(id => ({ id, name: 'foto.jpg' }));
  const draft = await f.prepare({ contexto: 'Evidencia del ensayo', archivos: [
    { id: 'input', destino: 'INSUMO' }, { id: 'reference', destino: 'REFERENCIA' }, { id: 'comment', destino: 'COMENTARIO' }
  ] }, null, { availableAttachments: available });
  assert.equal(draft.files.length, 3);
  const reply = taskDraftReply(draft).answer;
  assert.match(reply, /Insumo \(archivo\): foto.jpg/);
  assert.match(reply, /Referencia \(archivo\): foto.jpg/);
  assert.match(reply, /Adjunto del comentario: foto.jpg/);
  await f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente', loadAttachment: async id => ({ name: `${id}.jpg`, mime: 'image/jpeg', buffer: Buffer.from(id) }) });
  assert.equal(f.writes[0].initial_inputs.length, 1);
  assert.equal(f.writes[0].initial_references.length, 1);
  assert.equal(f.writes[0].tempAttachments.length, 1);
  assert.equal(f.writes[0].initial_comments[0].content, 'Evidencia del ensayo');
});

test('deadline hours require the native manager role both when preparing and immediately before writing', async () => {
  const f = setup(), actor = { ...user, role: 'COLLABORATOR' };
  await assert.rejects(f.prepare({ horaLimite: '15:00' }, null, { user: actor }), { status: 403 });
  const draft = await f.prepare({ horaLimite: '15:00' });
  actor.role = 'ADMIN';
  await assert.rejects(f.service.createConfirmedTask({ user: actor, draft, question: 'Crear pendiente', revalidate: async () => { actor.role = 'COLLABORATOR'; } }), { status: 403 });
  assert.equal(f.writes.length, 0);
});

test('file selection refuses duplicate ids, invented destinations and stale files without changing the original draft', async () => {
  const f = setup();
  const draft = await f.prepare({}, null, { attachments: [{ id: 'one', name: 'foto.jpg' }] });
  for (const archivos of [
    [{ id: 'one', destino: 'INSUMO' }, { id: 'one', destino: 'COMENTARIO' }],
    [{ id: 'one', destino: 'INVALID' }],
    [{ id: 'missing', destino: 'INSUMO' }]
  ]) await assert.rejects(f.prepare({ archivos }, draft), { status: 400 });
  assert.deepEqual(draft.files, [{ id: 'one', name: 'foto.jpg', destination: 'INSUMO' }]);
  assert.equal(f.writes.length, 0);
});

test('explicit file removal overrides incoming attachments and stays removed through later corrections', async () => {
  const f = setup(), file = { id: 'photo', name: 'foto.jpg' };
  let draft = await f.prepare({ contexto: 'Texto que la persona retira' }, null, { attachments: [file] });
  draft = await f.prepare({ archivos: [], contexto: '' }, draft, { attachments: [file] });
  draft = await f.prepare({ prioridad: 'urgente' }, draft);
  assert.deepEqual(draft.files, []);
  assert.equal(draft.context, '');
  assert.doesNotMatch(taskDraftReply(draft).answer, /foto.jpg|Texto que/);
  await f.service.createConfirmedTask({ user, draft, question: 'Crear pendiente', loadAttachment: async () => assert.fail('removed file must not upload') });
  assert.deepEqual(f.writes[0].initial_inputs, []);
  assert.deepEqual(f.writes[0].initial_comments, []);
  await assert.rejects(f.prepare({ archivos: [{ id: 'unknown', destino: 'INSUMO' }] }), /archivo/i);
});

test('batch items can clear inherited hour, files and comment without replacing the other task fields', async () => {
  const f = setup();
  const draft = await f.prepare({ horaLimite: '15:00', contexto: 'Comentario común', pendientes: [{ titulo: 'Sin material', horaLimite: null, archivos: [], contexto: '' }, { titulo: 'Con material' }] }, null, { attachments: [{ id: 'photo', name: 'foto.jpg' }] });
  const items = taskDraftItems(draft);
  assert.equal(items[0].focusTime, null);
  assert.deepEqual(items[0].files, []);
  assert.equal(items[0].context, '');
  assert.equal(items[1].focusTime, '15:00');
  assert.equal(items[1].files[0].id, 'photo');
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

test('platform read provenance uses the server clock supplied for the turn, not a different clock', async () => {
  const instant = new Date('2026-10-26T15:30:00Z');
  const tools = createBriaPlatformTools({ actions: {}, platform: { call: async () => ({ ok: true, data: [] }) } });
  const result = await tools[1].run({ ruta: '/activity/status' }, { user, session: { token: 'fictional' }, now: () => instant });
  assert.equal(result.data.consultadoEn, instant.toISOString());
  assert.equal(result.data.operacion, 'GET /activity/status');
});
