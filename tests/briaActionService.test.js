import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaActionService, ACTION_PERMISSION } from '../src/services/briaActionService.js';
import { createBriaActionTools } from '../src/services/briaActionTools.js';
import { actionStage, actionReply } from '../src/lib/briaActions.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

// Las acciones de Bria en la plataforma (10 de octubre de 2026): cambiar un pendiente y crear una parrilla.
// Preparar deduce, pregunta de a una cosa y resume; ejecutar pasa por las mismas vías que la pantalla.
// Datos inventados.

const NOW = () => new Date('2026-10-09T15:00:00.000Z'); // viernes 9 de octubre, 10:00 de Bogotá
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true } };
const noon = (key) => new Date(`${key}T12:00:00.000Z`);

const fakeDb = () => {
  const tasks = [
    { id: 't1', title: 'Reel de lanzamiento', status: 'PENDIENTE', dueDate: noon('2026-10-14'), priority: 'NORMAL', isPriority: false, creatorId: 'u-pm', isPrivate: false, client: { name: 'Aristea' }, assignee: { id: 'm1', name: 'Melissa Castaño', userId: 'u-mel' }, collaborators: [], viewers: [] },
    { id: 't2', title: 'Carrusel con equipo', status: 'PENDIENTE', dueDate: null, priority: null, isPriority: false, creatorId: 'u-otro', isPrivate: false, client: { name: 'Nattal' }, assignee: { id: 'm2', name: 'Brayan', userId: 'u-bra' }, collaborators: [{ member: { userId: 'u-mel', name: 'Melissa Castaño' } }], viewers: [] },
    { id: 't3', title: 'Informe cerrado', status: 'REALIZADA', dueDate: null, priority: null, isPriority: false, creatorId: 'u-otro', isPrivate: false, client: { name: 'Nattal' }, assignee: null, collaborators: [], viewers: [] },
    { id: 't4', title: 'Reservado', status: 'PENDIENTE', dueDate: null, priority: null, isPriority: false, creatorId: 'u-rodny', isPrivate: true, client: null, assignee: { id: 'm3', name: 'Helen', userId: 'u-hel' }, collaborators: [], viewers: [] }
  ];
  const members = [{ id: 'm1', name: 'Melissa Castaño', email: 'melissa@brain.test', isActive: true }, { id: 'm4', name: 'Melissa Rojas', email: 'mrojas@brain.test', isActive: true }, { id: 'm2', name: 'Brayan', email: 'brayan@brain.test', isActive: true }];
  const plans = [{ id: 'p-sep', clientId: 'c1', month: 9, year: 2026, deletedAt: null, strategicObjectives: 'Posicionar la nueva línea de vinos' }];
  return {
    tasks, plans,
    task: { findUnique: async ({ where }) => tasks.find((t) => t.id === where.id) || null, findMany: async ({ where }) => tasks.filter((t) => where.id.in.includes(t.id)), findFirst: async () => null },
    teamMember: { findMany: async ({ where }) => members.filter((m) => where.OR.some((c) => (c.name && m.name.toLowerCase().includes(c.name.contains.toLowerCase())) || (c.email && m.email === c.email.equals))) },
    client: { findUnique: async ({ where }) => where.id === 'c1' ? { id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false, responsible: { id: 'm1', name: 'Melissa Castaño' }, projectManager: { id: 'm2', name: 'Brayan' } } : where.id === 'c9' ? { id: 'c9', name: 'Viejo', slug: 'viejo', isArchived: true, responsible: null, projectManager: null } : null },
    contentPlan: { findFirst: async ({ where }) => {
      if (where.month) return plans.find((p) => p.clientId === where.clientId && p.month === where.month && p.year === where.year && !p.deletedAt) || null;
      return plans.filter((p) => p.clientId === where.clientId && p.strategicObjectives).sort((a, b) => b.year - a.year || b.month - a.month)[0] || null;
    } }
  };
};

test('changing a task: it resolves people and dates, says what changes, warns about good practice, and never writes', async () => {
  const db = fakeDb();
  const service = createBriaActionService({ db, updateTask: async () => { throw new Error('No debe escribir'); }, now: NOW });
  const action = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', estado: 'realizada', responsable: 'Brayan', fecha: 'lunes', prioridad: 'alta' } });
  assert.equal(actionStage(action), 'READY');
  assert.deepEqual(action.payload, { status: 'REALIZADA', assigneeId: 'm2', dueDate: '2026-10-12T12:00:00.000Z', priority: 'ALTA', isPriority: true });
  assert.match(action.summary[0], /Reel de lanzamiento.*Aristea.*Pendiente, de Melissa Castaño/);
  assert.match(action.summary.join('\n'), /Estado: Pendiente → Realizada/);
  assert.match(action.summary.join('\n'), /Responsable: Melissa Castaño → Brayan/);
  assert.match(action.summary.join('\n'), /Entrega: .*14 de octubre.* → .*12 de octubre/);
  assert.match(action.summary.join('\n'), /Prioridad: normal → alta/);
  assert.match(action.warnings[0], /No pasó por «En proceso»/, 'closing without the clock is said, not forbidden');
  const reply = actionReply(action);
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
});

