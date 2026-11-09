import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceTaskCollaborators,
  notifyCollaboratorsAdded,
  startCollaboratorWork,
  pauseCollaboratorWork,
  buildTaskTeamTime,
} from '../src/services/taskCollaboratorService.js';

// Cada persona conserva su participación y sus sesiones al cambiar el equipo.

const at = new Date('2026-10-05T15:00:00.000Z');
const MIN = 60_000;

const fakeTx = ({ collaborators = [], activeMembers = ['m-melissa', 'm-bruno', 'm-angela'], openSessions = [], task = {} } = {}) => {
  const calls = { deleted: [], created: [], closed: [], opened: [], taskUpdates: [], comments: [], archived: [], retiredPositions: [] };
  const stored = { id: 't-1', status: 'PENDIENTE', assigneeId: 'm-rodny', assigneeStatus: 'PENDIENTE', assigneeRevision: 2,
    rosterVersion: 0, sharedProgress: collaborators.length > 0,
    collaborators: collaborators.map(memberId => ({ memberId, status: 'PENDIENTE', revision: 1 })), workSessions: openSessions, ...task };
  const tx = {
    $executeRaw: async (sql, taskId, memberId) => { calls.retiredPositions.push({ taskId, memberId }); },
    calls,
    stored,
    task: {
      findUnique: async () => stored,
      update: async ({ data }) => { calls.taskUpdates.push(data); Object.assign(stored, data, { rosterVersion: typeof data.rosterVersion === 'object' ? stored.rosterVersion + data.rosterVersion.increment : stored.rosterVersion }); return stored; },
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
    },
    taskComment: { create: async ({ data }) => { calls.comments.push(data); return data; } },
    taskParticipationArchive: {
      create: async ({ data }) => { calls.archived.push(data); return data; },
      aggregate: async ({ where }) => {
        const rows = calls.archived.filter(row => row.memberId === where.memberId);
        return { _sum: { baselineWorkMs: rows.reduce((total, row) => total + (row.baselineWorkMs || 0), 0) }, _max: { revision: rows.length ? Math.max(...rows.map(row => row.revision)) : null } };
      },
    },
    teamMember: { findMany: async ({ where }) => where.id.in.filter((id) => activeMembers.includes(id)).map((id) => ({ id })) },
    taskCollaborator: {
      findMany: async () => stored.collaborators,
      deleteMany: async ({ where }) => {
        const removed = stored.collaborators.filter(row => where.memberId.in ? where.memberId.in.includes(row.memberId) : !where.memberId.notIn.includes(row.memberId));
        calls.deleted.push(...removed.map(row => row.memberId)); stored.collaborators = stored.collaborators.filter(row => !removed.includes(row)); return { count: removed.length };
      },
      upsert: async ({ where, create, update }) => {
        const row = stored.collaborators.find(row => row.memberId === where.taskId_memberId.memberId);
        if (row) Object.assign(row, update); else { calls.created.push(create); stored.collaborators.push(create); }
      },
      createMany: async ({ data }) => { calls.created.push(...data); return { count: data.length }; },
    },
    taskWorkSession: {
      findFirst: async ({ where }) => openSessions.find((s) => s.workerId === where.workerId && s.isCollaborator === where.isCollaborator && !s.endedAt && (typeof where.taskId === 'string' ? s.taskId === where.taskId : s.taskId !== where.taskId?.not)) || null,
      findMany: async ({ where }) => openSessions.filter(s => s.taskId === where.taskId && (!where.workerId || s.workerId === where.workerId) && (!Object.hasOwn(where, 'endedAt') || s.endedAt == null)),
      aggregate: async () => ({ _sum: { durationMs: 0 } }),
      create: async ({ data }) => { calls.opened.push(data); return { id: 's-new', ...data }; },
      update: async ({ where, data }) => { calls.closed.push({ id: where.id, ...data }); return data; },
    },
    taskWorkCycle: {
      findFirst: async () => ({ id: 'c-1' }),
    },
  };
  return tx;
};

