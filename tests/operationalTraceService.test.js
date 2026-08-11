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