test('an ambiguous name becomes a question with options; a reply continues the same action', async () => {
  const db = fakeDb();
  const service = createBriaActionService({ db, updateTask: async () => {}, now: NOW });
  const first = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', responsable: 'Melissa' } });
  assert.equal(actionStage(first), 'MISSING');
  assert.deepEqual(first.missing[0], { field: 'responsable', question: '¿Cuál Melissa?', options: ['Melissa Castaño', 'Melissa Rojas'] });
  const second = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', responsable: 'Melissa Rojas' }, previous: first });
  assert.equal(second.id, first.id, 'the same action, completed');
  assert.equal(second.payload.assigneeId, 'm4');
  assert.equal(actionStage(second), 'READY');
});

test('returning or reopening asks for the reason and the note, one at a time, and the reason maps to the catalog', async () => {
  const db = fakeDb();
  const service = createBriaActionService({ db, updateTask: async () => {}, now: NOW });
  const devolver = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', estado: 'devuelta' } });
  assert.deepEqual(devolver.missing.map((m) => m.field), ['motivo', 'nota']);
  assert.ok(devolver.missing[0].options.includes('Faltan insumos o referencias'));
  const withReason = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', motivo: 'Faltan insumos o referencias' }, previous: devolver });
  assert.deepEqual(withReason.missing.map((m) => m.field), ['nota']);
  const ready = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', nota: 'Falta el logo en alta.' }, previous: withReason });
  assert.deepEqual(ready.payload, { status: 'DEVUELTA', returnReason: 'MISSING_INPUTS', returnNote: 'Falta el logo en alta.' });
  const reabrir = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't3', estado: 'pendiente', motivo: 'Error interno', nota: 'Se cerró por error.' } });
  assert.deepEqual(reabrir.payload, { status: 'PENDIENTE', reopenReason: 'INTERNAL_ERROR', reopenNote: 'Se cerró por error.' });
});

test('the same gate as the screen: a private task, a collaborator-only move and nothing to change are refused with words', async () => {
  const db = fakeDb();
  const service = createBriaActionService({ db, updateTask: async () => {}, now: NOW });
  await assert.rejects(() => service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't4', estado: 'en proceso' } }), /privado que no puedes abrir/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', estado: 'pendiente' } }), /ya está así/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 'nada', estado: 'en proceso' } }), { status: 404 });
  await assert.rejects(() => service.prepare({ user: { ...pm, modulePermissions: { bria: true, parrillas: true } }, type: 'TASK_UPDATE', args: { tarea: 't1', estado: 'en proceso' } }), { status: 403 });
  const melissa = { userId: 'u-mel', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const team = await service.prepare({ user: melissa, type: 'TASK_UPDATE', args: { tarea: 't2', estado: 'en proceso' } });
  assert.match(team.warnings[0], /ningún reloj arranca solo/);
});

test('executing changes the task through updateTask once the gate agrees, and never a draft that is missing something', async () => {
  const db = fakeDb();
  const calls = [];
  const service = createBriaActionService({ db, updateTask: async (id, data, by) => { calls.push([id, data, by]); }, now: NOW });
  const action = await service.prepare({ user: pm, type: 'TASK_UPDATE', args: { tarea: 't1', estado: 'en proceso' } });
  await assert.rejects(() => service.execute({ user: { ...pm, userId: 'otro' }, action }), /otra persona/);
  await assert.rejects(() => service.execute({ user: pm, action: { ...action, missing: [{ field: 'x', question: '?' }] } }), /completa la acción/);
  const out = await service.execute({ user: pm, action });
  assert.deepEqual(calls, [['t1', { status: 'EN_CURSO' }, 'u-pm']]);
  assert.match(out.text, /Listo: cambié «Reel de lanzamiento»/);
  assert.match(out.text, /\/gestion\?taskId=t1/);
  assert.deepEqual(out.sources[0], { kind: 'tarea', id: 't1', label: 'Reel de lanzamiento', url: '/gestion?taskId=t1' });
});

