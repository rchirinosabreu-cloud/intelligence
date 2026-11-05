import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalDashboard, loadRecentTaskAchievements } from '../src/services/personalDashboardService.js';
import { buildManagerTaskAnalytics } from '../src/services/managerTaskAnalyticsService.js';
import { buildRhythmRecords } from '../src/services/teamRhythmService.js';
import { buildContextProfiles } from '../src/lib/workPrediction.js';
import { projectTaskParticipation, projectArchivedTaskParticipation } from '../src/lib/taskParticipationMetrics.js';
import { createPlatformLeagueService } from '../src/services/platformLeagueService.js';
import { createDailyReadingService } from '../src/services/dailyReadingService.js';
import { findActiveFocusTaskForUser, notifyFocusOverdue, requestFocusExtension } from '../src/services/taskFocusService.js';

const now = new Date('2026-11-05T15:00:00Z');
const people = ['a', 'b', 'c'].map(id => ({ id, userId: `u-${id}`, name: id.toUpperCase(), role: 'Editor', isActive: true }));
const task = (extra = {}) => ({
  id: 'one-task', title: 'Una entrega', status: 'EN_CURSO', sharedProgress: true,
  creatorId: 'u-c', assigneeId: 'a', assignee: people[0],
  dueDate: new Date('2026-11-04T00:00:00Z'), clientId: 'client', client: { id: 'client', name: 'Cliente' },
  completedAt: null, assigneeStatus: 'REALIZADA', assigneeCompletedAt: new Date('2026-11-05T14:00:00Z'),
  collaborators: [
    { memberId: 'b', member: people[1], status: 'REALIZADA', completedAt: new Date('2026-11-05T13:00:00Z') },
    { memberId: 'c', member: people[2], status: 'EN_CURSO', completedAt: null }
  ], ...extra
});

test('a projected part never borrows the owner clock or accumulated hours', () => {
  const source = task({ startedAt: now, accumulatedWorkMs: 3600000 });
  const participant = { memberId: 'b', member: people[1], status: 'REALIZADA', completedAt: now, baselineWorkMs: 300000 };
  const plain = projectTaskParticipation(source, participant);
  assert.equal(plain.startedAt, null);
  assert.equal(plain.accumulatedWorkMs, 300000);
  const hydrated = projectTaskParticipation(source, { ...participant, startedAt: now, accumulatedWorkMs: 1200000 });
  assert.equal(hydrated.accumulatedWorkMs, 1200000);
  assert.equal(hydrated.startedAt, now);
  const archived = projectArchivedTaskParticipation(source, { ...participant, id: 'archive', accumulatedWorkMs: 1800000 });
  assert.equal(archived.accumulatedWorkMs, 1800000);
  assert.equal(archived.startedAt, null);
});

test('personal dashboard removes a finished part from workload and records its own achievement before global closure', () => {
  const shared = task();
  const owner = buildPersonalDashboard({ now, member: { ...people[0], nativeTasks: [shared] } });
  const collaborator = buildPersonalDashboard({ now, member: { ...people[1], nativeTasks: [], collaboratingTasks: [{ ...shared.collaborators[0], task: shared }] } });
  for (const result of [owner, collaborator]) {
    assert.equal(result.stats.active, 0);
    assert.equal(result.stats.overdue, 0);
    assert.equal(result.stats.completedToday, 1);
    assert.equal(result.achievements[0].id, 'one-task');
    assert.equal(result.achievements[0].globalStatus, 'EN_CURSO');
    assert.equal(result.achievements[0].status, 'REALIZADA');
  }
  assert.equal(collaborator.achievements[0].participantMemberId, 'b');
  assert.equal(collaborator.achievements[0].assignee.id, 'b');
});

test('global achievement projections keep one task ID, personal times and owner-only award identity', () => {
  const shared = task({ recognitions: [{ id: 'award', recipient: { id: 'u-a' } }] });
  const result = buildPersonalDashboard({ now, globalAchievements: [shared], member: { ...people[2], nativeTasks: [] } });
  assert.deepEqual(result.achievements.map(row => row.participantMemberId), ['a', 'b']);
  assert.deepEqual(result.achievements.map(row => row.id), ['one-task', 'one-task']);
  assert.equal(result.achievements[0].recognitions.length, 1);
  assert.equal(result.achievements[1].recognitions.length, 0);
});

