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
          taskId: null, occurredAt, metadata: { taskCount: 42 },
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

test('task list synchronization is throttled to one durable event every five minutes', async () => {
  let created = 0;
  const db = {
    operationalTraceEvent: {
      findFirst: async () => null,
      create: async ({ data }) => {
        created += 1;
        return { id: 'trace-sync', ...data };
      }
    }
  };

  const first = await recordTaskListSync({
    userId: 'user-1', taskCount: 30, now: new Date('2026-08-11T12:45:00.000Z'), db
  });

  assert.equal(first.eventType, 'TASK_LIST_SYNCED');
  assert.equal(first.metadata.taskCount, 30);
  assert.equal(created, 1);

  db.operationalTraceEvent.findFirst = async () => first;
  const skipped = await recordTaskListSync({
    userId: 'user-1', taskCount: 31, now: new Date('2026-08-11T12:46:00.000Z'), db
  });

  assert.equal(skipped, null);
  assert.equal(created, 1);
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

test('automatic sync throttling is scoped by source and invalid sources remain unknown', async () => {
  let where;
  const db = { operationalTraceEvent: {
    findFirst: async args => { where = args.where; return null; },
    create: async ({ data }) => data,
  } };
  const automatic = await recordTaskListSync({ userId: 'helen', taskCount: 8, source: 'AUTOMATIC', db });
  assert.equal(automatic.metadata.source, 'AUTOMATIC');
  assert.deepEqual(where.metadata, { path: ['source'], equals: 'AUTOMATIC' });
  const unknown = await recordTaskListSync({ userId: 'helen', taskCount: 8, source: 'something-else', db });
  assert.equal(unknown.metadata.source, 'UNKNOWN');
});

test('timeline distinguishes manual, automatic and historical unspecified syncs', async () => {
  const actor = { id: 'helen', name: 'Helen' };
  const rows = ['MANUAL', 'AUTOMATIC', undefined].map((source, index) => ({
    id: String(index), eventType: 'TASK_LIST_SYNCED', actor, subjectUser: actor,
    occurredAt: new Date(), metadata: { taskCount: 8, ...(source ? { source } : {}) },
  }));
  const result = await getOperationalTrace({ requester: { role: 'ADMIN' }, db: {
    user: { findMany: async () => [actor] }, operationalTraceEvent: { findMany: async () => rows },
  } });
  assert.equal(result.timeline[0].displayLabel, 'Actualización manual');
  assert.equal(result.timeline[0].description, 'Helen actualizó manualmente la lista de 8 tareas en Gestión.');
  assert.equal(result.timeline[1].displayLabel, 'Actualización automática');
  assert.equal(result.timeline[1].description, 'Gestión actualizó automáticamente la lista de 8 tareas para Helen.');
  assert.equal(result.timeline[2].description, 'Helen sincronizó 8 tareas en Gestión.');
  assert.equal(result.timeline[2].displayLabel, null);
});
