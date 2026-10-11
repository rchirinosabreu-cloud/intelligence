import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { createBriaActionTools } from '../src/services/briaActionTools.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { searchTasks, TASK_SEARCH_MAX } from '../src/services/taskSearch.js';
import { actionStage, actionReply } from '../src/lib/briaActions.js';
import { buildInstructions, toolProgressLabel } from '../src/lib/briaAssistant.js';

// Acciones masivas sobre pendientes (Rodny, 11 de octubre de 2026): «Todos los pendientes de Jarlan, pónselos a
// Kamila como responsable», «Todos los pendientes que no tienen asignación, colócaselos a Francisco», «Dime
// cuántos pendientes están sin asignar». Bria busca con los filtros de Gestión, prepara el lote con cuáles sí y
// cuáles no, y solo la persona confirma. Datos inventados.

const NOW = () => new Date('2026-10-09T15:00:00.000Z'); // viernes 9 de octubre, 10:00 de Bogotá
const TODAY = '2026-10-09';
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const noon = (key) => new Date(`${key}T12:00:00.000Z`);

const member = (id, name, userId, isActive = true) => ({ id, name, email: `${id}@brain.test`, userId, isActive });
const MEMBERS = [member('m-jar', 'Jarlan Pérez', 'u-jar'), member('m-kam', 'Kamila Ruiz', 'u-kam'), member('m-fv', 'Francisco Villa', 'u-fv'), member('m-ft', 'Francisco Torres', 'u-ft')];
const CLIENTS = [{ id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false }, { id: 'c2', name: 'Nattal', slug: 'nattal', isArchived: false }];

const task = (id, title, extra = {}) => ({
  id, title, status: 'PENDIENTE', dueDate: null, focusDeadlineAt: null, priority: null, isPriority: false, creatorId: 'u-pm', isPrivate: false,
  clientId: 'c1', assigneeId: null, comments: 'CUERPO SECRETO', collaborators: [], viewers: [], createdAt: new Date('2026-10-01T12:00:00.000Z'), ...extra
});
const baseTasks = () => [
  task('b1', 'Reel de Jarlan', { assigneeId: 'm-jar', dueDate: noon('2026-10-14') }),
  task('b2', 'Carrusel en marcha', { assigneeId: 'm-jar', clientId: 'c2', status: 'EN_CURSO', dueDate: noon('2026-10-05'), focusDeadlineAt: new Date('2026-10-09T20:00:00.000Z') }),
  task('b3', 'Reservada de otro', { assigneeId: 'm-jar', isPrivate: true, creatorId: 'u-rodny' }),
  task('b4', 'Guion sin dueño', { dueDate: null }),
  task('b5', 'Post devuelto sin dueño', { clientId: 'c2', status: 'DEVUELTA', dueDate: noon('2026-10-01') }),
  task('b6', 'Cerrada de Jarlan', { assigneeId: 'm-jar', status: 'REALIZADA' }),
  task('b7', 'Reservada mía', { assigneeId: 'm-jar', isPrivate: true, creatorId: 'u-pm' }),
  task('b8', 'Ajena de Jarlan', { assigneeId: 'm-jar', creatorId: 'u-otro', dueDate: noon('2026-10-20') })
];

// Una base falsa que entiende los `where` de la búsqueda compartida; `updateMany` no existe a propósito.
const fakeDb = (tasks = baseTasks()) => {
  const hydrate = (row) => ({ ...row, client: CLIENTS.find((c) => c.id === row.clientId) ? { id: row.clientId, name: CLIENTS.find((c) => c.id === row.clientId).name } : null, assignee: row.assigneeId ? (({ id, name, userId }) => ({ id, name, userId }))(MEMBERS.find((m) => m.id === row.assigneeId)) : null });
  const matches = (row, where = {}) => {
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.id && typeof where.id === 'string' && row.id !== where.id) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    if (where.status?.not && row.status === where.status.not) return false;
    if ('assigneeId' in where && (row.assigneeId ?? null) !== where.assigneeId) return false;
    if (where.clientId && row.clientId !== where.clientId) return false;
    if (where.dueDate?.lt && !(row.dueDate && row.dueDate < where.dueDate.lt)) return false;
    return true;
  };
  const byDue = (a, b) => (a.dueDate && b.dueDate ? a.dueDate - b.dueDate : a.dueDate ? -1 : b.dueDate ? 1 : 0) || (a.createdAt - b.createdAt);
  const queries = [];
  return {
    tasks, queries,
    task: {
      findUnique: async ({ where }) => { const row = tasks.find((t) => t.id === where.id); return row ? hydrate(row) : null; },
      findFirst: async ({ where }) => { const row = tasks.find((t) => matches(t, where)); return row ? hydrate(row) : null; },
      findMany: async (args) => { queries.push(args); return tasks.filter((t) => matches(t, args.where)).sort(byDue).slice(0, args.take ?? tasks.length).map(hydrate); },
      count: async ({ where }) => tasks.filter((t) => matches(t, where)).length,
      updateMany: async () => { throw new Error('updateMany está prohibido: cada tarea pasa por updateTask'); }
    },
    teamMember: { findMany: async ({ where } = {}) => {
      if (!where) return MEMBERS;
      return MEMBERS.filter((m) => (where.isActive == null || m.isActive === where.isActive) && (!where.OR || where.OR.some((c) => (c.name && m.name.toLowerCase().includes(c.name.contains.toLowerCase())) || (c.email && m.email === c.email.equals))));
    } },
    client: { findMany: async ({ where } = {}) => {
      if (!where) return CLIENTS;
      return CLIENTS.filter((c) => where.OR.some((cond) => (cond.id && c.id === cond.id) || (cond.name && c.name.toLowerCase().includes(cond.name.contains.toLowerCase()))));
    } }
  };
};

