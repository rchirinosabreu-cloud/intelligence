import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManagerTaskAnalytics,
  percentile,
} from '../src/services/managerTaskAnalyticsService.js';

const now = new Date('2026-08-28T15:00:00.000Z');

test('percentile uses the nearest-rank value for operational planning', () => {
  assert.equal(percentile([10, 20, 30, 40], 0.5), 20);
  assert.equal(percentile([10, 20, 30, 40], 0.75), 30);
  assert.equal(percentile([], 0.75), 0);
});

test('manager analytics separates initial effort from rework', () => {
  const result = buildManagerTaskAnalytics({
    now,
    periodDays: 30,
    tasks: [
      {
        id: 'task-1', title: 'Crear carrusel', status: 'REALIZADA',
        completedAt: '2026-08-27T18:00:00.000Z', aiCategory: 'CONTENIDO',
        aiComplexity: 'MEDIA', client: { name: 'Aristea' },
        assignee: { id: 'worker-1', name: 'Rodny' },
      },
    ],
    cycles: [
      { id: 'cycle-1', taskId: 'task-1', kind: 'INITIAL' },
      { id: 'cycle-2', taskId: 'task-1', kind: 'REWORK' },
    ],
    sessions: [
      { id: 's1', taskId: 'task-1', cycleId: 'cycle-1', workerId: 'worker-1', startedAt: '2026-08-27T14:00:00.000Z', endedAt: '2026-08-27T16:00:00.000Z', durationMs: 7_200_000 },
      { id: 's2', taskId: 'task-1', cycleId: 'cycle-2', workerId: 'worker-1', startedAt: '2026-08-27T17:00:00.000Z', endedAt: '2026-08-27T18:00:00.000Z', durationMs: 3_600_000 },
    ],
  });

  assert.equal(result.overview.totalWorkMs, 10_800_000);
  assert.equal(result.overview.initialWorkMs, 7_200_000);
  assert.equal(result.overview.reworkMs, 3_600_000);
  assert.equal(result.overview.reworkRate, 1 / 3);
  assert.equal(result.overview.completedTasks, 1);
  assert.equal(result.byCategory[0].label, 'Contenido');
  assert.equal(result.byCategory[0].workMs, 10_800_000);
});

test('active sessions contribute elapsed time and expose data quality gaps', () => {
  const result = buildManagerTaskAnalytics({
    now,
    periodDays: 7,
    tasks: [
      { id: 'task-active', title: 'Editar reel', status: 'EN_CURSO', aiCategory: null, aiComplexity: null, client: null, assignee: { id: 'worker-2', name: 'Brayan' } },
      { id: 'task-gap', title: 'Publicar parrilla', status: 'EN_CURSO', aiCategory: 'PUBLICACION', aiComplexity: 'BAJA', client: { name: 'Mío' }, assignee: { id: 'worker-3', name: 'Sara' } },
    ],
    cycles: [{ id: 'cycle-active', taskId: 'task-active', kind: 'INITIAL' }],
    sessions: [
      { id: 'active', taskId: 'task-active', cycleId: 'cycle-active', workerId: 'worker-2', startedAt: '2026-08-28T14:00:00.000Z', endedAt: null, durationMs: null },
    ],
  });

  assert.equal(result.overview.totalWorkMs, 3_600_000);
  assert.equal(result.overview.openSessions, 1);
  assert.equal(result.overview.activeTasks, 2);
  assert.equal(result.dataQuality.inProgressWithoutSession, 1);
  assert.equal(result.dataQuality.unclassifiedTasks, 1);
});

test('analytics excludes sessions outside the selected period', () => {
  const result = buildManagerTaskAnalytics({
    now,
    periodDays: 7,
    tasks: [{ id: 'task-1', status: 'REALIZADA', client: null, assignee: null }],
    cycles: [{ id: 'cycle-1', taskId: 'task-1', kind: 'INITIAL' }],
    sessions: [
      { id: 'old', taskId: 'task-1', cycleId: 'cycle-1', startedAt: '2026-07-01T10:00:00.000Z', endedAt: '2026-07-01T11:00:00.000Z', durationMs: 3_600_000 },
    ],
  });

  assert.equal(result.overview.totalWorkMs, 0);
  assert.equal(result.overview.sessionCount, 0);
});