test('creating a grid asks for the owner and the strategic objective, proposing the client’s people and last month’s objective', async () => {
  const db = fakeDb();
  const writes = [];
  const service = createBriaActionService({ db, createContentPlan: async (data) => { writes.push(['create', data]); db.plans.push({ id: 'p-nov', ...data, deletedAt: null }); return { id: 'p-nov' }; }, updateContentPlan: async (id, data) => { writes.push(['update', id, data]); }, now: NOW });
  const first = await service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1', mes: 'noviembre' } });
  assert.equal(actionStage(first), 'MISSING');
  assert.deepEqual(first.missing[0], { field: 'responsable', question: '¿Quién será el responsable de la parrilla?', options: ['Melissa Castaño', 'Brayan'] });
  assert.match(first.missing[1].question, /objetivo estratégico/);
  assert.deepEqual(first.missing[1].options, ['El mismo de septiembre: Posicionar la nueva línea de vinos']);
  assert.deepEqual([first.target.month, first.target.year], [11, 2026]);
  const second = await service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1', responsable: 'Brayan' }, previous: first });
  assert.deepEqual(second.missing.map((m) => m.field), ['objetivo']);
  const ready = await service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1', objetivo: 'El mismo de septiembre: Posicionar la nueva línea de vinos' }, previous: second });
  assert.equal(actionStage(ready), 'READY');
  assert.equal(ready.payload.strategicObjectives, 'Posicionar la nueva línea de vinos');
  assert.match(ready.summary.join('\n'), /Responsable: Brayan/);
  assert.equal(writes.length, 0, 'preparing never writes');
  const out = await service.execute({ user: pm, action: ready });
  assert.deepEqual(writes, [['create', { clientId: 'c1', month: 11, year: 2026, strategicObjectives: 'Posicionar la nueva línea de vinos' }], ['update', 'p-nov', { ownerId: 'm2' }]]);
  assert.match(out.text, /creé la parrilla de \*\*Aristea\*\* para noviembre de 2026, con Brayan como responsable/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1', mes: '11' } }), /ya tiene parrilla de noviembre/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c9', mes: 'noviembre' } }), /archivado/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1' } }), /qué mes/);
  const january = await service.prepare({ user: pm, type: 'CREATE_PLAN', args: { clientId: 'c1', mes: 'enero', responsable: 'Brayan', objetivo: 'Arrancar el año' } });
  assert.equal(january.target.year, 2027, 'a month already past this year means next year');
});

test('the tools only prepare, open with the module of their screen, and Bria is told never to claim the change', async () => {
  const tools = createBriaActionTools({ prepare: async ({ type, args }) => ({ id: 'a', ownerId: 'u-pm', type, status: 'DRAFT', title: 'x', summary: [], warnings: [], missing: args.estado ? [] : [{ field: 'estado', question: '¿Qué cambio?' }] }) });
  assert.deepEqual(tools.map((t) => t.name), ['cambiar_pendiente', 'crear_parrilla', 'cambiar_pendientes', 'crear_pieza', 'mover_pieza', 'registrar_observacion']);
  assert.deepEqual(ACTION_PERMISSION, { TASK_UPDATE: 'gestion', TASKS_STATUS: 'gestion', CREATE_PLAN: 'parrillas', CREATE_ITEM: 'parrillas', MOVE_ITEM: 'parrillas', CLIENT_NOTE: 'clientes' });
  assert.equal(tools[5].allowed({ ...pm, modulePermissions: { bria: true, clientes: true } }), true);
  assert.equal(tools[5].allowed(pm), false, 'an observation needs the Clientes module');
  assert.equal(tools[0].allowed({ ...pm, modulePermissions: { bria: true, parrillas: true } }), false);
  assert.equal(tools[1].allowed({ ...pm, modulePermissions: { bria: true, parrillas: true } }), true);
  assert.equal(tools[0].allowed({ ...pm, role: 'EDITOR' }), false, 'Bria is for admins and project managers');
  const out = await tools[0].run({ tarea: 't1', estado: 'en proceso' }, { user: pm, pendingAction: null });
  assert.equal(out.data.done, false);
  assert.equal(out.data.stage, 'READY');
  assert.deepEqual(out.quickReplies, ['Confirmar', 'Cancelar']);
  assert.equal(createBriaActionTools(null).length, 0);
  const text = buildInstructions({ person: { name: 'Kamila', jobTitle: 'PM' }, today: '2026-10-10', tools });
  assert.match(text, /Nunca digas que cambiaste o creaste algo/);
  assert.match(text, /«Confirmar» sobre el resumen/);
  assert.match(text, /cambiar_pendientes para varias a la vez/);
});

