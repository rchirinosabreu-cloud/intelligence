import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConfirmExcessiveTaskWorkHandler,
  createGetMyExcessiveTaskAlertsHandler,
} from '../src/controllers/excessiveTaskAlertController.js';

const responseDouble = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test('uses the authenticated user id and never accepts another assignee from the request', async () => {
  let receivedUserId;
  const handler = createGetMyExcessiveTaskAlertsHandler({
    alertLoader: async (userId) => {
      receivedUserId = userId;
      return [{ id: 'task-1', elapsedMs: 54_000_000 }];
    },
  });
  const res = responseDouble();

  await handler({ user: { userId: 'user-authenticated' }, query: { userId: 'user-other' } }, res);

  assert.equal(receivedUserId, 'user-authenticated');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.thresholdHours, 15);
  assert.equal(res.payload.tasks.length, 1);
});

test('returns a safe error when task alerts cannot be loaded', async () => {
  const handler = createGetMyExcessiveTaskAlertsHandler({
    alertLoader: async () => { throw new Error('database unavailable'); },
  });
  const res = responseDouble();

  await handler({ user: { userId: 'user-1' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, { error: 'No se pudieron consultar las alertas de tiempo' });
});

test('confirms continued work using only the authenticated user and route task', async () => {
  let received;
  const handler = createConfirmExcessiveTaskWorkHandler({
    confirmationWriter: async (userId, taskId) => {
      received = { userId, taskId };
      return { taskId, confirmedAt: '2026-08-28T16:00:00.000Z' };
    },
  });
  const res = responseDouble();

  await handler({ user: { userId: 'user-1' }, params: { taskId: 'task-1' }, body: { userId: 'forged' } }, res);

  assert.deepEqual(received, { userId: 'user-1', taskId: 'task-1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.confirmed, true);
});

test('rejects confirmation when the task does not belong to the user', async () => {
  const error = new Error('not assigned');
  error.code = 'TASK_NOT_ASSIGNED';
  const handler = createConfirmExcessiveTaskWorkHandler({ confirmationWriter: async () => { throw error; } });
  const res = responseDouble();

  await handler({ user: { userId: 'user-1' }, params: { taskId: 'task-other' } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Solo el responsable puede confirmar esta tarea activa' });
});
