import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeActiveTaskWorkSession,
  ensureTaskWorkCycle,
  openTaskWorkSession,
} from '../src/services/taskWorkSessionService.js';

const at = new Date('2026-08-27T14:00:00.000Z');

test('ensureTaskWorkCycle reuses an open cycle', async () => {
  const existing = { id: 'cycle-1', sequence: 1 };
  const tx = {
    taskWorkCycle: {
      findFirst: async () => existing,
      aggregate: async () => { throw new Error('must not count'); },
      create: async () => { throw new Error('must not create'); },
    },
  };
  assert.equal(await ensureTaskWorkCycle(tx, { taskId: 'task-1', at }), existing);
});

test('ensureTaskWorkCycle creates the next cycle without inventing historical dates', async () => {
  let createData;
  const tx = {
    taskWorkCycle: {
      findFirst: async () => null,
      aggregate: async () => ({ _max: { sequence: 2 } }),
      create: async ({ data }) => { createData = data; return { id: 'cycle-3', ...data }; },
    },
  };
  const cycle = await ensureTaskWorkCycle(tx, {
    taskId: 'task-1', actorId: 'user-1', at, kind: 'REWORK', reason: 'CLIENT_CORRECTION', note: 'Cambiar cierre',
  });
  assert.equal(cycle.sequence, 3);
  assert.equal(createData.openedAt, at);
  assert.equal(createData.kind, 'REWORK');
});

test('openTaskWorkSession marks simultaneous work for the same worker', async () => {
  let sessionData;
  const tx = {
    taskWorkSession: {
      findFirst: async ({ where }) => where.taskId === 'task-1' ? null : { id: 'other-session' },
      create: async ({ data }) => { sessionData = data; return { id: 'session-1', ...data }; },
    },
  };
  const session = await openTaskWorkSession(tx, {
    task: { id: 'task-1', assigneeId: 'worker-1' }, cycleId: 'cycle-1', actorId: 'user-1', at,
  });
  assert.equal(session.isOverlapping, true);
  assert.equal(sessionData.workerId, 'worker-1');
  assert.equal(sessionData.startedAt, at);
});

test('closeActiveTaskWorkSession records an exact duration and closure reason', async () => {
  let updateData;
  const tx = {
    taskWorkSession: {
      findFirst: async () => ({ id: 'session-1', startedAt: new Date('2026-08-27T13:15:00.000Z') }),
      update: async ({ data }) => { updateData = data; return { id: 'session-1', ...data }; },
    },
  };
  await closeActiveTaskWorkSession(tx, { taskId: 'task-1', actorId: 'pm-1', at, closeReason: 'PAUSED' });
  assert.equal(updateData.durationMs, 45 * 60_000);
  assert.equal(updateData.closeReason, 'PAUSED');
  assert.equal(updateData.endedById, 'pm-1');
});

test('closing a task with no recorded active session does not invent one', async () => {
  const tx = { taskWorkSession: { findFirst: async () => null, update: async () => { throw new Error('must not update'); } } };
  assert.equal(await closeActiveTaskWorkSession(tx, { taskId: 'legacy-task', at, closeReason: 'PAUSED' }), null);
});
