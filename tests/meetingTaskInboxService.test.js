// El servicio de la bandeja de pendientes de reuniones (13 de noviembre de 2026): lee las minutas analizadas, arma la
// bandeja con la regla pura, despacha —el POST /api/tasks de siempre con la marca `source`— dejando al compromiso su
// `taskId`, y descarta guardando quién, cuándo y por qué. Nunca dos veces, nunca borra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingTaskInboxService } from '../src/services/meetingTaskInboxService.js';
import { createNewTaskHandler } from '../src/controllers/taskController.js';

const NOW = () => new Date('2026-11-13T15:00:00.000Z'); // viernes 13 de noviembre, 10:00 de Bogotá
const rodny = { id: 'u-rod', userId: 'u-rod', name: 'Rodny Chirinos', role: 'ADMIN', teamMember: { name: 'Rodny Chirinos' } };
const members = [
  { id: 'm-kam', name: 'Kamila Pérez', userId: 'u-kam', role: 'Project manager', isActive: true },
  { id: 'm-jar', name: 'Jarlan Pérez', userId: 'u-jar', role: 'Diseñador', isActive: true },
  { id: 'm-rod', name: 'Rodny Chirinos', userId: 'u-rod', role: 'Director', isActive: true }
];
const clients = [{ id: 'c-end', name: 'Endova', isArchived: false }, { id: 'c-old', name: 'Archivado', isArchived: true }];
const minuteOf = (over = {}) => ({
  id: 'mm-1', title: 'Reunión Endova noviembre', meetingAt: new Date('2026-11-12T14:00:00Z'), status: 'READY', deletedAt: null, updatedAt: new Date('2026-11-12T16:00:00Z'),
  actionItems: [
    { task: 'Enviar el guion del reel de lanzamiento', owner: 'Kamila', dueDate: '2026-11-17', priority: 'alta' },
    { task: 'Revisar el logo nuevo con el cliente', owner: 'Jarlan Peres', dueDate: null, priority: null },
    { task: 'Mandar la factura', owner: 'Carlos (cliente)', dueDate: null, priority: null }
  ],
  ...over
});
const fakeDb = (minutes = [minuteOf()]) => ({
  minutes, updates: [],
  meetingMinute: {
    findMany: async ({ where }) => minutes.filter((m) => !m.deletedAt && m.status === where.status),
    findFirst: async ({ where }) => minutes.find((m) => m.id === where.id && !m.deletedAt) || null,
    update: async ({ where, data }) => { const row = minutes.find((m) => m.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); minutes.updates?.push?.(data); return row; }
  },
  teamMember: { findMany: async () => members },
  client: { findMany: async ({ where }) => clients.filter((c) => !where?.isArchived === !c.isArchived || where?.isArchived === c.isArchived) }
});
const build = (db, over = {}) => {
  const notices = [];
  const service = createMeetingTaskInboxService({
    db, now: NOW, logger: { info() {}, error() {} },
    notify: async (notice) => { notices.push(notice); },
    ...over
  });
  return { service, notices };
};
const source = (n, minuteId = 'mm-1') => ({ kind: 'MINUTE', minuteId, n });

test('the tray lists what is pending with the proposals, the active team and the active clients, and the pulse keys match', async () => {
  const { service } = build(fakeDb());
  const inbox = await service.list(rodny);
  assert.equal(inbox.minutes.length, 1);
  assert.equal(inbox.pending, 3);
  assert.deepEqual(inbox.minutes[0].items.map((item) => [item.n, item.assigneeId]), [[1, 'm-kam'], [2, 'm-jar'], [3, null]]);
  assert.deepEqual(inbox.team.map((row) => row.id), ['m-kam', 'm-jar', 'm-rod']);
  assert.deepEqual(inbox.clients.map((row) => row.id), ['c-end'], 'an archived client is not offered');
  assert.deepEqual(await service.pulse(rodny), { keys: ['R:mm-1:1', 'R:mm-1:2', 'R:mm-1:3'] });
});

test('dispatching re-reads the commitment, runs the creation the caller brought, writes the task id back and notifies a normal assignee', async () => {
  const db = fakeDb();
  const { service, notices } = build(db);
  let calls = 0;
  const create = async () => ({ id: `t-${++calls}`, title: 'Enviar el guion del reel', assignee: { userId: 'u-kam' }, isPriority: false, isSpecial: false });
  const result = await service.dispatch(rodny, source(1), create);
  assert.deepEqual([result.task.id, result.linked], ['t-1', true]);
  assert.deepEqual(db.minutes[0].actionItems.map((raw) => raw.taskId || null), ['t-1', null, null], 'the commitment remembers its task');
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.relatedId]), [['u-kam', 'TASK_ASSIGNED', 't-1']]);
  // Un prioritario ya lo avisa el creador de siempre; uno a nombre de quien despacha no se avisa.
  await service.dispatch(rodny, source(2), async () => ({ id: 't-2', title: 'Urgente', assignee: { userId: 'u-jar' }, isPriority: true }));
  await service.dispatch(rodny, source(3), async () => ({ id: 't-3', title: 'Mío', assignee: { userId: 'u-rod' } }));
  assert.equal(notices.length, 1);
  assert.equal((await service.list(rodny)).pending, 0, 'nothing is left in the tray');
});

