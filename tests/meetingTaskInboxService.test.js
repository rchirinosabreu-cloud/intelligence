// El servicio de la bandeja de pendientes de reuniones (13 de noviembre de 2026): lee las minutas analizadas, arma la
// bandeja con la regla pura, aprueba creando cada pendiente por el `createTask` de siempre (con el compromiso
// recordando su tarea) y descarta guardando quién, cuándo y por qué. Nunca dos veces, nunca borra, y un fallo en un
// pendiente no frena a los demás.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingTaskInboxService } from '../src/services/meetingTaskInboxService.js';

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
  const created = [], notices = [];
  const service = createMeetingTaskInboxService({
    db, now: NOW, logger: { info() {}, error() {} },
    createTask: async (input, options) => { const task = { id: `t-${created.length + 1}`, ...input, options }; created.push(task); return task; },
    notify: async (notice) => { notices.push(notice); },
    ...over
  });
  return { service, created, notices };
};

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

test('approving creates each marked task through createTask with the meeting as context and the corrections of the person, writes the task id back, and notifies the assignee', async () => {
  const db = fakeDb();
  const { service, created, notices } = build(db);
  const result = await service.approve(rodny, { minuteId: 'mm-1', items: [
    { n: 1, title: 'Enviar el guion del reel', clientId: 'c-end', assigneeId: 'm-kam', collaboratorIds: ['m-jar'], dueDay: '2026-11-18', priority: 'URGENTE', comment: 'El cliente lo pidió para el martes.' },
    { n: 2, title: 'Revisar el logo nuevo con el cliente', clientId: null, assigneeId: 'm-rod', collaboratorIds: [], dueDay: null, priority: 'NORMAL', comment: '' }
  ] });
  assert.deepEqual(result.created.map((row) => [row.n, row.taskId]), [[1, 't-1'], [2, 't-2']]);
  assert.deepEqual(result.failed, []);
  const [first, second] = created;
  assert.equal(first.title, 'Enviar el guion del reel', 'the corrected title wins');
  assert.deepEqual([first.clientId, first.assigneeId, first.collaboratorIds, first.dueDate, first.priority, first.isPriority, first.status, first.creatorId], ['c-end', 'm-kam', ['m-jar'], '2026-11-18T12:00:00.000Z', 'URGENTE', true, 'PENDIENTE', 'u-rod']);
  assert.match(first.initial_comments[0].content, /De la reunión «Reunión Endova noviembre» del 12 de noviembre\. Responsable según la reunión: Kamila\. Compromiso: Enviar el guion del reel de lanzamiento/);
  assert.match(first.initial_comments[0].content, /El cliente lo pidió para el martes\.$/);
  assert.deepEqual(first.options, { requireActiveClient: true });
  assert.deepEqual([second.clientId, second.dueDate, second.isPriority], [null, null, false]);
  assert.deepEqual(db.minutes[0].actionItems.map((raw) => raw.taskId || null), ['t-1', 't-2', null], 'each commitment remembers its task');
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.relatedId]), [['u-kam', 'TASK_ASSIGNED', 't-1']], 'the approver is not notified about her own task');
  assert.equal(result.inbox.pending, 1, 'the tray comes back refreshed');
});

test('approving again creates nothing, a discarded item is refused, one failure does not stop the rest, and the rule rejects what the screen would', async () => {
  const db = fakeDb([minuteOf({ actionItems: [
    { task: 'Ya creado', owner: 'Kamila', taskId: 't-old' },
    { task: 'Descartado', owner: 'Kamila', discarded: { reason: 'YA_HECHO', at: '2026-11-12T20:00:00Z' } },
    { task: 'Se cae', owner: 'Kamila' },
    { task: 'Sale bien', owner: 'Kamila' }
  ] })]);
  const { service, created } = build(db, { createTask: async (input) => { if (input.title === 'Se cae') throw new Error('El cliente está archivado.'); const task = { id: 't-new', ...input }; created.push(task); return task; } });
  const item = (n, title) => ({ n, title, clientId: null, assigneeId: 'm-kam', collaboratorIds: [], dueDay: null, priority: 'NORMAL', comment: '' });
  const result = await service.approve(rodny, { minuteId: 'mm-1', items: [item(1, 'Ya creado'), item(2, 'Descartado'), item(3, 'Se cae'), item(4, 'Sale bien')] });
  assert.deepEqual(result.already.map((row) => [row.n, row.taskId]), [[1, 't-old']]);
  assert.deepEqual(result.failed.map((row) => [row.n, row.reason]), [[2, 'Ese compromiso ya se descartó.'], [3, 'El cliente está archivado.']]);
  assert.deepEqual(result.created.map((row) => [row.n, row.taskId]), [[4, 't-new']]);
  assert.equal(created.length, 1);
  await assert.rejects(service.approve(rodny, { minuteId: 'mm-1', items: [item(4, '')] }), (error) => error.status === 400 && /título/.test(error.message));
  await assert.rejects(service.approve(rodny, { minuteId: 'mm-9', items: [item(1, 'x')] }), (error) => error.status === 404);
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
