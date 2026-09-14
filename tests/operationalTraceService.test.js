import test from 'node:test';
import assert from 'node:assert/strict';
import { getOperationalTrace, recordTaskListSync } from '../src/services/operationalTraceService.js';

test('operational trace is restricted to administrators', async () => {
  await assert.rejects(
    () => getOperationalTrace({ requester: { role: 'PROJECT_MANAGER' }, db: {} }),
    (error) => error.statusCode === 403
  );
});

test('operational trace returns an explainable user and task timeline', async () => {
  const occurredAt = new Date('2026-08-11T12:45:00.000Z');
  const db = {
    user: {
      findMany: async () => [{ id: 'user-1', name: 'Helen', role: 'EDITOR', avatarUrl: null }]
    },
    operationalTraceEvent: {
      findMany: async () => [
        {
          id: 'trace-1', eventType: 'TASK_OPENED', actorId: 'user-1', subjectUserId: 'user-1',
          taskId: 'task-1', occurredAt, metadata: {},
          actor: { id: 'user-1', name: 'Helen', role: 'EDITOR', avatarUrl: null },
          subjectUser: { id: 'user-1', name: 'Helen', role: 'EDITOR', avatarUrl: null }
        },
        {
          id: 'trace-2', eventType: 'TASK_LIST_SYNCED', actorId: 'user-1', subjectUserId: 'user-1',
          taskId: null, occurredAt, metadata: { taskCount: 42, source: 'MANUAL' },
          actor: { id: 'user-1', name: 'Helen', role: 'EDITOR', avatarUrl: null },
          subjectUser: { id: 'user-1', name: 'Helen', role: 'EDITOR', avatarUrl: null }
        }
      ]
    },
    task: {
      findMany: async () => [{ id: 'task-1', title: 'Parrilla Aristea', client: { name: 'Aristea' } }]
    }
  };

  const result = await getOperationalTrace({
    requester: { role: 'ADMIN' },
    filters: { userId: 'user-1', days: 7 },
    now: new Date('2026-08-12T12:45:00.000Z'),
    db
  });

  assert.equal(result.summary.taskOpens, 1);
  assert.equal(result.summary.syncs, 1);
  assert.equal(result.timeline[0].task.title, 'Parrilla Aristea');
  assert.equal(result.timeline[0].task.clientName, 'Aristea');
  assert.equal(result.users[0].name, 'Helen');
});

test('manual refreshes are recorded even after a recent automatic synchronization', async () => {
  const writes = [];
  let throttleQueries = 0;
  const db = { operationalTraceEvent: {
    findFirst: async () => { throttleQueries++; return { id: 'recent-auto' }; },
    create: async ({ data }) => { writes.push(data); return data; },
  } };
  await recordTaskListSync({ userId: 'helen', taskCount: 8, source: 'MANUAL', db });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].metadata.source, 'MANUAL');
  assert.equal(throttleQueries, 0);
});

test('automatic and unclassified refreshes are not written to human history', async () => {
  const db = { operationalTraceEvent: { findFirst: async () => null, create: async () => assert.fail('unexpected write') } };
  assert.equal(await recordTaskListSync({ userId: 'helen', source: 'AUTOMATIC', db }), null);
  assert.equal(await recordTaskListSync({ userId: 'helen', source: 'something-else', db }), null);
});

test('timeline keeps only refreshes with a known manual origin', async () => {
  const actor = { id: 'helen', name: 'Helen' };
  const rows = ['MANUAL', 'AUTOMATIC', undefined].map((source, index) => ({
    id: String(index), eventType: 'TASK_LIST_SYNCED', actor, subjectUser: actor,
    occurredAt: new Date(), metadata: { taskCount: 8, ...(source ? { source } : {}) },
  }));
  const result = await getOperationalTrace({ requester: { role: 'ADMIN' }, db: {
    user: { findMany: async () => [actor] }, operationalTraceEvent: { findMany: async () => rows },
  } });
  assert.equal(result.timeline.length, 1);
  assert.equal(result.timeline[0].displayLabel, 'Lista de tareas actualizada');
  assert.equal(result.timeline[0].description, 'Helen actualizó la lista de tareas.');
});