test('a legacy shared global completion does not invent personal achievements', () => {
  const shared = task({ status: 'REALIZADA', sharedProgress: false, completedAt: now, assigneeStatus: null, assigneeCompletedAt: null,
    collaborators: [{ memberId: 'b', member: people[1], status: null, completedAt: null }] });
  const result = buildPersonalDashboard({ now, globalAchievements: [shared], member: { ...people[1], nativeTasks: [], collaboratingTasks: [{ task: shared }] } });
  assert.equal(result.stats.completedToday, 0);
  assert.equal(result.achievements.length, 1);
  assert.equal(result.achievements[0].assignee.id, 'a');
  assert.equal(result.achievements[0].participantMemberId ?? null, null);
});

test('a retired completed part remains an achievement without becoming active or reopenable', () => {
  const archive = { id: 'old-part', memberId: 'b', userId: 'u-b', memberName: 'B', role: 'COLLABORATOR',
    status: 'REALIZADA', completedAt: new Date('2026-11-05T13:00:00Z'), revision: 3 };
  const shared = task({ assigneeStatus: 'EN_CURSO', assigneeCompletedAt: null,
    collaborators: [task().collaborators[1]], participationArchives: [archive] });
  const result = buildPersonalDashboard({ now, globalAchievements: [shared], member: {
    ...people[1], nativeTasks: [], archivedParticipations: [{ ...archive, task: shared }]
  } });
  assert.equal(result.stats.active, 0);
  assert.equal(result.stats.completedToday, 1);
  assert.equal(result.achievements[0].id, shared.id);
  assert.equal(result.achievements[0].participantArchiveId, archive.id);
  assert.equal(result.achievements[0].isArchivedParticipation, true);
  assert.equal(result.achievements[0].assignee.id, 'b');
  assert.deepEqual(result.achievements[0].recognitions, []);
});

test('deleted tasks keep their archive but do not enter operational achievement views', async () => {
  const shared = task();
  let archiveQuery;
  const rows = await loadRecentTaskAchievements({
    task: { findMany: async () => [] },
    taskCollaborator: { findMany: async () => [] },
    taskParticipationArchive: { findMany: async query => {
      archiveQuery = query;
      return [{ task: null }, { task: shared }];
    } }
  }, 2);
  assert.deepEqual(rows, [shared]);
  assert.deepEqual(archiveQuery.where.currentTaskId, { not: null }, 'deleted archives do not consume the recent-items limit');
  const archive = { id: 'kept', memberId: 'b', userId: 'u-b', memberName: 'B', role: 'COLLABORATOR', status: 'REALIZADA', completedAt: now };
  const dashboard = buildPersonalDashboard({ now, member: { ...people[1], nativeTasks: [],
    archivedParticipations: [{ ...archive, id: 'deleted', task: null }, { ...archive, task: shared }] } });
  assert.equal(dashboard.stats.completedToday, 1);
  assert.equal(dashboard.achievements.length, 1);
  assert.equal(dashboard.achievements[0].participantArchiveId, 'kept');
});

test('manager work totals preserve the actual worker when responsibility changes', () => {
  const result = buildManagerTaskAnalytics({ now, tasks: [task({ assigneeId: 'b', assignee: people[1] })], members: people,
    sessions: [{ id: 's-a', taskId: 'one-task', workerId: 'a', isCollaborator: false,
      startedAt: '2026-11-05T12:00:00Z', endedAt: '2026-11-05T13:00:00Z', durationMs: 3600000 }] });
  assert.equal(result.byResponsible[0].label, 'A');
});

test('manager analytics keeps an active part visible while another part is returned', () => {
  const shared = task({ status: 'DEVUELTA', assigneeStatus: 'DEVUELTA' });
  const result = buildManagerTaskAnalytics({ now, tasks: [shared], members: people, sessions: [] });
  assert.equal(result.overview.activeTasks, 1);
  assert.equal(result.dataQuality.inProgressWithoutSession, 1);
});

test('partial rework keeps its session evidence without turning the shared initial cycle into rework', () => {
  const shared = task({ status: 'REALIZADA', completedAt: now });
  const session = { id: 'rework', taskId: shared.id, cycleId: 'cycle', workerId: 'a', isRework: true,
    durationMs: 3600000, startedAt: new Date(now.getTime() - 3600000), endedAt: now, cycle: { kind: 'INITIAL' } };
  const manager = buildManagerTaskAnalytics({ now, tasks: [shared], members: people, cycles: [{ id: 'cycle', kind: 'INITIAL' }], sessions: [session] });
  assert.equal(manager.overview.reworkMs, 3600000);
  assert.equal(manager.recentSessions[0].cycleKind, 'REWORK');
  const records = buildRhythmRecords({ tasks: [shared], sessions: [session], members: people });
  assert.equal(records[0].reworkMs, 3600000);
  assert.deepEqual(buildContextProfiles(records), [], 'a shared task is never a complete individual prediction sample');
});