test('replacing collaborators adds the new, removes the old and never keeps the assignee', async () => {
  const tx = fakeTx({ collaborators: ['m-melissa', 'm-bruno'] });
  const result = await replaceTaskCollaborators(tx, {
    taskId: 't-1', assigneeId: 'm-bruno', collaboratorIds: ['m-melissa', 'm-angela', 'm-bruno'], expectedRosterVersion: 0, actorUserId: 'u-rodny', at,
  });
  assert.deepEqual(result.ids, ['m-melissa', 'm-angela']);
  assert.deepEqual(result.added, ['m-angela']);
  assert.deepEqual(result.removed, ['m-bruno']);
  assert.deepEqual(tx.calls.deleted, ['m-bruno']);
  assert.deepEqual(tx.calls.created.map(({ taskId, memberId, addedById, status }) => ({ taskId, memberId, addedById, status })), [{ taskId: 't-1', memberId: 'm-angela', addedById: 'u-rodny', status: 'PENDIENTE' }]);
});

test('a collaborator who leaves the task stops their own clock', async () => {
  const tx = fakeTx({
    collaborators: ['m-melissa'],
    openSessions: [{ id: 's-mel', taskId: 't-1', workerId: 'm-melissa', isCollaborator: true, startedAt: new Date(at.getTime() - 30 * MIN) }],
  });
  await replaceTaskCollaborators(tx, { taskId: 't-1', assigneeId: 'm-rodny', collaboratorIds: [], expectedRosterVersion: 0, actorUserId: 'u-rodny', at });
  assert.equal(tx.calls.closed.length, 1);
  assert.equal(tx.calls.closed[0].id, 's-mel');
  assert.equal(tx.calls.closed[0].durationMs, 30 * MIN);
  assert.equal(tx.calls.closed[0].closeReason, 'REMOVED');
  assert.equal(tx.calls.archived[0].memberId, 'm-melissa');
  assert.equal(tx.calls.archived[0].taskId, 't-1');
  assert.equal(tx.calls.archived[0].currentTaskId, 't-1');
  assert.deepEqual(tx.calls.retiredPositions, [{ taskId: 't-1', memberId: 'm-melissa' }]);
});

test('only active team members can be added; old ones that stay are kept', async () => {
  const tx = fakeTx({ collaborators: ['m-old'], activeMembers: ['m-melissa'] });
  const kept = await replaceTaskCollaborators(tx, { taskId: 't-1', assigneeId: 'm-rodny', collaboratorIds: ['m-old', 'm-melissa'], expectedRosterVersion: 0, actorUserId: 'u', at });
  assert.deepEqual(kept.ids, ['m-old', 'm-melissa']);
  await assert.rejects(
    replaceTaskCollaborators(fakeTx({ activeMembers: [] }), { taskId: 't-1', assigneeId: 'm-rodny', collaboratorIds: ['m-ghost'], actorUserId: 'u', at }),
    (error) => error.statusCode === 400
  );
});

test('a shared task requires an assignee even though everyone completes their own part', async () => {
  await assert.rejects(
    replaceTaskCollaborators(fakeTx(), { taskId: 't-1', assigneeId: null, collaboratorIds: ['m-melissa'], actorUserId: 'u', at }),
    (error) => error.statusCode === 400 && /responsable/.test(error.message)
  );
  const empty = await replaceTaskCollaborators(fakeTx(), { taskId: 't-1', assigneeId: null, collaboratorIds: [], actorUserId: 'u', at });
  assert.deepEqual(empty.ids, []);
});

