import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeActiveTaskWorkSession,
  closeAllOpenTaskWorkSessions,
  listTaskWorkHistory,
  openTaskWorkSession,
} from '../src/services/taskWorkSessionService.js';

// Colaboradores (Rodny, 5 de octubre de 2026): el reloj del responsable sigue atado al estado de la
// tarea; cada colaborador lleva el suyo, marcado con `isCollaborator`, y nunca se mezclan.

const at = new Date('2026-10-05T15:00:00.000Z');

test('the assignee clock only looks at assignee sessions, never at a collaborator one', async () => {
  const wheres = [];
  const tx = {
    taskWorkSession: {
      findFirst: async ({ where }) => { wheres.push(where); return null; },
      create: async ({ data }) => ({ id: 's-1', ...data }),
    },
  };
  const session = await openTaskWorkSession(tx, { task: { id: 't-1', assigneeId: 'm-rodny' }, cycleId: 'c-1', at });
  assert.equal(wheres[0].isCollaborator, false);
  assert.equal(session.isCollaborator, false);
  assert.equal(session.workerId, 'm-rodny');
});

test('a collaborator opens their own session, with their own overlap check', async () => {
  const wheres = [];
  const tx = {
    taskWorkSession: {
      findFirst: async ({ where }) => { wheres.push(where); return where.taskId?.not ? { id: 'other' } : null; },
      create: async ({ data }) => ({ id: 's-2', ...data }),
    },
  };
  const session = await openTaskWorkSession(tx, {
    task: { id: 't-1', assigneeId: 'm-rodny' }, cycleId: 'c-1', at, workerId: 'm-melissa', isCollaborator: true,
  });
  assert.deepEqual({ workerId: wheres[0].workerId, isCollaborator: wheres[0].isCollaborator }, { workerId: 'm-melissa', isCollaborator: true });
  assert.equal(wheres[1].workerId, 'm-melissa');
  assert.equal(session.workerId, 'm-melissa');
  assert.equal(session.isCollaborator, true);
  assert.equal(session.isOverlapping, true);
});

test('pausing the assignee leaves the collaborators running', async () => {
  let where;
  const tx = {
    taskWorkSession: {
      findFirst: async (args) => { where = args.where; return { id: 's-1', startedAt: new Date('2026-10-05T14:00:00.000Z') }; },
      update: async ({ data }) => data,
    },
  };
  await closeActiveTaskWorkSession(tx, { taskId: 't-1', at, closeReason: 'PAUSED' });
  assert.equal(where.isCollaborator, false);

  await closeActiveTaskWorkSession(tx, { taskId: 't-1', at, closeReason: 'PAUSED', workerId: 'm-melissa', isCollaborator: true });
  assert.deepEqual({ workerId: where.workerId, isCollaborator: where.isCollaborator }, { workerId: 'm-melissa', isCollaborator: true });
});

test('closing the task stops every clock, each with its exact duration', async () => {
  const updates = [];
  const tx = {
    taskWorkSession: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { taskId: 't-1', endedAt: null });
        return [
          { id: 's-a', startedAt: new Date('2026-10-05T14:00:00.000Z') },
          { id: 's-b', startedAt: new Date('2026-10-05T14:30:00.000Z') },
        ];
      },
      update: async ({ where, data }) => { updates.push({ id: where.id, ...data }); return data; },
    },
  };
  const closed = await closeAllOpenTaskWorkSessions(tx, { taskId: 't-1', actorId: 'u-rodny', at, closeReason: 'COMPLETED' });
  assert.equal(closed.length, 2);
  assert.deepEqual(updates.map((u) => [u.id, u.durationMs, u.closeReason]), [['s-a', 3_600_000, 'COMPLETED'], ['s-b', 1_800_000, 'COMPLETED']]);
});

test('the historical baseline of the task clock ignores collaborator time', async () => {
  const prismaClient = {
    task: { findUnique: async () => ({ id: 't-1', accumulatedWorkMs: 5_000_000 }) },
    taskWorkCycle: {
      findMany: async () => [{ sessions: [
        { durationMs: 3_000_000, isCollaborator: false },
        { durationMs: 9_000_000, isCollaborator: true },
      ] }],
    },
  };
  const history = await listTaskWorkHistory(prismaClient, 't-1');
  assert.equal(history.recordedSessionMs, 3_000_000);
  assert.equal(history.historicalBaselineMs, 2_000_000);
});
