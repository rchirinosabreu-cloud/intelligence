// Tiempo declarado al cerrar sin cronómetro (Rodny, 9 de octubre de 2026: «preguntar el tiempo al cerrar»). Solo el
// 56 % de lo cerrado tenía tiempo medido; lo que se cerró sin reloj se pregunta y queda como declarado, distinto de
// lo cronometrado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsDeclaredTime, declareTaskTime, DECLARED_TIME_OPTIONS } from '../src/services/declaredTimeService.js';

const M = 60_000;
const completedAt = new Date('2026-10-09T20:00:00Z');
const fakeDb = ({ task, sessions = [], cycles = [] }) => {
  const writes = { sessions: [], cycles: [], tasks: [] };
  const db = {
    task: {
      findUnique: async () => task,
      update: async ({ data }) => { writes.tasks.push(data); return { ...task, ...data }; }
    },
    taskWorkSession: {
      findMany: async () => sessions,
      create: async ({ data }) => { writes.sessions.push(data); return { id: 's-new', ...data }; }
    },
    taskWorkCycle: {
      findFirst: async () => cycles.at(-1) || null,
      create: async ({ data }) => { writes.cycles.push(data); return { id: 'cy-new', ...data }; }
    },
    $transaction: async (work) => work(db)
  };
  return { db, writes };
};
const assignee = { userId: 'u-melissa', role: 'EDITOR' };
const closedTask = { id: 't1', title: 'Post de octubre', status: 'REALIZADA', completedAt, assigneeId: 'm-melissa', assignee: { userId: 'u-melissa' }, accumulatedWorkMs: 0 };

test('closed without the clock: the person who did it is asked; with time, or someone else, nobody is', async () => {
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: closedTask }).db, user: assignee, taskId: 't1' }), true);
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: { ...closedTask, accumulatedWorkMs: 40 * M } }).db, user: assignee, taskId: 't1' }), false, 'already measured');
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: closedTask, sessions: [{ durationMs: 25 * M, closeReason: 'COMPLETED', isCollaborator: false }] }).db, user: assignee, taskId: 't1' }), false);
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: closedTask }).db, user: { userId: 'u-boss', role: 'ADMIN' }, taskId: 't1' }), false, 'a manager closing someone else’s task is not asked how long it took them');
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: { ...closedTask, status: 'EN_CURSO' } }).db, user: assignee, taskId: 't1' }), false);
  assert.equal(await needsDeclaredTime({ db: fakeDb({ task: closedTask, sessions: [{ durationMs: 30 * M, closeReason: 'DECLARED' }] }).db, user: assignee, taskId: 't1' }), false, 'asked once');
});

test('declaring stores one DECLARED session ending when the task closed, and the task shows the time', async () => {
  const { db, writes } = fakeDb({ task: closedTask, cycles: [{ id: 'cy1', sequence: 1 }] });
  const out = await declareTaskTime({ db, user: assignee, taskId: 't1', minutes: 60 });
  assert.equal(out.declaredMs, 60 * M);
  assert.equal(writes.sessions.length, 1);
  const session = writes.sessions[0];
  assert.deepEqual([session.closeReason, session.durationMs, session.workerId, session.cycleId, session.isCollaborator], ['DECLARED', 60 * M, 'm-melissa', 'cy1', false]);
  assert.equal(session.endedAt.toISOString(), completedAt.toISOString());
  assert.equal(session.startedAt.toISOString(), new Date(completedAt.getTime() - 60 * M).toISOString());
  assert.deepEqual(writes.tasks[0], { accumulatedWorkMs: 60 * M });
});

test('a task without any cycle gets a closed one; the limits and who may declare are checked', async () => {
  const fresh = fakeDb({ task: closedTask });
  await declareTaskTime({ db: fresh.db, user: assignee, taskId: 't1', minutes: 30 });
  assert.equal(fresh.writes.cycles.length, 1);
  assert.equal(fresh.writes.cycles[0].kind, 'INITIAL');
  for (const minutes of [0, -5, 721, 'mucho']) {
    await assert.rejects(() => declareTaskTime({ db: fakeDb({ task: closedTask }).db, user: assignee, taskId: 't1', minutes }), { statusCode: 400 });
  }
  await assert.rejects(() => declareTaskTime({ db: fakeDb({ task: closedTask }).db, user: { userId: 'u-other', role: 'EDITOR' }, taskId: 't1', minutes: 30 }), { statusCode: 403 });
  await assert.rejects(() => declareTaskTime({ db: fakeDb({ task: { ...closedTask, accumulatedWorkMs: 2 * 60 * M } }).db, user: assignee, taskId: 't1', minutes: 30 }), { statusCode: 409 });
  await assert.rejects(() => declareTaskTime({ db: fakeDb({ task: { ...closedTask, status: 'PENDIENTE' } }).db, user: assignee, taskId: 't1', minutes: 30 }), { statusCode: 409 });
  assert.deepEqual(DECLARED_TIME_OPTIONS.map((o) => o.minutes), [15, 30, 60, 120, 240, 480]);
});