test('an already created or discarded commitment is refused before creating; a bad source too; a failed link is said, never undone', async () => {
  const db = fakeDb([minuteOf({ actionItems: [
    { task: 'Ya creado', owner: 'Kamila', taskId: 't-old' },
    { task: 'Descartado', owner: 'Kamila', discarded: { reason: 'YA_HECHO', at: '2026-11-12T20:00:00Z' } },
    { task: 'Sale bien', owner: 'Kamila' }
  ] })]);
  const { service } = build(db);
  let created = 0;
  const create = async () => ({ id: `t-${++created}`, title: 'x' });
  await assert.rejects(service.dispatch(rodny, source(1), create), (error) => error.status === 409 && error.code === 'MEETING_TASK_ALREADY_CREATED');
  await assert.rejects(service.dispatch(rodny, source(2), create), (error) => error.status === 409 && error.code === 'MEETING_TASK_DISCARDED');
  await assert.rejects(service.dispatch(rodny, source(9), create), (error) => error.status === 404);
  await assert.rejects(service.dispatch(rodny, source(1, 'mm-9'), create), (error) => error.status === 404);
  await assert.rejects(service.dispatch(rodny, { kind: 'CHAT', minuteId: 'mm-1', n: 3 }, create), (error) => error.status === 400);
  assert.equal(created, 0, 'nothing was created for what was refused');
  const original = db.meetingMinute.update;
  db.meetingMinute.update = async () => { throw new Error('se cayó la base'); };
  const result = await service.dispatch(rodny, source(3), create);
  db.meetingMinute.update = original;
  assert.deepEqual([result.task.id, result.linked], ['t-1', false]);
  assert.equal(db.minutes[0].actionItems[2].taskId, undefined);
});

test('POST /api/tasks with a source creates by the usual path, links the commitment and answers 201 with the task; without Manager it refuses', async () => {
  // El controlador real, con la creación y el servicio de la bandeja inyectados.
  const db = fakeDb();
  const { service } = build(db);
  const calls = [];
  const res = () => { const out = { statusCode: 200, body: null, status(code) { out.statusCode = code; return out; }, json(payload) { out.body = payload; return out; } }; return out; };
  const req = (user, body) => ({ user, body });
  const admin = { userId: 'u-rod', role: 'ADMIN', modulePermissions: { manager: true } };
  const viewer = { userId: 'u-vie', role: 'EDITOR', modulePermissions: { manager: true } };
  const handler = createNewTaskHandler({ create: async (input) => { calls.push(input); return { id: 't-1', ...input, assignee: { userId: 'u-kam' } }; }, inbox: async () => service });
  const denied = res();
  await handler(req(viewer, { title: 'x', clientId: 'c-end', source: source(1) }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(calls.length, 0, 'nothing is created when the person cannot dispatch');
  const ok = res();
  await handler(req(admin, { title: 'Enviar el guion', clientId: 'c-end', assigneeId: 'm-kam', source: source(1) }), ok);
  assert.equal(ok.statusCode, 201);
  assert.deepEqual(ok.body.meeting, { linked: true });
  assert.equal(calls[0].source, undefined, 'the mark is not written into the task');
  assert.equal(db.minutes[0].actionItems[0].taskId, 't-1');
});

test('discarding keeps the commitment with who, when and why; a created or already discarded one is refused with words', async () => {
  const db = fakeDb();
  const { service } = build(db);
  const result = await service.discard(rodny, { minuteId: 'mm-1', n: 3, motivo: 'DEL_CLIENTE' });
  assert.deepEqual(db.minutes[0].actionItems[2].discarded, { reason: 'DEL_CLIENTE', note: null, by: 'u-rod', byName: 'Rodny Chirinos', at: '2026-11-13T15:00:00.000Z' });
  assert.equal(db.minutes[0].actionItems[2].task, 'Mandar la factura');
  assert.equal(result.inbox.pending, 2);
  await assert.rejects(service.discard(rodny, { minuteId: 'mm-1', n: 3, motivo: 'OTRO', nota: 'ya' }), (error) => error.status === 409 && /ya se descartó/.test(error.message));
  await assert.rejects(service.discard(rodny, { minuteId: 'mm-1', n: 3, motivo: 'OTRO' }), (error) => error.status === 400 && /cuéntame/.test(error.message));
  db.minutes[0].actionItems[0].taskId = 't-1';
  await assert.rejects(service.discard(rodny, { minuteId: 'mm-1', n: 1, motivo: 'YA_HECHO' }), (error) => error.status === 409 && /ya es un pendiente/.test(error.message));
  await assert.rejects(service.discard(rodny, { minuteId: 'mm-1', n: 9, motivo: 'YA_HECHO' }), (error) => error.status === 404);
});
