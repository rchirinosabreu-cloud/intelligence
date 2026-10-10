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
    task: { findUnique: async ({ where }) => tasks.find((t) => t.id === where.id) || null, findFirst: async () => null },
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
  assert.deepEqual(tools.map((t) => t.name), ['cambiar_pendiente', 'crear_parrilla']);
  assert.deepEqual(ACTION_PERMISSION, { TASK_UPDATE: 'gestion', CREATE_PLAN: 'parrillas' });
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
});
