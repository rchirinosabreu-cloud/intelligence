import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionDayService, JORNADA_TASKS_SINCE } from '../src/services/productionDayService.js';
import { productionTaskCloseProblem } from '../src/services/productionDayGate.js';
import { jornadaClockAction, productionDayState } from '../src/lib/productionDays.js';

// Rodny, 11 de noviembre de 2026: «cuando se crea una jornada de producción, se cree de forma automática el pendiente,
// y que pase a "en proceso" durante las horas en que esa jornada está … ese pendiente debe tener su forma de subir la
// entrega … o por medio de link de drive».

const at = (iso) => new Date(iso);
const START = '2026-11-12T14:00:00.000Z'; // 9:00 en Bogotá
const END = '2026-11-12T18:00:00.000Z'; // 13:00

test('the jornada task runs during the event hours, once each way, and never on an all-day event', () => {
  const day = { startAt: START, endAt: END };
  assert.equal(jornadaClockAction(day, at('2026-11-12T13:59:00Z')), null);
  assert.equal(jornadaClockAction(day, at('2026-11-12T14:00:00Z')), 'START');
  assert.equal(jornadaClockAction({ ...day, autoStartedAt: START }, at('2026-11-12T16:00:00Z')), null);
  assert.equal(jornadaClockAction({ ...day, autoStartedAt: START }, at('2026-11-12T18:00:00Z')), 'STOP');
  assert.equal(jornadaClockAction({ ...day, autoStartedAt: START, autoEndedAt: END }, at('2026-11-12T19:00:00Z')), null);
  assert.equal(jornadaClockAction({ ...day, isAllDay: true }, at('2026-11-12T15:00:00Z')), null);
});

test('files in the task delivery count as evidence as much as the Drive link', () => {
  assert.equal(productionDayState({ date: '2026-11-06', hasDeliverables: true }, '2026-11-11'), 'REALIZADA');
  assert.equal(productionDayState({ date: '2026-11-06' }, '2026-11-11'), 'SIN_EVIDENCIA');
});

