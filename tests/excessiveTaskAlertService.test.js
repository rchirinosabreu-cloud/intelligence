import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXCESSIVE_TASK_THRESHOLD_MS,
  buildCollaboratorTaskAlerts,
  buildExcessiveTaskAlerts,
} from '../src/services/excessiveTaskAlertService.js';

// Colaboradores (Rodny, 5 de octubre de 2026): sus horas cuentan en su carga, así que la alerta de
// 15 horas les llega con su propio tiempo, mientras su reloj esté corriendo.
test('a collaborator gets the 15-hour alert from their own sessions, only while working', () => {
  const now = new Date('2026-10-05T15:00:00.000Z');
  const H = 60 * 60 * 1000;
  const rows = [
    { task: { id: 'working', title: 'Parrilla', client: { name: 'Villa' }, workSessions: [
      { durationMs: 14 * H, endedAt: new Date('2026-10-04T00:00:00.000Z'), startedAt: new Date('2026-10-03T10:00:00.000Z') },
      { durationMs: null, endedAt: null, startedAt: new Date(now.getTime() - 2 * H) },
    ] } },
    { task: { id: 'paused', title: 'Pausada', workSessions: [{ durationMs: 40 * H, endedAt: new Date('2026-10-04T00:00:00.000Z'), startedAt: new Date('2026-10-02T00:00:00.000Z') }] } },
    { task: { id: 'short', title: 'Corta', workSessions: [{ durationMs: null, endedAt: null, startedAt: new Date(now.getTime() - H) }] } },
  ];
  const alerts = buildCollaboratorTaskAlerts(rows, { now });
  assert.deepEqual(alerts.map((alert) => [alert.id, alert.elapsedMs, alert.isCollaboration]), [['working', 16 * H, true]]);
  assert.equal(buildCollaboratorTaskAlerts(rows, { now, confirmedTaskIds: new Set(['working']) }).length, 0);
  // Rodny, 9 de octubre de 2026: el aviso salta a las 10 horas (antes 15).
  assert.ok(EXCESSIVE_TASK_THRESHOLD_MS === 10 * H);
});

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
