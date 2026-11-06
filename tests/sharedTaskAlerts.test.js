import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExcessiveTaskAlerts, buildCollaboratorTaskAlerts, confirmExcessiveTaskWork, getMyExcessiveTaskAlerts } from '../src/services/excessiveTaskAlertService.js';
import { buildReturnedTaskAlerts, getMyReturnedTaskAlerts } from '../src/services/returnedTaskAlertService.js';
import { calculateMemberStatus } from '../src/services/activityStatusService.js';

const now = new Date('2026-11-05T18:00:00Z');
const H = 3600000;
const shared = extra => ({ id: 'shared', title: 'Una tarea', status: 'EN_CURSO', sharedProgress: true,
  assigneeId: 'owner', assignee: { id: 'owner', userId: 'u-owner' }, assigneeStatus: 'REALIZADA', creatorId: 'creator',
  accumulatedWorkMs: 20 * H, startedAt: null,
  collaborators: [{ memberId: 'collab', member: { id: 'collab', userId: 'u-collab' }, status: 'EN_CURSO' }],
  workSessions: [{ workerId: 'collab', startedAt: new Date(now.getTime() - 12 * H), endedAt: null }], ...extra });

test('excessive-time alerts use the owner part and its own sessions even while another part is returned', () => {
  assert.deepEqual(buildExcessiveTaskAlerts([shared()], { assigneeId: 'owner', now }), []);
  const task = shared({ status: 'DEVUELTA', assigneeStatus: 'EN_CURSO', workSessions: [
    { workerId: 'owner', startedAt: new Date(now.getTime() - 11 * H), endedAt: null },
    { workerId: 'collab', durationMs: 80 * H, startedAt: new Date(now.getTime() - 90 * H), endedAt: new Date(now.getTime() - 10 * H) }
  ] });
  const alerts = buildExcessiveTaskAlerts([task], { assigneeId: 'owner', now });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].elapsedMs, 11 * H);
  assert.equal(alerts[0].participantMemberId, 'owner');
});

test('a finished collaborator part has no clock alert even if an obsolete session is still open', () => {
  const alerts = buildCollaboratorTaskAlerts([{ memberId: 'collab', status: 'REALIZADA', task: shared() }], { now });
  assert.deepEqual(alerts, []);
});

test('legacy owner alerts retain unsegmented time and a known running start without crediting a former worker', () => {
  const task = shared({ assigneeStatus: null, startedAt: new Date(now.getTime() - 5 * H), accumulatedWorkMs: 7 * H,
    workSessions: [{ workerId: 'former', isCollaborator: false, durationMs: H, endedAt: new Date(now.getTime() - 10 * H) }] });
  const alerts = buildExcessiveTaskAlerts([task], { assigneeId: 'owner', now });
  assert.equal(alerts[0]?.elapsedMs, 11 * H);
});

test('excessive-work polling and confirmation accept an active collaborator within a returned aggregate', async () => {
  const task = shared({ status: 'DEVUELTA' });
  const calls = [];
  const db = {
    teamMember: { findUnique: async () => ({ id: 'collab' }) },
    task: { findMany: async () => [], findFirst: async args => { calls.push(args); return task; } },
    taskCollaborator: { findMany: async args => { calls.push(args); return [{ memberId: 'collab', status: 'EN_CURSO', task }]; } },
    operationalTraceEvent: { findMany: async () => [], create: async () => ({}) }
  };
  assert.equal((await getMyExcessiveTaskAlerts('u-collab', now, db)).length, 1);
  await confirmExcessiveTaskWork('u-collab', task.id, now, db);
  assert.ok(JSON.stringify(calls[0].where).includes('DEVUELTA'));
  await assert.rejects(confirmExcessiveTaskWork('u-owner', task.id, now, db), error => error.code === 'TASK_NOT_ASSIGNED');
});

test('returned reminder uses the oldest still-returned part, not the last global return or a resolved part', () => {
  const task = shared({ status: 'DEVUELTA', assigneeStatus: 'REALIZADA', assigneeReturnedAt: new Date(now.getTime() - 20 * H),
    returnedAt: new Date(now.getTime() - H / 4), collaborators: [
      { memberId: 'collab', status: 'DEVUELTA', returnedAt: new Date(now.getTime() - 3 * H) },
      { memberId: 'new', status: 'DEVUELTA', returnedAt: new Date(now.getTime() - H / 4) }
    ] });
  const alerts = buildReturnedTaskAlerts([task], { creatorId: 'creator', now });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].elapsedMs, 3 * H);
  assert.equal(alerts[0].participantMemberId, 'collab');
});

test('returned polling includes personal return dates so a later return cannot hide an older pending correction', async () => {
  let query;
  await getMyReturnedTaskAlerts('creator', now, { task: { findMany: async args => { query = args; return []; } }, operationalTraceEvent: { findMany: async () => [] } });
  assert.ok(JSON.stringify(query.where).includes('assigneeReturnedAt'));
  assert.ok(JSON.stringify(query.where).includes('collaborators'));
});

test('Activity shows each person’s active part and never exposes a private task description', () => {
  const task = shared({ status: 'DEVUELTA', isPrivate: true, comments: 'Detalle reservado' });
  const owner = calculateMemberStatus({ id: 'owner', nativeTasks: [task] }, [], now);
  const collaborator = calculateMemberStatus({ id: 'collab', nativeTasks: [], collaboratingTasks: [{ task }] }, [], now);
  assert.equal(owner.status, 'LIBRE');
  assert.equal(owner.currentTask, null);
  assert.equal(collaborator.status, 'OCUPADO');
  assert.equal(collaborator.currentTask.id, task.id);
  assert.equal(collaborator.currentTask.description, null);
});