test('new collaborators get one notification each, never the person who added them', async () => {
  const sent = [];
  const db = { teamMember: { findMany: async () => [{ id: 'm-melissa', userId: 'u-melissa' }, { id: 'm-rodny', userId: 'u-rodny' }, { id: 'm-noaccount', userId: null }] } };
  await notifyCollaboratorsAdded({
    db, task: { id: 't-1', title: 'Parrilla de octubre' }, memberIds: ['m-melissa', 'm-rodny', 'm-noaccount'], actorUserId: 'u-rodny',
    notify: async (data) => sent.push(data),
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, 'u-melissa');
  assert.equal(sent[0].type, 'TASK_COLLABORATOR_ADDED');
  assert.equal(sent[0].relatedId, 't-1');
  assert.match(sent[0].message, /Parrilla de octubre/);
});

const workDb = ({ task, member = { id: 'm-melissa' }, openSessions = [] }) => {
  const tx = fakeTx({ openSessions });
  tx.task = { findUnique: async () => task, update: async ({ data }) => { tx.calls.taskUpdates = [...(tx.calls.taskUpdates || []), data]; return data; } };
  tx.teamMember.findFirst = async () => member;
  return { db: {}, tx, transaction: (work) => work(tx) };
};

test('legacy manual clock endpoints require personal status transitions for both roles and every global status', async () => {
  for (const status of ['PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA']) {
    for (const memberId of ['m-rodny', 'm-melissa']) {
      const task = { id: 't-1', status, assigneeId: 'm-rodny', collaborators: [{ memberId: 'm-melissa' }] };
      for (const action of [startCollaboratorWork, pauseCollaboratorWork]) {
        const { tx, ...deps } = workDb({ task, member: { id: memberId } });
        await assert.rejects(action({ ...deps, taskId: 't-1', userId: 'u-test', at }),
          error => error.statusCode === 409 && error.code === 'TASK_PARTICIPATION_REQUIRED');
        assert.deepEqual(tx.calls.opened, []); assert.deepEqual(tx.calls.closed, []);
        assert.deepEqual(tx.calls.taskUpdates, []);
      }
    }
  }
});

test('a person outside an individual task cannot use the manual clock endpoint', async () => {
  const task = { id: 't-1', status: 'EN_CURSO', assigneeId: 'm-rodny', collaborators: [] };
  await assert.rejects(startCollaboratorWork({ ...workDb({ task, member: { id: 'm-bruno' } }), taskId: 't-1', userId: 'u-bruno', at }),
    error => error.statusCode === 403);
});

test('promoting a collaborator preserves both personal states, revisions and the existing clock', async () => {
  const tx = fakeTx({ collaborators: ['m-melissa'], activeMembers: ['m-rodny', 'm-melissa'],
    task: { status: 'EN_CURSO', assigneeStatus: 'EN_CURSO', assigneeRevision: 6, collaborators: [{ memberId: 'm-melissa', status: 'REALIZADA', completedAt: at, revision: 8 }] },
    openSessions: [{ id: 'running-owner', taskId: 't-1', workerId: 'm-rodny', startedAt: at, endedAt: null }] });
  await replaceTaskCollaborators(tx, { taskId: 't-1', assigneeId: 'm-melissa', collaboratorIds: ['m-rodny'], expectedRosterVersion: 0, actorUserId: 'u', at });
  assert.equal(tx.stored.assigneeId, 'm-melissa');
  assert.equal(tx.stored.assigneeStatus, 'REALIZADA');
  assert.equal(tx.stored.assigneeCompletedAt, at);
  assert.equal(tx.stored.assigneeRevision, 8);
  assert.equal(tx.stored.status, 'EN_CURSO');
  assert.equal(tx.stored.collaborators[0].memberId, 'm-rodny');
  assert.equal(tx.stored.collaborators[0].status, 'EN_CURSO');
  assert.equal(tx.stored.collaborators[0].revision, 6);
  assert.deepEqual(tx.calls.closed, []);
  assert.deepEqual(tx.calls.archived, []);
});

test('in a one-person task the clock still runs with the column, not with a button', async () => {
  const task = { id: 't-1', status: 'EN_CURSO', assigneeId: 'm-rodny', collaborators: [] };
  await assert.rejects(
    startCollaboratorWork({ ...workDb({ task, member: { id: 'm-rodny' } }), taskId: 't-1', userId: 'u-rodny', at }),
    (error) => error.statusCode === 409
  );
});

test('a collaborator opens a private task they work on; nobody else gains access', async () => {
  const { canOpenTask } = await import('../src/lib/taskPrivacy.js');
  const task = { isPrivate: true, creatorId: 'u-rodny', assignee: { userId: 'u-bruno' }, collaborators: [{ member: { userId: 'u-melissa' } }], viewers: [] };
  assert.equal(canOpenTask(task, 'u-melissa'), true);
  assert.equal(canOpenTask(task, 'u-angela'), false);
});

test('the personal dashboard counts the tasks where the person collaborates, but not as achievements', async () => {
  const { buildPersonalDashboard } = await import('../src/services/personalDashboardService.js');
  const now = new Date('2026-10-05T15:00:00.000Z');
  const dashboard = buildPersonalDashboard({
    now,
    member: {
      id: 'm-melissa', userId: 'u-melissa', role: 'Diseñadora',
      nativeTasks: [{ id: 'own', status: 'PENDIENTE', dueDate: new Date('2026-10-08T17:00:00.000Z'), title: 'Propia' }],
      collaboratingTasks: [
        { task: { id: 'shared', status: 'EN_CURSO', dueDate: new Date('2026-10-04T17:00:00.000Z'), title: 'Compartida' } },
        { task: { id: 'own', status: 'PENDIENTE', dueDate: null, title: 'Duplicada' } }
      ]
    }
  });
  assert.equal(dashboard.stats.active, 2);
  assert.equal(dashboard.stats.overdue, 1);
  assert.equal(dashboard.stats.completedToday, 0);
});

test('manager analytics credit a collaborator with their own hours, not the assignee', async () => {
  const { buildManagerTaskAnalytics } = await import('../src/services/managerTaskAnalyticsService.js');
  const now = new Date('2026-10-05T15:00:00.000Z');
  const analytics = buildManagerTaskAnalytics({
    now,
    tasks: [{ id: 't-1', title: 'Parrilla', status: 'EN_CURSO', assignee: { id: 'm-rodny', name: 'Rodny Chirinos' } }],
    members: [{ id: 'm-melissa', name: 'Melissa Ortega' }],
    sessions: [
      { id: 's-1', taskId: 't-1', workerId: 'm-rodny', isCollaborator: false, startedAt: new Date(now.getTime() - 3 * 3_600_000), endedAt: new Date(now.getTime() - 2 * 3_600_000), durationMs: 3_600_000 },
      { id: 's-2', taskId: 't-1', workerId: 'm-melissa', isCollaborator: true, startedAt: new Date(now.getTime() - 4 * 3_600_000), endedAt: new Date(now.getTime() - 2 * 3_600_000), durationMs: 2 * 3_600_000 },
    ],
  });
  assert.deepEqual(analytics.byResponsible.map((row) => [row.label, row.workMs]), [['Melissa Ortega', 2 * 3_600_000], ['Rodny Chirinos', 3_600_000]]);
  assert.equal(analytics.recentSessions.find((row) => row.id === 's-2').workerName, 'Melissa Ortega');
});

test('the team time shows the assignee clock and each collaborator with their own total', () => {
  const now = new Date('2026-10-05T15:00:00.000Z');
  const team = buildTaskTeamTime({
    task: {
      status: 'EN_CURSO', startedAt: new Date(now.getTime() - 10 * MIN), accumulatedWorkMs: 20 * MIN,
      assignee: { id: 'm-rodny', name: 'Rodny Chirinos', avatarUrl: null },
      collaborators: [
        { memberId: 'm-melissa', member: { id: 'm-melissa', name: 'Melissa Ortega' } },
        { memberId: 'm-bruno', member: { id: 'm-bruno', name: 'Bruno Salas' } },
      ],
    },
    sessions: [
      { workerId: 'm-rodny', isCollaborator: false, durationMs: 20 * MIN, endedAt: new Date(now.getTime() - 30 * MIN), startedAt: new Date(now.getTime() - 50 * MIN) },
      { workerId: 'm-rodny', isCollaborator: false, durationMs: null, endedAt: null, startedAt: new Date(now.getTime() - 10 * MIN) },
      { workerId: 'm-melissa', isCollaborator: true, durationMs: 30 * MIN, endedAt: new Date(now.getTime() - 60 * MIN), startedAt: new Date(now.getTime() - 90 * MIN) },
      { workerId: 'm-melissa', isCollaborator: true, durationMs: null, endedAt: null, startedAt: new Date(now.getTime() - 15 * MIN) },
    ],
    now,
  });
  assert.deepEqual(team.map((row) => [row.memberId, row.role, row.elapsedMs, row.working]), [
    ['m-rodny', 'ASSIGNEE', 30 * MIN, true],
    ['m-melissa', 'COLLABORATOR', 45 * MIN, true],
    ['m-bruno', 'COLLABORATOR', 0, false],
  ]);
});