const memoryDb = ({ createdAt = '2026-11-11T15:00:00.000Z', members = ['m-brayan', 'm-sara'], clientId = null } = {}) => {
  const state = {
    events: [{ id: 'ev', title: 'Jornada de producción Multik', type: 'PRODUCTION', startAt: at(START), endAt: at(END), isAllDay: false, recurrence: 'NONE', memberIds: members, createdById: 'u-pm', createdAt: at(createdAt), googleCancelled: false, googleSyncStatus: 'SYNCED' }],
    members: [{ id: 'm-brayan', userId: 'u-brayan', isActive: true }, { id: 'm-sara', userId: 'u-sara', isActive: true }, { id: 'm-pm', userId: 'u-pm', isActive: true }],
    users: [{ id: 'u-pm', name: 'Kamila', role: 'PROJECT_MANAGER', isActive: true }, { id: 'u-brayan', name: 'Brayan', role: 'EDITOR', isActive: true }, { id: 'u-other', name: 'Otra', role: 'EDITOR', isActive: true }],
    clients: [{ id: 'c-agency', name: 'Brainstudio', isArchived: false }, { id: 'c-multik', name: 'Multik', isArchived: false }],
    days: clientId ? [{ id: 'pd-1', eventId: 'ev', taskId: null, clientId, date: '2026-11-12', title: 'Jornada de producción Multik', evidenceUrl: null, reminders: 0, autoStartedAt: null, autoEndedAt: null }] : [],
    tasks: [], deliverables: 0, created: [], updates: [], moves: [], deleted: [],
  };
  const dayView = (day) => day && ({ ...day, client: state.clients.find((c) => c.id === day.clientId) || null, task: state.tasks.find((t) => t.id === day.taskId) ? { ...state.tasks.find((t) => t.id === day.taskId), _count: { deliverables: state.deliverables } } : null, event: state.events.find((e) => e.id === day.eventId) || null });
  const eventView = (event) => event && ({ ...event, productionDay: dayView(state.days.find((d) => d.eventId === event.id)) || null });
  const db = {
    user: { findUnique: async ({ where }) => state.users.find((u) => u.id === where.id) || null },
    teamMember: {
      findFirst: async ({ where }) => state.members.find((m) => m.userId === where.userId) || null,
      findMany: async ({ where }) => state.members.filter((m) => where.id.in.includes(m.id)),
    },
    client: { findMany: async () => state.clients, findUnique: async ({ where }) => state.clients.find((c) => c.id === where.id) || null },
    operationalEvent: {
      findUnique: async ({ where }) => eventView(state.events.find((e) => e.id === where.id)),
      findMany: async () => state.events.map(eventView),
    },
    productionDay: {
      findUnique: async ({ where }) => dayView(state.days.find((d) => (where.eventId ? d.eventId === where.eventId : where.taskId ? d.taskId === where.taskId : d.id === where.id))),
      create: async ({ data }) => { const day = { id: `pd-${state.days.length + 1}`, taskId: null, evidenceUrl: null, reminders: 0, autoStartedAt: null, autoEndedAt: null, ...data }; state.days.push(day); return day; },
      update: async ({ where, data }) => Object.assign(state.days.find((d) => d.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const day = state.days.find((d) => d.id === where.id && Object.entries(where).every(([k, v]) => k === 'id' || d[k] === v));
        if (!day) return { count: 0 };
        Object.assign(day, data); return { count: 1 };
      },
      delete: async ({ where }) => { state.days = state.days.filter((d) => d.id !== where.id); },
    },
    task: {
      findUnique: async ({ where }) => {
        const task = state.tasks.find((t) => t.id === where.id);
        return task && { ...task, assignee: state.members.find((m) => m.id === task.assigneeId), collaborators: task.collaboratorIds.map((memberId) => ({ memberId, status: task.parts?.[memberId] || 'PENDIENTE', revision: 0, member: state.members.find((m) => m.id === memberId) })) };
      },
    },
    taskDeliverable: { count: async () => state.deliverables },
  };
  const tasks = {
    participationInclude: {},
    createTask: async (fields) => { const task = { id: `task-${state.tasks.length + 1}`, status: 'PENDIENTE', ...fields, collaboratorIds: fields.collaboratorIds || [] }; state.tasks.push(task); state.created.push(fields); return task; },
    updateTask: async (id, data, userId) => { state.updates.push([id, data, userId]); Object.assign(state.tasks.find((t) => t.id === id), data); },
    changeParticipation: async ({ taskId, memberId, payload }) => {
      state.moves.push([memberId, payload.status]);
      const task = state.tasks.find((t) => t.id === taskId);
      if (memberId === task.assigneeId) task.assigneeStatus = payload.status;
      else task.parts = { ...task.parts, [memberId]: payload.status };
    },
    deleteTask: async (id, reason) => { state.deleted.push([id, reason]); state.tasks = state.tasks.filter((t) => t.id !== id); },
  };
  return { db, state, tasks };
};

test('a new jornada creates its task once: first person responsible, the rest collaborators, the agency when there is no client', async () => {
  const { db, state, tasks } = memoryDb();
  const service = createProductionDayService({ db, tasks, now: () => at('2026-11-11T16:00:00Z'), log: () => {} });
  const first = await service.ensureTask('ev');
  const again = await service.ensureTask('ev');
  assert.equal(first, again);
  assert.equal(state.created.length, 1);
  const [fields] = state.created;
  assert.equal(fields.assigneeId, 'm-brayan');
  assert.deepEqual(fields.collaboratorIds, ['m-sara']);
  assert.equal(fields.clientId, 'c-agency');
  assert.equal(fields.dueDate, '2026-11-12');
  assert.match(fields.comments, /de 9:00 a 13:00/);
  assert.match(fields.comments, /enlace de la carpeta de Drive/);
});

test('a client jornada puts its task on that client; jornadas scheduled before the change get no task', async () => {
  const linked = memoryDb({ clientId: 'c-multik', members: ['m-brayan'] });
  await createProductionDayService({ db: linked.db, tasks: linked.tasks, log: () => {} }).ensureTask('ev');
  assert.equal(linked.state.created[0].clientId, 'c-multik');
  assert.deepEqual(linked.state.created[0].collaboratorIds, []);
  const old = memoryDb({ createdAt: new Date(JORNADA_TASKS_SINCE.getTime() - 1000).toISOString() });
  assert.equal(await createProductionDayService({ db: old.db, tasks: old.tasks, log: () => {} }).ensureTask('ev'), null);
  assert.equal(old.state.created.length, 0);
});

test('the task goes «En proceso» during the hours and back to «Pendiente» at the end, person by person', async () => {
  const { db, state, tasks } = memoryDb();
  let clock = at('2026-11-12T14:05:00Z');
  const service = createProductionDayService({ db, tasks, now: () => clock, log: () => {} });
  await service.ensureTask('ev');
  const started = await service.syncJornadaTasks();
  assert.equal(started.started, 1);
  assert.deepEqual(state.moves, [['m-brayan', 'EN_CURSO'], ['m-sara', 'EN_CURSO']]);
  assert.equal((await service.syncJornadaTasks()).started, 0, 'it does not start twice');
  clock = at('2026-11-12T18:01:00Z');
  const stopped = await service.syncJornadaTasks();
  assert.equal(stopped.stopped, 1);
  assert.deepEqual(state.moves.slice(2), [['m-brayan', 'PENDIENTE'], ['m-sara', 'PENDIENTE']]);
});

test('a one-person jornada moves the task itself, without touching what the person already changed', async () => {
  const { db, state, tasks } = memoryDb({ members: ['m-brayan'] });
  const service = createProductionDayService({ db, tasks, now: () => at('2026-11-12T14:05:00Z'), log: () => {} });
  await service.ensureTask('ev');
  await service.syncJornadaTasks();
  assert.deepEqual(state.updates.at(-1), ['task-1', { status: 'EN_CURSO' }, 'u-brayan']);
});

test('a cancelled jornada retires its untouched task, and the title and date follow the event', async () => {
  const { db, state, tasks } = memoryDb();
  const service = createProductionDayService({ db, tasks, now: () => at('2026-11-11T16:00:00Z'), log: () => {} });
  await service.ensureTask('ev');
  state.events[0].title = 'Jornada Multik · local nuevo';
  state.events[0].startAt = at('2026-11-13T14:00:00Z');
  state.events[0].endAt = at('2026-11-13T18:00:00Z');
  await service.syncJornadaTasks();
  assert.deepEqual(state.updates.at(-1)[1], { title: 'Jornada Multik · local nuevo', dueDate: '2026-11-13' });
  state.events[0].googleCancelled = true;
  const result = await service.syncJornadaTasks();
  assert.equal(result.retired, 1);
  assert.match(state.deleted[0][1], /Se canceló la jornada/);
});

test('the month lists every jornada with the Excel columns and what each contract still needs scheduled', async () => {
  const state = {
    days: [
      { id: 'd1', eventId: 'ev', taskId: 'task-1', clientId: 'c-multik', date: '2026-11-12', title: 'Jornada de producción Multik', evidenceUrl: null, location: 'Bocagrande', scriptUrl: 'https://docs.google.com/document/d/x', createdAt: at('2026-11-01T00:00:00Z'),
        client: { id: 'c-multik', name: 'Multik', slug: 'multik' }, event: { startAt: at(START), endAt: at(END), isAllDay: false, memberIds: [], googleCancelled: false, googleSyncStatus: 'SYNCED' },
        task: { id: 'task-1', status: 'PENDIENTE', _count: { deliverables: 0 }, assignee: { name: 'Brayan' }, collaborators: [{ member: { name: 'Sara' } }] } },
      { id: 'd2', eventId: null, taskId: null, clientId: 'c-grit', date: '2026-11-03', title: 'Jornada de producción Fundación Grit', evidenceUrl: 'https://drive.google.com/drive/folders/y', responsibleName: 'Francisco', scheduleText: '8:00 a.m', createdAt: at('2026-11-01T00:00:00Z'),
        client: { id: 'c-grit', name: 'Fundación Grit', slug: 'grit' }, event: null, task: null },
    ],
  };
  const db = {
    user: { findUnique: async () => ({ id: 'u-pm', name: 'Kamila', role: 'PROJECT_MANAGER', isActive: true }) },
    teamMember: { findFirst: async () => ({ id: 'm-pm' }), findMany: async () => [] },
    productionDay: { findMany: async ({ where }) => state.days.filter((d) => d.date >= where.date.gte && d.date <= where.date.lte).sort((a, b) => a.date.localeCompare(b.date)) },
    client: { findMany: async () => [
      { id: 'c-multik', name: 'Multik', slug: 'multik', contracts: [{ status: 'ACTIVO', startDate: '2026-08-19', endDate: '2026-12-18', productionDays: 1 }] },
      { id: 'c-ph', name: 'Pablo Hoff', slug: 'pablo-hoff', contracts: [{ status: 'ACTIVO', startDate: '2025-08-01', endDate: '2027-07-31', productionDays: 1 }] },
      { id: 'c-np', name: 'New Pueblito', slug: 'new-pueblito', contracts: [{ status: 'STAND_BY', startDate: '2026-03-01', endDate: null, productionDays: 2 }] },
    ] },
  };
  const service = createProductionDayService({ db, now: () => at('2026-11-12T20:00:00Z'), log: () => {} });
  const month = await service.listMonth({ year: '2026', month: '11' }, { userId: 'u-pm' });
  assert.deepEqual(month.items.map((i) => [i.date, i.clientName, i.state]), [['2026-11-03', 'Fundación Grit', 'REALIZADA'], ['2026-11-12', 'Multik', 'AGENDADA']]);
  assert.equal(month.items[1].responsible, 'Brayan / Sara');
  assert.equal(month.items[1].schedule, '9:00 a 13:00');
  assert.equal(month.items[1].location, 'Bocagrande');
  assert.equal(month.items[0].responsible, 'Francisco', 'an imported jornada keeps who did it');
  assert.equal(month.items[0].imported, true);
  assert.deepEqual(month.pending.map((p) => [p.client.name, p.missing]), [['Pablo Hoff', 1]], 'Multik is scheduled; a paused contract asks nothing');
  assert.deepEqual(month.summary, { total: 2, done: 1, missingEvidence: 0, scheduled: 1 });
  await assert.rejects(service.listMonth({ year: '2026', month: '13' }, { userId: 'u-pm' }), { status: 400 });
});

test('location and script are saved on the jornada, and a script must be an https link', async () => {
  const { db, state, tasks } = memoryDb({ clientId: 'c-multik' });
  const service = createProductionDayService({ db, tasks, log: () => {} });
  await assert.rejects(service.setDetails('ev', { scriptUrl: 'guion en el drive' }, { userId: 'u-pm' }), { code: 'INVALID_SCRIPT' });
  await assert.rejects(service.setDetails('ev', { location: 'Calamar' }, { userId: 'u-brayan' }), { status: 403 });
  await service.setDetails('ev', { location: ' Laguna Club ', scriptUrl: 'https://docs.google.com/document/d/abc' }, { userId: 'u-pm' });
  assert.equal(state.days[0].location, 'Laguna Club');
  assert.equal(state.days[0].scriptUrl, 'https://docs.google.com/document/d/abc');
});

test('the jornada task does not close without its delivery, and closes with files or the Drive link', async () => {
  const { db, state, tasks } = memoryDb({ members: ['m-brayan'] });
  const service = createProductionDayService({ db, tasks, now: () => at('2026-11-12T20:00:00Z'), log: () => {} });
  const taskId = await service.ensureTask('ev');
  assert.match(await productionTaskCloseProblem(db, taskId), /se cierra con su entrega/);
  state.deliverables = 2;
  assert.equal(await productionTaskCloseProblem(db, taskId), null, 'files in «Actualizar entrega»');
  state.deliverables = 0;
  await assert.rejects(service.setEvidenceByTask(taskId, { url: 'https://drive.google.com/x' }, { userId: 'u-other' }), { status: 403 });
  const view = await service.setEvidenceByTask(taskId, { url: 'https://drive.google.com/drive/folders/abc' }, { userId: 'u-brayan' });
  assert.equal(view.productionDay.state, 'REALIZADA');
  assert.equal(await productionTaskCloseProblem(db, taskId), null, 'the Drive link');
  assert.equal(await productionTaskCloseProblem(db, 'some-other-task'), null, 'other tasks are never blocked');
});