// Las cuatro acciones que siguieron (10 de octubre de 2026, «sigue con las acciones que vienen, todas»).
const planDb = () => {
  const db = fakeDb();
  const plan = { id: 'p-oct', clientId: 'c1', month: 10, year: 2026, status: 'ACTIVO', deletedAt: null, client: { id: 'c1', name: 'Aristea', isArchived: false }, contentItems: [{ id: 'i1', objective: 'Lanzamiento', format: 'Reel', publishDate: noon('2026-10-14') }] };
  const items = [
    { id: 'i1', objective: 'Lanzamiento', format: 'Reel', status: 'APROBADO', publishDate: noon('2026-10-14'), publishTime: '18:00', planId: 'p-oct', plan: { month: 10, year: 2026, status: 'ACTIVO', client: { name: 'Aristea', isArchived: false } }, publications: [{ status: 'SCHEDULED' }], deletedAt: null },
    { id: 'i2', objective: 'Ya salió', format: 'Post', status: 'PUBLICADO', publishDate: noon('2026-10-02'), publishTime: null, planId: 'p-oct', plan: { month: 10, year: 2026, status: 'ACTIVO', client: { name: 'Aristea', isArchived: false } }, publications: [], deletedAt: null }
  ];
  db.contentPlan.findFirst = async ({ where }) => {
    if (where.id) return where.id === 'p-oct' ? plan : null;
    if (where.month) return where.clientId === 'c1' && where.month === 10 && where.year === 2026 ? plan : null;
    return null;
  };
  db.contentItem = { findFirst: async ({ where }) => items.find((i) => i.id === where.id) || null };
  return db;
};

test('several tasks at once: the same gate per task, what cannot change is said, and each one goes through updateTask', async () => {
  const db = fakeDb();
  const calls = [];
  const service = createBriaActionService({ db, updateTask: async (id, data) => { calls.push([id, data]); }, now: NOW });
  const asked = await service.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['t1', 't2'] } });
  assert.deepEqual(asked.missing[0].options, ['En proceso', 'Realizada', 'Pendiente']);
  const action = await service.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['t3', 't4', 'nada'], estado: 'realizada' }, previous: asked });
  assert.equal(action.id, asked.id);
  assert.deepEqual(action.payload.items.map((i) => i.taskId), ['t1', 't2'], 'closed, private and missing tasks are left out');
  assert.match(action.warnings[0], /Informe cerrado \(Ya está realizada\.\)/);
  assert.match(action.warnings[0], /Reservado \(Es un pendiente privado/);
  assert.match(action.warnings[0], /Pendiente \(Ya no existe\.\)/);
  assert.match(action.warnings[1], /2 de ellas no pasaron por «En proceso»/);
  assert.equal(actionStage(action), 'READY');
  await assert.rejects(() => service.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['t1'], estado: 'devuelta' } }), /de a una/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'TASKS_STATUS', args: { tareas: ['t3'], estado: 'realizada' } }), /No queda ninguna tarea/);
  const out = await service.execute({ user: pm, action });
  assert.deepEqual(calls, [['t1', { status: 'REALIZADA' }], ['t2', { status: 'REALIZADA' }]]);
  assert.match(out.text, /2 tareas pasaron a Realizada/);
  assert.equal(out.sources.length, 2);
});

test('a new piece asks for objective, format and day, warns about a crowded day, and is created in draft at noon UTC', async () => {
  const db = planDb();
  const created = [];
  const service = createBriaActionService({ db, createContentItem: async (data) => { created.push(data); return { id: 'i-new', ...data }; }, now: NOW });
  const first = await service.prepare({ user: pm, type: 'CREATE_ITEM', args: { clientId: 'c1', mes: 'octubre' } });
  assert.equal(first.target.planId, 'p-oct');
  assert.deepEqual(first.missing.map((m) => m.field), ['objetivo', 'formato', 'fecha']);
  assert.deepEqual(first.missing[1].options, ['Reel', 'Carrusel', 'Post', 'Video', 'Historia']);
  const placeholder = await service.prepare({ user: pm, type: 'CREATE_ITEM', args: { planId: 'p-oct', objetivo: 'Nuevo Objetivo', formato: 'reel', fecha: '14 de octubre' }, previous: first });
  assert.equal(placeholder.missing[0].field, 'objetivo', '«Nuevo Objetivo» is not an objective');
  assert.match(placeholder.warnings[0], /Ese día ya hay una pieza \(Lanzamiento\)/);
  const ready = await service.prepare({ user: pm, type: 'CREATE_ITEM', args: { planId: 'p-oct', objetivo: 'Mostrar la cava en 15 segundos', hora: '18:30' }, previous: placeholder });
  assert.equal(actionStage(ready), 'READY');
  assert.deepEqual(ready.payload, { planId: 'p-oct', objective: 'Mostrar la cava en 15 segundos', format: 'Reel', day: '2026-10-14', publishTime: '18:30' });
  const out = await service.execute({ user: pm, action: ready });
  assert.deepEqual(created[0], { planId: 'p-oct', objective: 'Mostrar la cava en 15 segundos', format: 'Reel', copyText: '', captionText: '', publishDate: noon('2026-10-14'), status: 'BORRADOR', publishTime: '18:30' });
  assert.match(out.text, /\/parrillas\/p-oct\?item=i-new/);
  const outside = await service.prepare({ user: pm, type: 'CREATE_ITEM', args: { planId: 'p-oct', objetivo: 'Cierre de mes', formato: 'Post', fecha: '2026-11-02' } });
  assert.match(outside.warnings[0], /fuera de octubre/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'CREATE_ITEM', args: { clientId: 'c1', mes: 'diciembre', objetivo: 'x' } }), /no tiene parrilla de diciembre/);
});