const service = (db, extra = {}) => {
  const calls = [];
  const updateTask = async (id, data, by) => { calls.push([id, data, by]); const row = db.tasks.find((t) => t.id === id); Object.assign(row, data.status ? { status: data.status } : {}, 'assigneeId' in data ? { assigneeId: data.assigneeId } : {}, data.dueDate ? { dueDate: new Date(data.dueDate) } : {}); };
  return { calls, service: createBriaActionService({ db, updateTask, now: NOW, ...extra }) };
};

/* ------------------------------------------------------------------ buscar_pendientes */

test('buscar_pendientes answers «cuántos están sin asignar» with the real count, ids included and never the body', async () => {
  const db = fakeDb();
  const out = await toolByName('buscar_pendientes').run({ sinResponsable: true }, { db, user: pm, today: TODAY });
  assert.equal(out.data.total, 2);
  assert.deepEqual(out.data.tareas.map((t) => t.id).sort(), ['b4', 'b5']);
  assert.equal(out.data.descripcion, '2 pendientes abiertos sin responsable');
  assert.equal(JSON.stringify(out).includes('SECRETO'), false, 'el cuerpo nunca viaja');
  assert.deepEqual(out.sources[0], { kind: 'tarea', id: out.data.tareas[0].id, label: out.data.tareas[0].titulo, url: `/gestion?taskId=${out.data.tareas[0].id}` });
  assert.equal(toolByName('buscar_pendientes').allowed({ ...pm, modulePermissions: { bria: true } }), false, 'needs Gestión, like the board');
  assert.equal(toolByName('buscar_pendientes').allowed(pm), true);
});

test('buscar_pendientes finds a misspelled person and says it was an approximation; an ambiguous name asks which one', async () => {
  const db = fakeDb();
  const out = await toolByName('buscar_pendientes').run({ responsable: 'jarlan peres' }, { db, user: pm, today: TODAY });
  assert.deepEqual(out.data.responsable, { id: 'm-jar', nombre: 'Jarlan Pérez', aproximado: true });
  assert.equal(out.data.aproximado, true);
  assert.equal(out.data.total, 5, 'open tasks only: the closed one stays out');
  assert.equal(out.data.descripcion, '5 pendientes abiertos de Jarlan Pérez');
  const privada = out.data.tareas.find((t) => t.id === 'b3');
  assert.equal(privada.privada, true, 'a private task is listed by its title, like on the board');
  await assert.rejects(() => toolByName('buscar_pendientes').run({ responsable: 'Francisco' }, { db, user: pm, today: TODAY }), (error) => error.status === 400 && /Francisco Villa/.test(error.message) && /Francisco Torres/.test(error.message));
  await assert.rejects(() => toolByName('buscar_pendientes').run({ responsable: 'Zutano' }, { db, user: pm, today: TODAY }), { status: 404 });
});

