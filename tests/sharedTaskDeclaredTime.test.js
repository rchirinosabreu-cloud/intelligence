import test from 'node:test';
import assert from 'node:assert/strict';
import { needsDeclaredTime, declareTaskTime } from '../src/services/declaredTimeService.js';

const ended = new Date('2026-11-05T15:00:00Z');
const sharedTask = () => ({ id: 'shared', title: 'Una tarea', status: 'EN_CURSO', sharedProgress: true,
  assigneeId: 'owner', assignee: { id: 'owner', userId: 'u-owner' }, assigneeStatus: 'EN_CURSO',
  accumulatedWorkMs: 5000000, assigneeRevision: 2,
  collaborators: [{ memberId: 'collab', member: { id: 'collab', userId: 'u-collab' }, status: 'REALIZADA', completedAt: ended, revision: 3 }] });
const database = (task = sharedTask(), initialSessions = []) => {
  const sessions = [...initialSessions], taskWrites = [], cycleWrites = [], calls = [];
  let tail = Promise.resolve();
  const db = {
    task: { findUnique: async () => { calls.push('read'); return task; }, update: async ({ data }) => { taskWrites.push(data); return task; } },
    taskWorkSession: { findMany: async ({ where }) => sessions.filter(s => !where.workerId || s.workerId === where.workerId),
      create: async ({ data }) => { sessions.push(data); return data; } },
    taskWorkCycle: { findFirst: async () => null, create: async ({ data }) => { cycleWrites.push(data); return { ...data, id: 'cycle' }; } },
    $executeRaw: async () => { calls.push('lock'); return 1; },
    $transaction: (work, options) => {
      calls.push(options?.isolationLevel);
      const result = tail.then(() => work(db));
      tail = result.catch(() => {});
      return result;
    }
  };
  return { db, sessions, taskWrites, cycleWrites, calls };
};
const request = { user: { userId: 'u-collab' }, taskId: 'shared', participantMemberId: 'collab', expectedRevision: 3, minutes: 30 };

test('own completed part can declare while the task stays open, independently of another worker’s declared time', async () => {
  const state = database(sharedTask(), [{ workerId: 'owner', closeReason: 'DECLARED', durationMs: 3600000 }]);
  assert.equal(await needsDeclaredTime({ db: state.db, ...request }), true);
  assert.equal(await needsDeclaredTime({ db: state.db, ...request, user: { userId: 'u-owner' } }), false);
  const result = await declareTaskTime({ db: state.db, ...request });
  assert.equal(result.participantMemberId, 'collab');
  assert.equal(state.sessions.at(-1).workerId, 'collab');
  assert.equal(state.sessions.at(-1).isCollaborator, true);
  assert.equal(state.sessions.at(-1).endedAt.toISOString(), ended.toISOString());
  assert.equal(state.taskWrites.length, 0, 'the collaborator cannot replace the owner accumulated time');
  assert.equal(state.cycleWrites[0].closedAt ?? null, null, 'the shared work cycle is still open');
});

test('a stale completion, another participant, or an already clocked part cannot be declared', async () => {
  for (const extra of [{ expectedRevision: 2 }, { expectedRevision: undefined }, { expectedRevision: '3' }]) {
    await assert.rejects(declareTaskTime({ db: database().db, ...request, ...extra }), error => error.statusCode === 409);
  }
  await assert.rejects(declareTaskTime({ db: database().db, ...request, user: { userId: 'u-manager', role: 'ADMIN' } }), error => error.statusCode === 403);
  const measured = database(sharedTask(), [{ workerId: 'collab', closeReason: 'COMPLETED', durationMs: 600000, isCollaborator: false }]);
  assert.equal(await needsDeclaredTime({ db: measured.db, ...request }), false, 'worker identity wins over its former collaborator flag');
  await assert.rejects(declareTaskTime({ db: measured.db, ...request }), error => error.statusCode === 409);
});

test('two tabs serialize the same personal declaration and persist only once', async () => {
  const state = database();
  const results = await Promise.allSettled([declareTaskTime({ db: state.db, ...request }), declareTaskTime({ db: state.db, ...request })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(state.sessions.length, 1);
  assert.ok(state.calls.includes('Serializable'));
  assert.ok(state.calls.indexOf('lock') < state.calls.indexOf('read'));
});

test('an inherited global completion is not evidence of a personal close', async () => {
  const task = sharedTask();
  task.status = 'REALIZADA'; task.sharedProgress = false; task.completedAt = ended;
  task.assigneeStatus = null;
  task.collaborators[0].status = null; task.collaborators[0].completedAt = null;
  const state = database(task);
  assert.equal(await needsDeclaredTime({ db: state.db, ...request }), false);
  await assert.rejects(declareTaskTime({ db: state.db, ...request }), error => error.statusCode === 409);
});

test('legacy personal baseline remains measured without inventing dated sessions', async () => {
  const task = sharedTask();
  task.collaborators[0].baselineWorkMs = 600000;
  const state = database(task);
  assert.equal(await needsDeclaredTime({ db: state.db, ...request }), false);
  await assert.rejects(declareTaskTime({ db: state.db, ...request }), error => error.statusCode === 409);
  assert.equal(state.sessions.length, 0);
});

test('rejoining preserves the same person’s archived baseline when deciding whether to ask for time', async () => {
  const task = sharedTask();
  task.participationArchives = [{ memberId: 'collab', baselineWorkMs: 600000 }, { memberId: 'owner', baselineWorkMs: 3600000 }];
  const state = database(task);
  assert.equal(await needsDeclaredTime({ db: state.db, ...request }), false);
  await assert.rejects(declareTaskTime({ db: state.db, ...request }), error => error.statusCode === 409);
});