test('moving a piece: never a published one, warns about scheduled posts, past dates and approved pieces, and goes through updateContentItem', async () => {
  const db = planDb();
  const updates = [];
  const service = createBriaActionService({ db, updateContentItem: async (id, data) => { updates.push([id, data]); }, now: NOW });
  await assert.rejects(() => service.prepare({ user: pm, type: 'MOVE_ITEM', args: { pieza: 'i2', fecha: 'lunes' } }), /ya se publicó/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'MOVE_ITEM', args: { pieza: 'i1', fecha: '14 de octubre' } }), /nada que mover/);
  const asked = await service.prepare({ user: pm, type: 'MOVE_ITEM', args: { pieza: 'i1' } });
  assert.equal(asked.missing[0].field, 'fecha');
  const action = await service.prepare({ user: pm, type: 'MOVE_ITEM', args: { pieza: 'i1', fecha: '2026-10-07' }, previous: asked });
  assert.deepEqual(action.payload, { itemId: 'i1', day: '2026-10-07' });
  assert.match(action.summary[1], /se conserva la hora 18:00/);
  assert.match(action.warnings.join('\n'), /fecha pasada/);
  assert.match(action.warnings.join('\n'), /publicación programada en redes/);
  assert.match(action.warnings.join('\n'), /El cliente ya la aprobó/);
  const out = await service.execute({ user: pm, action });
  assert.deepEqual(updates, [['i1', { publishDate: '2026-10-07' }]]);
  assert.match(out.text, /sale ahora el .*7 de octubre/);
  const withHour = await service.prepare({ user: pm, type: 'MOVE_ITEM', args: { pieza: 'i1', fecha: '2026-10-21', hora: '09:00' } });
  assert.deepEqual(withHour.payload, { itemId: 'i1', day: '2026-10-21', publishTime: '09:00' });
});

test('a client observation asks for the text, keeps it short and is saved with the author', async () => {
  const db = planDb();
  const saved = [];
  const manager = { ...pm, modulePermissions: { bria: true, clientes: true } };
  const service = createBriaActionService({ db, addObservation: async (input) => { saved.push(input); return { id: 'o1' }; }, now: NOW });
  const asked = await service.prepare({ user: manager, type: 'CLIENT_NOTE', args: { clientId: 'c1' } });
  assert.match(asked.missing[0].question, /Qué observación dejo anotada en la ficha de Aristea/);
  const ready = await service.prepare({ user: manager, type: 'CLIENT_NOTE', args: { clientId: 'c1', texto: '  El cliente prefiere que todo pase por Laura, no por el gerente.  ' }, previous: asked });
  assert.equal(actionStage(ready), 'READY');
  assert.match(ready.summary[1], /«El cliente prefiere que todo pase por Laura, no por el gerente\.»/);
  await assert.rejects(() => service.prepare({ user: manager, type: 'CLIENT_NOTE', args: { clientId: 'c1', texto: 'x'.repeat(2001) } }), /pártela en dos/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'CLIENT_NOTE', args: { clientId: 'c1', texto: 'hola' } }), { status: 403 });
  const out = await service.execute({ user: manager, action: ready });
  assert.deepEqual(saved, [{ clientId: 'c1', text: 'El cliente prefiere que todo pase por Laura, no por el gerente.', actorUserId: 'u-pm' }]);
  assert.match(out.text, /\/clientes\/operacion\/aristea/);
});
