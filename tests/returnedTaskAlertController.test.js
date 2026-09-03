import test from 'node:test';
import assert from 'node:assert/strict';

const controller = await import('../src/controllers/returnedTaskAlertController.js').catch(() => ({}));

const responseDouble = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test('loads returned reminders using only the authenticated user', async () => {
  assert.equal(typeof controller.createGetMyReturnedTaskAlertsHandler, 'function');
  let receivedUserId;
  const handler = controller.createGetMyReturnedTaskAlertsHandler({
    alertLoader: async (userId) => {
      receivedUserId = userId;
      return [{ id: 'task-1' }];
    },
  });
  const res = responseDouble();

  await handler({ user: { userId: 'user-authenticated' }, query: { userId: 'forged' } }, res);

  assert.equal(receivedUserId, 'user-authenticated');
  assert.equal(res.payload.thresholdMinutes, 60);
  assert.equal(res.payload.tasks.length, 1);
});

test('snoozes a returned reminder using the authenticated user and route task', async () => {
  assert.equal(typeof controller.createSnoozeReturnedTaskReminderHandler, 'function');
  let received;
  const handler = controller.createSnoozeReturnedTaskReminderHandler({
    snoozeWriter: async (userId, taskId) => {
      received = { userId, taskId };
      return { taskId, snoozedUntil: '2026-09-02T19:00:00.000Z' };
    },
  });
  const res = responseDouble();

  await handler({ user: { userId: 'user-1' }, params: { taskId: 'task-1' }, body: { userId: 'forged' } }, res);

  assert.deepEqual(received, { userId: 'user-1', taskId: 'task-1' });
  assert.equal(res.payload.snoozed, true);
});

test('rejects snoozing a returned task that does not belong to the authenticated creator', async () => {
  assert.equal(typeof controller.createSnoozeReturnedTaskReminderHandler, 'function');
  const error = new Error('not owned');
  error.code = 'RETURNED_TASK_NOT_OWNED';
  const handler = controller.createSnoozeReturnedTaskReminderHandler({ snoozeWriter: async () => { throw error; } });
  const res = responseDouble();

  await handler({ user: { userId: 'user-1' }, params: { taskId: 'task-other' } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Solo quien creó la tarea puede posponer este recordatorio' });
});