test('buscar_pendientes combines filters: overdue, state, client by name or id', async () => {
  const db = fakeDb();
  const overdue = await toolByName('buscar_pendientes').run({ responsable: 'Jarlan', vencidas: true }, { db, user: pm, today: TODAY });
  assert.deepEqual(overdue.data.tareas.map((t) => t.id), ['b2']);
  assert.equal(overdue.data.descripcion, '1 pendiente vencido de Jarlan Pérez');
  assert.equal(db.queries.at(-1).where.dueDate.lt.toISOString(), '2026-10-09T05:00:00.000Z', 'before today in Bogotá');
  const returned = await toolByName('buscar_pendientes').run({ estado: 'devueltas', cliente: 'natal' }, { db, user: pm, today: TODAY });
  assert.deepEqual(returned.data.tareas.map((t) => t.id), ['b5']);
  assert.equal(returned.data.descripcion, '1 pendiente devuelto del cliente Nattal');
  assert.deepEqual(returned.data.cliente, { id: 'c2', nombre: 'Nattal', aproximado: true });
  const byId = await toolByName('buscar_pendientes').run({ cliente: 'c1', estado: 'todas' }, { db, user: pm, today: TODAY });
  assert.deepEqual(byId.data.tareas.map((t) => t.id).sort(), ['b1', 'b3', 'b4', 'b7', 'b8']);
});

test('the shared search caps at 50 and still reports the real total', async () => {
  const many = Array.from({ length: 60 }, (_, i) => task(`x${i}`, `Tarea ${i}`, { assigneeId: 'm-jar', dueDate: noon(`2026-11-${String((i % 28) + 1).padStart(2, '0')}`) }));
  const db = fakeDb(many);
  const out = await searchTasks({ db, user: pm, filters: { responsable: 'Jarlan' }, today: TODAY, select: { id: true } });
  assert.equal(TASK_SEARCH_MAX, 50);
  assert.equal(out.total, 60);
  assert.equal(out.rows.length, 50);
  const tool = await toolByName('buscar_pendientes').run({ responsable: 'Jarlan' }, { db, user: pm, today: TODAY });
  assert.equal(tool.data.total, 60);
  assert.equal(tool.data.tareas.length, 50);
  assert.match(tool.data.nota, /60/);
});

/* ------------------------------------------------------------------ cambiar_pendientes en lote */

test('«todos los de Jarlan, pónselos a Kamila»: the lot is resolved on the server, each task passes the gate, and the warnings say what to look at', async () => {
  const db = fakeDb();
  const gate = async ({ taskId, ...rest }) => { if (taskId === 'b8') throw Object.assign(new Error('No tienes permisos para actualizar esta tarea'), { gateStatus: 403 }); return rest; };
  const { service: actions, calls } = service(db, { gate });
  const action = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { responsable: 'Jarlan' }, responsable: 'Kamila' } });
  assert.equal(actionStage(action), 'READY');
  assert.deepEqual(action.target.taskIds.sort(), ['b1', 'b2', 'b3', 'b7', 'b8'], 'resolved ids are kept in the target');
  assert.equal(action.target.descripcion, '5 pendientes abiertos de Jarlan Pérez');
  assert.deepEqual(action.payload.items.map((i) => i.taskId).sort(), ['b1', 'b2', 'b7']);
  assert.equal(action.payload.assigneeId, 'm-kam');
  assert.match(action.summary[0], /5 pendientes abiertos de Jarlan Pérez/);
  assert.match(action.summary.join('\n'), /Responsable → Kamila Ruiz/);
  const warnings = action.warnings.join('\n');
  assert.match(warnings, /No se tocan: .*Reservada de otro \(Es un pendiente privado/);
  assert.match(warnings, /Ajena de Jarlan \(No tienes permisos para actualizar esta tarea\)/, 'what the gate refuses is said, with its reason');
  assert.match(warnings, /Tiene compromiso con hora: «Carrusel en marcha»/);
  assert.match(warnings, /Es un pendiente privado: «Reservada mía»/);
  // Reasignar una tarea en proceso (Rodny, 11 de octubre de 2026): la plataforma la devuelve a Pendiente y cierra el reloj anterior.
  assert.match(warnings, /Está en proceso: al cambiar de responsable vuelve a Pendiente y el reloj de quien la trabajaba se cierra[^\n]*«Carrusel en marcha»/);
  assert.deepEqual(actionReply(action).quickReplies, ['Confirmar', 'Cancelar']);
  assert.equal(calls.length, 0, 'preparing never writes');
  const out = await actions.execute({ user: pm, action });
  assert.deepEqual(calls.map(([id, data]) => [id, data]).sort((a, b) => a[0].localeCompare(b[0])), [['b1', { assigneeId: 'm-kam' }], ['b2', { assigneeId: 'm-kam' }], ['b7', { assigneeId: 'm-kam' }]]);
  assert.match(out.text, /3 tareas cambiaron/);
  assert.match(out.text, /Responsable → Kamila Ruiz/);
  assert.equal(out.sources.length, 3);
});