test('a finished owner part no longer produces focus overdue notices or extension requests', async () => {
  const shared = task({ focusDeadlineAt: new Date('2026-11-05T12:00:00Z') });
  let effects = 0;
  const db = { task: { findMany: async () => [shared], findUnique: async () => shared, update: async () => { effects++; } },
    taskComment: { create: async () => { effects++; } } };
  assert.equal(await notifyFocusOverdue({ db, now, notify: async () => { effects++; } }), 0);
  assert.equal(effects, 0);
  await assert.rejects(requestFocusExtension(db, { user: { userId: 'u-a' }, taskId: shared.id, minutes: 30, reason: 'Falta una corrección', notify: async () => {} }), error => error.statusCode === 404);
});

test('active focus lookup selects the owner participation instead of global completion', async () => {
  let query;
  await findActiveFocusTaskForUser({ task: { findFirst: async args => { query = args; return null; } } }, 'u-a');
  assert.ok(JSON.stringify(query.where).includes('assigneeStatus'));
  assert.equal(query.where.assignee.userId, 'u-a');
});

const leagueDb = (shared) => ({
  teamMember: { findMany: async () => people.map(person => ({ ...person, user: { id: person.userId, role: 'EDITOR', isActive: true } })) },
  task: { findMany: async ({ where }) => where.creatorId ? [] : [shared] },
  taskWorkSession: { findMany: async ({ where }) => where.taskId ? [
    { taskId: shared.id, workerId: 'a', isCollaborator: false, durationMs: 20 * 60000 },
    { taskId: shared.id, workerId: 'b', isCollaborator: true, durationMs: 30 * 60000 }
  ] : [] },
  recognitionTaskState: { findMany: async () => [] }, operationalTraceEvent: { findFirst: async () => null }
});

test('league reads each personal completion once on its own day, with that worker’s time', async () => {
  const shared = task({ assigneeCompletedAt: new Date('2026-11-04T14:00:00Z'),
    collaborators: [{ ...task().collaborators[0], returnedAt: new Date('2026-11-05T12:00:00Z') }, task().collaborators[1]] });
  const service = createPlatformLeagueService({ db: leagueDb(shared), repository: { startedAt: async () => new Date('2026-11-01T05:00:00Z') },
    snapshots: { snapshot: async () => ({ people: [] }) }, now: () => now });
  const result = await service.readDay('2026-11-05');
  assert.equal(result.byMember.get('a').closedTasks.length, 0);
  assert.equal(result.byMember.get('b').closedTasks.length, 1);
  assert.equal(result.byMember.get('b').closedTasks[0].measuredMs, 30 * 60000);
  assert.equal(result.byMember.get('b').returnedToday, 1);
  assert.equal(result.byMember.get('a').returnedToday, 0);
});

test('morning snapshot separates individual open work and completions from the single client closure', async () => {
  const shared = task({ assigneeCompletedAt: new Date('2026-11-04T14:00:00Z'),
    collaborators: [{ ...task().collaborators[0], completedAt: new Date('2026-11-04T13:00:00Z') }, task().collaborators[1]] });
  const db = { task: { findMany: async () => [shared] }, contentItem: { findMany: async () => [] },
    taskWorkSession: { findMany: async () => [] }, teamMember: { findMany: async () => people } };
  const service = createDailyReadingService({ db, repository: {}, operations: { listOperations: async () => [] }, now: () => now });
  const result = await service.readToday(now);
  const byId = new Map(result.people.map(person => [person.id, person.metrics]));
  assert.equal(byId.get('a').open, 0);
  assert.equal(byId.get('a').closedTasks, 1);
  assert.equal(byId.get('b').open, 0);
  assert.equal(byId.get('b').closedTasks, 1);
  assert.equal(byId.get('c').inProgress, 1);
  assert.equal(byId.get('c').overdue, 1);
  assert.deepEqual(byId.get('b').deadlineEvidence.tasks, []);
});
