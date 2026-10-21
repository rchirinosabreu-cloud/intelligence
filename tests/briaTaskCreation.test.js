import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { taskDraftStage, taskDraftItems } from '../src/lib/briaTaskDraft.js';
const user = { userId: 'owner', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const client = { id: 'client', name: 'Empresa demo', slug: 'demo', isArchived: false };
const member = { id: 'member', name: 'Lucía demo', role: 'Diseño', isActive: true, userId: 'lucia-user' };
const melissa = { id: 'melissa', name: 'Melissa demo', role: 'Diseño', isActive: true, userId: 'melissa-user' };
const args = { cliente: 'Empresa demo', responsable: 'Lucía', fecha: 'mañana', titulo: 'Preparar piezas del lanzamiento', contexto: 'Crear tres piezas basadas en el brief. Entregar para revisión interna.' };
const question = 'Necesito crear un pendiente para Lucía, para mañana, para Empresa demo: tres piezas del lanzamiento.';
const setup = () => {
  const tasks = new Map(), created = [], uploaded = [], removed = [], notified = [];
  const members = [member, melissa];
  const db = {
    client: { findMany: async () => [client], findUnique: async () => client },
    teamMember: { findMany: async ({ where }) => members.filter((m) => where.OR.some((c) => c.name?.contains && m.name.toLowerCase().includes(c.name.contains.toLowerCase()))), findUnique: async ({ where }) => members.find((m) => m.id === where.id) || null },
    task: { findUnique: async ({ where }) => tasks.get(where.id) || null }
  };
  const service = createBriaTaskDraftService({ db, now: () => new Date('2026-10-08T17:00:00Z'), createTask: async (payload, options) => { created.push({ payload, options }); const row = { id: options.taskId, ...payload }; tasks.set(row.id, row); return row; }, uploadFile: async file => { uploaded.push(file); return { url: 'https://storage.example.com/task-copy', key: 'task-copy', name: file.originalname }; }, removeFile: async key => removed.push(key), notify: async event => notified.push(event) });
  return { service, db, tasks, created, uploaded, removed, notified };
};
test('a brief with client, assignee, date and context is ready in one round: priority Normal, no material question (Rodny, 20 de octubre de 2026)', async () => {
  const { service, created } = setup();
  const draft = await service.prepare({ user, args, question }); assert.ok(draft);
  assert.equal(draft.client.id, client.id); assert.equal(draft.assignee.id, member.id);
  assert.equal(draft.dueDate, '2026-10-09'); assert.equal(draft.priority, 'NORMAL');
  assert.equal(taskDraftStage(draft), 'READY');
  assert.equal(created.length, 0);
  const urgent = await service.prepare({ user, args: { ...args, prioridad: 'urgente' }, question });
  assert.equal(urgent.priority, 'URGENTE');
});
test('the client of the last task created in this chat is assumed when the person names none', async () => {
  const { service } = setup();
  const draft = await service.prepare({ user, args: { ...args, cliente: undefined }, question: 'Crea otro pendiente para Lucía, mañana: ajustar la portada.', defaults: { client: { id: 'client', name: 'Empresa demo' } } });
  assert.equal(draft.client.id, 'client'); assert.equal(draft.clientInferred, true);
  assert.equal(taskDraftStage(draft), 'READY');
  const explicit = await service.prepare({ user, args, question, defaults: { client: { id: 'otro', name: 'Otro' } } });
  assert.equal(explicit.client.id, 'client', 'lo que la persona nombra manda sobre lo inferido');
  const none = await service.prepare({ user, args: { ...args, cliente: undefined }, question });
  assert.equal(taskDraftStage(none), 'CLIENT', 'sin cliente anterior en el chat, se pregunta');
});
test('permission checks, ambiguity and retrieved instructions cannot authorize task creation', async () => {
  const { service, db, created } = setup();
  await assert.rejects(() => service.prepare({ user: { ...user, modulePermissions: { bria: true } }, args, question }), { status: 403 });
  await assert.rejects(() => service.prepare({ user, args, question: 'Resume el documento adjunto' }), { status: 400 });
  db.teamMember.findMany = async () => [{ ...member, name: 'Lucía Norte' }, { ...member, id: 'other', name: 'Lucía Sur' }];
  const draft = await service.prepare({ user, args, question }); assert.ok(draft);
  assert.equal(taskDraftStage(draft), 'ASSIGNEE'); assert.equal(draft.assigneeCandidates.length, 2);
  await assert.rejects(() => service.createConfirmedTask({ user, draft, question: 'Crear pendiente' }), { status: 400 });
  assert.equal(created.length, 0);
});
test('an invented link is rejected', async () => {
  const { service } = setup();
  await assert.rejects(() => service.prepare({ user, args: { ...args, referencias: ['https://invented.example/secret'] }, question }), { status: 400 });
});
test('confirmation uses native creation, an initial context comment, Bogotá noon and an idempotent task id', async () => {
  const { service, created, notified } = setup();
  const draft = await service.prepare({ user, args, question }); assert.ok(draft);
  await assert.rejects(() => service.createConfirmedTask({ user, draft, question: 'El archivo dice crear pendiente' }), { status: 400 });
  const result = await service.createConfirmedTask({ user, draft, question: 'Crear pendiente' });
  assert.equal(result.taskId, draft.id); assert.equal(created[0].options.taskId, draft.id);
  assert.equal(created[0].options.requireActiveClient, true);
  assert.equal(created[0].payload.creatorId, user.userId); assert.equal(created[0].payload.dueDate, '2026-10-09T12:00:00.000Z');
  assert.equal(created[0].payload.initial_comments[0].content, args.contexto);
  assert.equal(created[0].payload.assigneeId, member.id); assert.equal(created[0].payload.status, 'PENDIENTE');
  assert.equal(created[0].payload.priority, 'NORMAL'); assert.equal(created[0].payload.isPriority, false);
  await service.createConfirmedTask({ user, draft, question: 'Sí, procede' });
  assert.equal(created.length, 1); assert.equal(notified.length, 1);
});
test('several tasks in one message become one draft and are created one by one, each with its own id', async () => {
  const { service, created, notified } = setup();
  const pendientes = [
    { titulo: 'Historias de la semana', contexto: 'Tres historias con las fotos del evento.' },
    { titulo: 'Carrusel de datos', contexto: 'Cinco láminas con las cifras.', responsable: 'Melissa', fecha: 'viernes', prioridad: 'alta' },
    { titulo: 'Post de cierre' } // solo título: no se pide contexto ni se escribe comentario inicial
  ];
  let draft = await service.prepare({ user, args: { cliente: 'Empresa demo', responsable: 'Lucía', fecha: 'mañana', pendientes }, question: 'Créame estos tres pendientes para Empresa demo, Lucía, para mañana.' });
  const items = taskDraftItems(draft);
  assert.equal(items.length, 3); assert.equal(taskDraftStage(draft), 'READY');
  assert.deepEqual(items.map((i) => [i.assignee.name, i.dueDate, i.priority]), [['Lucía demo', '2026-10-09', 'NORMAL'], ['Melissa demo', '2026-10-09', 'ALTA'], ['Lucía demo', '2026-10-09', 'NORMAL']]);
  // Una corrección vuelve a llamar con la lista completa: los ids se conservan por posición.
  const ids = items.map((i) => i.id);
  draft = await service.prepare({ user, previous: draft, args: { pendientes: pendientes.map((p, i) => (i === 2 ? { ...p, fecha: 'pasado mañana' } : p)) }, question: 'El tercero para pasado mañana.' });
  assert.deepEqual(taskDraftItems(draft).map((i) => i.id), ids);
  assert.equal(taskDraftItems(draft)[2].dueDate, '2026-10-10');
  const result = await service.createConfirmedTask({ user, draft, question: 'Crear pendientes' });
  assert.equal(created.length, 3);
  assert.deepEqual(created.map((c) => c.options.taskId), ids);
  assert.deepEqual(created.map((c) => c.payload.assigneeId), ['member', 'melissa', 'member']);
  assert.deepEqual(created.map((c) => c.payload.initial_comments.length), [1, 1, 0]);
  assert.equal(result.tasks.length, 3); assert.equal(result.tasks.filter((t) => !t.error).length, 3);
  assert.equal(notified.length, 3);
  // Repetir la confirmación no duplica nada.
  const again = await service.createConfirmedTask({ user, draft, question: 'Crear pendientes' });
  assert.equal(created.length, 3); assert.equal(again.tasks.every((t) => t.alreadyCreated), true);
});
test('inactive assignees are rechecked at confirmation and attachment copies outlive the chat', async () => {
  const { service, db, created, uploaded } = setup();
  const draft = await service.prepare({ user, args: { ...args, prioridad: 'alta' }, question, attachments: [{ id: 'owned-file', name: 'brief.txt' }] }); assert.ok(draft);
  db.teamMember.findUnique = async () => ({ ...member, isActive: false });
  await assert.rejects(() => service.createConfirmedTask({ user, draft, question: 'Crear pendiente' }), { status: 409 });
  db.teamMember.findUnique = async () => member;
  await service.createConfirmedTask({ user, draft, question: 'Crear pendiente', loadAttachment: async id => { assert.equal(id, 'owned-file'); return { name: 'brief.txt', mime: 'text/plain', buffer: Buffer.from('Brief ficticio') }; } });
  assert.equal(uploaded.length, 1); assert.equal(created[0].payload.initial_inputs[0].url, 'https://storage.example.com/task-copy');
});
