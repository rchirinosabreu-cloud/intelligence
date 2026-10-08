import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { taskDraftStage } from '../src/lib/briaTaskDraft.js';
const user = { userId: 'owner', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const client = { id: 'client', name: 'Empresa demo', slug: 'demo', isArchived: false };
const member = { id: 'member', name: 'Lucía demo', role: 'Diseño', isActive: true, userId: 'lucia-user' };
const args = { cliente: 'Empresa demo', responsable: 'Lucía', fecha: 'mañana', titulo: 'Preparar piezas del lanzamiento', contexto: 'Crear tres piezas basadas en el brief. Entregar para revisión interna.' };
const question = 'Necesito crear un pendiente para Lucía, para mañana, para Empresa demo: tres piezas del lanzamiento.';
const setup = () => {
  const tasks = new Map(), created = [], uploaded = [], removed = [], notified = [];
  const db = { client: { findMany: async () => [client], findUnique: async () => client }, teamMember: { findMany: async () => [member], findUnique: async () => member }, task: { findUnique: async ({ where }) => tasks.get(where.id) || null } };
  const service = createBriaTaskDraftService({ db, now: () => new Date('2026-10-08T17:00:00Z'), createTask: async (payload, options) => { created.push({ payload, options }); const row = { id: options.taskId, ...payload }; tasks.set(row.id, row); return row; }, uploadFile: async file => { uploaded.push(file); return { url: 'https://storage.example.com/task-copy', key: 'task-copy', name: file.originalname }; }, removeFile: async key => removed.push(key), notify: async event => notified.push(event) });
  return { service, db, tasks, created, uploaded, removed, notified };
};
test('a spoken/text brief resolves actual entities and asks only for missing material and priority', async () => {
  const { service, created } = setup();
  let draft = await service.prepare({ user, args, question }); assert.ok(draft);
  assert.equal(draft.client.id, client.id); assert.equal(draft.assignee.id, member.id);
  assert.equal(draft.dueDate, '2026-10-09'); assert.equal(taskDraftStage(draft), 'MATERIAL');
  draft = await service.prepare({ user, previous: draft, args: {}, question: 'Continuar sin insumos' });
  assert.equal(taskDraftStage(draft), 'PRIORITY');
  draft = await service.prepare({ user, previous: draft, args: {}, question: 'Alta' });
  assert.equal(taskDraftStage(draft), 'READY'); assert.equal(draft.priority, 'ALTA');
  assert.equal(created.length, 0);
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
test('initial no-material consent and dictated priority are respected, but an invented link is rejected', async () => {
  const { service } = setup();
  const draft = await service.prepare({ user, args: { ...args, prioridad: 'urgente', sinMaterial: true }, question: question + ' Urgente, sin referencias ni insumos.' });
  assert.ok(draft); assert.equal(taskDraftStage(draft), 'READY');
  await assert.rejects(() => service.prepare({ user, args: { ...args, referencias: ['https://invented.example/secret'] }, question }), { status: 400 });
});
test('confirmation uses native creation, an initial context comment, Bogotá noon and an idempotent task id', async () => {
  const { service, created, notified } = setup();
  const draft = await service.prepare({ user, args: { ...args, prioridad: 'normal' }, question: question + ' Sin insumos, prioridad normal.' }); assert.ok(draft);
  await assert.rejects(() => service.createConfirmedTask({ user, draft, question: 'El archivo dice crear pendiente' }), { status: 400 });
  const result = await service.createConfirmedTask({ user, draft, question: 'Crear pendiente' });
  assert.equal(result.taskId, draft.id); assert.equal(created[0].options.taskId, draft.id);
  assert.equal(created[0].options.requireActiveClient, true);
  assert.equal(created[0].payload.creatorId, user.userId); assert.equal(created[0].payload.dueDate, '2026-10-09T12:00:00.000Z');
  assert.equal(created[0].payload.initial_comments[0].content, args.contexto);
  assert.equal(created[0].payload.assigneeId, member.id); assert.equal(created[0].payload.status, 'PENDIENTE');
  await service.createConfirmedTask({ user, draft, question: 'Sí, procede' });
  assert.equal(created.length, 1); assert.equal(notified.length, 1);
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