test('«los que no tienen asignación, a Francisco»: an ambiguous new assignee is asked with options and the same action continues', async () => {
  const db = fakeDb();
  const { service: actions, calls } = service(db);
  const asked = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { sinResponsable: true }, responsable: 'Francisco' } });
  assert.equal(actionStage(asked), 'MISSING');
  assert.deepEqual(asked.missing[0], { field: 'responsable', question: '¿Cuál Francisco será el responsable?', options: ['Francisco Torres', 'Francisco Villa'] });
  assert.deepEqual(asked.target.taskIds.sort(), ['b4', 'b5']);
  const ready = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], responsable: 'Francisco Villa' }, previous: asked });
  assert.equal(ready.id, asked.id, 'the same action, completed, keeps the lot it resolved');
  assert.equal(actionStage(ready), 'READY');
  assert.deepEqual(ready.payload.items.map((i) => i.taskId).sort(), ['b4', 'b5']);
  assert.equal(ready.payload.assigneeId, 'm-fv');
  await actions.execute({ user: pm, action: ready });
  assert.deepEqual(calls.map(([id, data]) => [id, data]).sort((a, b) => a[0].localeCompare(b[0])), [['b4', { assigneeId: 'm-fv' }], ['b5', { assigneeId: 'm-fv' }]]);
});

test('an ambiguous filter asks whose tasks before resolving anything, and an unknown person is refused with words', async () => {
  const db = fakeDb();
  const { service: actions } = service(db);
  const asked = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { responsable: 'Francisco' }, estado: 'en proceso' } });
  assert.equal(actionStage(asked), 'MISSING');
  assert.equal(asked.missing[0].field, 'filtro.responsable');
  assert.deepEqual(asked.missing[0].options, ['Francisco Torres', 'Francisco Villa']);
  assert.deepEqual(asked.target.taskIds, []);
  await assert.rejects(() => actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { responsable: 'Zutano' }, estado: 'en proceso' } }), { status: 404 });
  await assert.rejects(() => actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], estado: 'en proceso' } }), /Faltan las tareas/);
});

test('a date in bulk is read like in cambiar_pendiente and applied task by task', async () => {
  const db = fakeDb();
  const { service: actions, calls } = service(db);
  const action = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['b1', 'b4'], fecha: '15 de octubre' } });
  assert.equal(actionStage(action), 'READY');
  assert.equal(action.payload.dueDate, '2026-10-15T12:00:00.000Z');
  assert.match(action.summary.join('\n'), /Entrega → 15 de octubre de 2026/);
  const bad = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['b1'], fecha: 'cuando se pueda' } });
  assert.equal(bad.missing[0].field, 'fecha');
  const out = await actions.execute({ user: pm, action });
  assert.deepEqual(calls.map(([id, data]) => [id, data]), [['b1', { dueDate: '2026-10-15T12:00:00.000Z' }], ['b4', { dueDate: '2026-10-15T12:00:00.000Z' }]]);
  assert.match(out.text, /2 tareas cambiaron/);
  // Lo que ya quedó así no falla al volver a ejecutar: se dice «ya estaba».
  const again = await actions.execute({ user: pm, action });
  assert.match(again.text, /ya estaba/);
  assert.equal(calls.length, 2);
});

test('the lot is capped at 50 and the person is told how many there are', async () => {
  const many = Array.from({ length: 60 }, (_, i) => task(`x${i}`, `Tarea ${i}`, { assigneeId: 'm-jar', dueDate: noon(`2026-11-${String((i % 28) + 1).padStart(2, '0')}`) }));
  const db = fakeDb(many);
  const { service: actions } = service(db);
  const action = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { responsable: 'Jarlan' }, responsable: 'Kamila' } });
  assert.equal(action.target.taskIds.length, 50);
  assert.equal(action.payload.items.length, 50);
  assert.match(action.warnings.join('\n'), /60 en total.*50/);
  const byIds = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: many.map((t) => t.id), responsable: 'Kamila' } });
  assert.equal(byIds.target.taskIds.length, 50, 'ids by hand are capped the same way');
});

