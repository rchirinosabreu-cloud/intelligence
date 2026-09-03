import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await import('../src/services/returnedTaskAlertService.js').catch(() => ({}));

test('returned reminder polling has a matching creator, status and return-time index', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /@@index\(\[creatorId, status, returnedAt\]\)/);

  const startup = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../scripts/ensure-returned-task-alert-index.js', import.meta.url), 'utf8').catch(() => '');
  assert.match(startup, /ensure-returned-task-alert-index\.js/);
  assert.match(bootstrap, /CREATE INDEX IF NOT EXISTS "Task_creatorId_status_returnedAt_idx"/);
});

test('returns only tasks left returned to their creator for at least one hour', () => {
  assert.equal(typeof service.buildReturnedTaskAlerts, 'function');

  const now = new Date('2026-09-02T18:00:00.000Z');
  const alerts = service.buildReturnedTaskAlerts([
    { id: 'old', title: 'Corregir copy', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: '2026-09-02T16:59:59.000Z', client: { name: 'Aristea' } },
    { id: 'exact', title: 'Ajustar diseño', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: '2026-09-02T17:00:00.000Z', client: { name: 'Mio' } },
    { id: 'recent', title: 'Revisar pauta', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: '2026-09-02T17:30:00.000Z' },
    { id: 'other', title: 'Otra persona', status: 'DEVUELTA', creatorId: 'user-2', returnedAt: '2026-09-02T15:00:00.000Z' },
    { id: 'resolved', title: 'Ya corregida', status: 'PENDIENTE', creatorId: 'user-1', returnedAt: '2026-09-02T15:00:00.000Z' },
  ], { creatorId: 'user-1', now });

  assert.deepEqual(alerts.map((task) => task.id), ['old', 'exact']);
  assert.equal(alerts[0].elapsedMs, 3_601_000);
  assert.equal(alerts[0].clientName, 'Aristea');
});

test('hides a returned task while its server-side reminder snooze is active', () => {
  assert.equal(typeof service.buildReturnedTaskAlerts, 'function');

  const alerts = service.buildReturnedTaskAlerts([
    { id: 'snoozed', title: 'Snoozed', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: '2026-09-02T14:00:00.000Z' },
    { id: 'visible', title: 'Visible', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: '2026-09-02T15:00:00.000Z' },
  ], {
    creatorId: 'user-1',
    now: new Date('2026-09-02T18:00:00.000Z'),
    snoozedTaskIds: new Set(['snoozed']),
  });

  assert.deepEqual(alerts.map((task) => task.id), ['visible']);
});

test('loads returned tasks by authenticated creator and honors recent snooze events', async () => {
  assert.equal(typeof service.getMyReturnedTaskAlerts, 'function');
  let taskWhere;
  let traceWhere;
  const db = {
    task: {
      findMany: async ({ where }) => {
        taskWhere = where;
        return [
          { id: 'snoozed', title: 'Snoozed', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: new Date('2026-09-02T15:00:00.000Z') },
          { id: 'visible', title: 'Visible', status: 'DEVUELTA', creatorId: 'user-1', returnedAt: new Date('2026-09-02T16:00:00.000Z') },
        ];
      },
    },
    operationalTraceEvent: {
      findMany: async ({ where }) => {
        traceWhere = where;
        return [{ taskId: 'snoozed' }];
      },
    },
  };
  const now = new Date('2026-09-02T18:00:00.000Z');

  const alerts = await service.getMyReturnedTaskAlerts('user-1', now, db);

  assert.equal(taskWhere.creatorId, 'user-1');
  assert.equal(taskWhere.status, 'DEVUELTA');
  assert.equal(traceWhere.eventType, 'TASK_RETURNED_REMINDER_SNOOZED');
  assert.deepEqual(alerts.map((task) => task.id), ['visible']);
});

test('snoozing is authorized against the authenticated creator and writes an auditable event', async () => {
  assert.equal(typeof service.snoozeReturnedTaskReminder, 'function');
  let taskWhere;
  let eventData;
  const db = {
    task: {
      findFirst: async ({ where }) => {
        taskWhere = where;
        return { id: 'task-1', title: 'Ajustar copy' };
      },
    },
    operationalTraceEvent: {
      create: async ({ data }) => {
        eventData = data;
        return { id: 'trace-1', ...data };
      },
    },
  };

  const at = new Date('2026-09-02T18:00:00.000Z');
  const result = await service.snoozeReturnedTaskReminder('user-1', 'task-1', at, db);

  assert.deepEqual(taskWhere, { id: 'task-1', status: 'DEVUELTA', creatorId: 'user-1' });
  assert.equal(eventData.eventType, 'TASK_RETURNED_REMINDER_SNOOZED');
  assert.equal(eventData.subjectUserId, 'user-1');
  assert.equal(eventData.taskId, 'task-1');
  assert.equal(result.snoozedUntil.toISOString(), '2026-09-02T19:00:00.000Z');
});
