import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXCESSIVE_TASK_THRESHOLD_MS,
  buildExcessiveTaskAlerts,
} from '../src/services/excessiveTaskAlertService.js';

test('returns only in-progress tasks assigned to the authenticated user at or above 15 hours', () => {
  const now = new Date('2026-08-28T15:00:00.000Z');
  const tasks = [
    { id: 'exact', title: 'Cotización', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: EXCESSIVE_TASK_THRESHOLD_MS, startedAt: null },
    { id: 'below', title: 'Contenido', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: EXCESSIVE_TASK_THRESHOLD_MS - 1, startedAt: null },
    { id: 'other', title: 'Otra persona', status: 'EN_CURSO', assigneeId: 'member-2', accumulatedWorkMs: 72 * 60 * 60 * 1000, startedAt: null },
    { id: 'done', title: 'Terminada', status: 'REALIZADA', assigneeId: 'member-1', accumulatedWorkMs: 20 * 60 * 60 * 1000, startedAt: null },
  ];

  const alerts = buildExcessiveTaskAlerts(tasks, { assigneeId: 'member-1', now });

  assert.deepEqual(alerts.map((task) => task.id), ['exact']);
  assert.equal(alerts[0].elapsedMs, EXCESSIVE_TASK_THRESHOLD_MS);
});

test('includes the running interval and orders the longest task first', () => {
  const now = new Date('2026-08-28T15:00:00.000Z');
  const tasks = [
    { id: '18h', title: 'Cotización', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: 3 * 60 * 60 * 1000, startedAt: '2026-08-28T00:00:00.000Z' },
    { id: '72h', title: 'Diseño', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: 72 * 60 * 60 * 1000, startedAt: null },
  ];

  const alerts = buildExcessiveTaskAlerts(tasks, { assigneeId: 'member-1', now });

  assert.deepEqual(alerts.map((task) => task.id), ['72h', '18h']);
  assert.equal(alerts[1].elapsedMs, 18 * 60 * 60 * 1000);
});

test('hides tasks with a recent explicit work confirmation', () => {
  const alerts = buildExcessiveTaskAlerts([
    { id: 'confirmed', title: 'Confirmada', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: 20 * 60 * 60 * 1000 },
    { id: 'unconfirmed', title: 'Sin confirmar', status: 'EN_CURSO', assigneeId: 'member-1', accumulatedWorkMs: 18 * 60 * 60 * 1000 },
  ], {
    assigneeId: 'member-1',
    confirmedTaskIds: new Set(['confirmed']),
  });

  assert.deepEqual(alerts.map((task) => task.id), ['unconfirmed']);
});