test('a mixed change (state and owner) lists its changes and skips what is already so; several privates and focus tasks are shortened to five titles', async () => {
  const many = [
    ...Array.from({ length: 7 }, (_, i) => task(`p${i}`, `Privada ${i}`, { assigneeId: 'm-jar', isPrivate: true, creatorId: 'u-pm' })),
    task('k1', 'Ya es de Kamila', { assigneeId: 'm-kam' })
  ];
  const db = fakeDb(many);
  const { service: actions } = service(db);
  const action = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [...many.map((t) => t.id)], responsable: 'Kamila', estado: 'en proceso' } });
  assert.equal(action.payload.status, 'EN_CURSO');
  assert.equal(action.payload.assigneeId, 'm-kam');
  assert.equal(action.payload.items.length, 8, 'k1 still changes state even though it is already Kamila’s');
  assert.match(action.summary[0], /8 tareas cambian/);
  assert.match(action.summary.join('\n'), /Estado → En proceso/);
  const privates = action.warnings.find((w) => /pendientes privados/.test(w));
  assert.match(privates, /«Privada 0», «Privada 1», «Privada 2», «Privada 3», «Privada 4» y 2 más/);
});

test('what is already so is refused as before, and «devuelta» still goes one by one', async () => {
  const db = fakeDb();
  const { service: actions } = service(db);
  await assert.rejects(() => actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['b1'], responsable: 'Jarlan' } }), /No queda ninguna tarea/);
  await assert.rejects(() => actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { responsable: 'Jarlan' }, estado: 'devuelta' } }), /de a una/);
});

/* ------------------------------------------------------------------ Confirmar, por la conversación */

const conversation = (turns, actions) => {
  let stored = { id: 'chat', revision: 1, turns }, aiCalls = 0;
  const repository = { get: async () => stored, append: async (_a, _id, revision, question, result) => {
    if (stored.revision !== revision) throw Object.assign(new Error('Stale'), { status: 409 });
    const reply = typeof result === 'function' ? await result() : result;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const service = createBriaConversationService({ repository, actions, resolveActor: async () => ({ ref: 'u-pm', role: 'PROJECT_MANAGER' }), assistant: { ask: async () => { aiCalls++; return { answer: 'Respuesta', sources: [] }; } } });
  return { service, get stored() { return stored; }, get aiCalls() { return aiCalls; } };
};

test('«Confirmar» on the previous answer runs the lot task by task through updateTask, never updateMany; a loose «confirmar» on an old turn runs nothing', async () => {
  const db = fakeDb();
  const { service: actions, calls } = service(db);
  const action = await actions.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: [], filtro: { sinResponsable: true }, responsable: 'Kamila' } });
  const fresh = conversation([{ role: 'assistant', text: actionReply(action).answer, pendingAction: action }], actions);
  await fresh.service.send({ user: pm, id: 'chat', question: 'Confirmar' });
  assert.deepEqual(calls.map(([id, data, by]) => [id, data, by]).sort((a, b) => a[0].localeCompare(b[0])), [['b4', { assigneeId: 'm-kam' }, 'u-pm'], ['b5', { assigneeId: 'm-kam' }, 'u-pm']]);
  assert.equal(fresh.stored.turns.at(-1).pendingAction.status, 'DONE');
  assert.match(fresh.stored.turns.at(-1).answer, /2 tareas cambiaron/);
  const stale = conversation([{ role: 'assistant', text: '¿Lo hago así?', pendingAction: action }, { role: 'user', text: 'Otra cosa' }, { role: 'assistant', text: 'Te respondo otra cosa' }], actions);
  await stale.service.send({ user: pm, id: 'chat', question: 'Confirmar' });
  assert.equal(calls.length, 2, 'nothing else ran');
  assert.equal(stale.aiCalls, 1);
});

/* ------------------------------------------------------------------ Lo que ve el modelo */

test('the tool declares the filter, 50 items, owner and date, and Bria is told when to use the filter and when to count', () => {
  const tools = createBriaActionTools({ prepare: async () => ({}) });
  const bulk = tools.find((t) => t.name === 'cambiar_pendientes');
  assert.equal(bulk.parameters.properties.tareas.maxItems, 50);
  assert.deepEqual(Object.keys(bulk.parameters.properties.filtro.properties).sort(), ['cliente', 'estado', 'responsable', 'sinResponsable', 'vencidas']);
  assert.ok(bulk.parameters.properties.responsable, 'owner in bulk');
  assert.ok(bulk.parameters.properties.fecha, 'date in bulk');
  assert.match(bulk.description, /hasta 50/);
  const search = toolByName('buscar_pendientes');
  assert.deepEqual(Object.keys(search.parameters.properties).sort(), ['cliente', 'estado', 'responsable', 'sinResponsable', 'vencidas']);
  const text = buildInstructions({ person: { name: 'Rodny' }, today: TODAY, tools: [...tools, search] });
  assert.match(text, /cambiar_pendientes con filtro/);
  assert.match(text, /sin pedirle ids/);
  assert.match(text, /buscar_pendientes/);
  assert.equal(toolProgressLabel('buscar_pendientes'), 'Buscando pendientes…');
});
