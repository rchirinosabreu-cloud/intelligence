import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BRIA_OBSERVER_INTERVAL_MS,
  buildMinuteObserverDetections,
  buildTaskAnalyticsObserverDetections,
  reconcileObserverDetections,
  transitionObserverSignal
} from '../src/services/briaObserverService.js';

test('Observer converts operational findings into traceable persistent detections', () => {
  const detections = buildTaskAnalyticsObserverDetections({
    observer: {
      signals: [
        { code: 'OVERLAPPING_SESSIONS', severity: 'critical', title: 'Sesiones simultáneas', evidence: 'Dos sesiones activas ahora.' },
        { code: 'STABLE_BASELINE', severity: 'positive', title: 'Todo estable', evidence: 'Sin alertas.' }
      ]
    }
  });

  assert.equal(detections.length, 1);
  assert.equal(detections[0].detectorKey, 'TASK_ANALYTICS');
  assert.equal(detections[0].dedupeKey, 'TASK_ANALYTICS:OVERLAPPING_SESSIONS');
  assert.equal(detections[0].sourceUrl, '/manager');
  assert.match(detections[0].evidence, /activas ahora/i);
});

test('Observer promotes minute findings with their meeting as evidence', () => {
  const detections = buildMinuteObserverDetections({
    id: 'minute-1',
    title: 'Seguimiento Aristea',
    status: 'READY',
    deletedAt: null,
    observerSignals: [
      { type: 'RISK', severity: 'warning', description: 'Falta aprobación', evidence: 'La fecha de publicación no fue aprobada.' }
    ]
  });

  assert.equal(detections.length, 1);
  assert.equal(detections[0].sourceKind, 'MEETING_MINUTE');
  assert.equal(detections[0].sourceRecordId, 'minute-1');
  assert.equal(detections[0].sourceUrl, '/minutas?minute=minute-1');
  assert.match(detections[0].dedupeKey, /^MINUTE_SIGNAL:minute-1:/);
  assert.equal(buildMinuteObserverDetections({ id: 'minute-1', status: 'EXCLUDED', observerSignals: [{}] }).length, 0);
});

test('reconciliation is idempotent and resolves findings that disappeared', async () => {
  const writes = [];
  const repository = {
    upsertDetection: async (item) => writes.push(['upsert', item.dedupeKey]),
    resolveMissing: async (detectorKey, activeKeys) => writes.push(['resolve', detectorKey, activeKeys])
  };
  const detections = [{ detectorKey: 'TASK_ANALYTICS', dedupeKey: 'TASK_ANALYTICS:ONE', title: 'One', evidence: 'Evidence' }];

  const result = await reconcileObserverDetections({ detectorKey: 'TASK_ANALYTICS', detections, repository });

  assert.deepEqual(result, { detectorKey: 'TASK_ANALYTICS', detected: 1, resolved: 0 });
  assert.deepEqual(writes, [
    ['upsert', 'TASK_ANALYTICS:ONE'],
    ['resolve', 'TASK_ANALYTICS', ['TASK_ANALYTICS:ONE']]
  ]);
});

test('signal lifecycle supports review, snooze, dismiss, resolve and reopen', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  assert.deepEqual(transitionObserverSignal('REVIEW', { now }), { status: 'REVIEWED', reviewedAt: now });
  assert.deepEqual(transitionObserverSignal('DISMISS', { now }), { status: 'DISMISSED', dismissedAt: now, snoozedUntil: null });
  assert.deepEqual(transitionObserverSignal('RESOLVE', { now }), { status: 'RESOLVED', resolvedAt: now, snoozedUntil: null });
  assert.deepEqual(transitionObserverSignal('REOPEN', { now }), { status: 'OPEN', reviewedAt: null, dismissedAt: null, resolvedAt: null, snoozedUntil: null });
  assert.deepEqual(
    transitionObserverSignal('SNOOZE', { now, snoozedUntil: '2026-09-08T12:00:00.000Z' }),
    { status: 'SNOOZED', snoozedUntil: new Date('2026-09-08T12:00:00.000Z') }
  );
  assert.throws(() => transitionObserverSignal('SNOOZE', { now, snoozedUntil: 'invalid' }), /INVALID_SNOOZE_UNTIL/);
  assert.throws(() => transitionObserverSignal('DELETE', { now }), /INVALID_OBSERVER_ACTION/);
});

test('Observer schema, protected API and non-overlapping scheduler are wired', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const routes = readFileSync('src/routes/index.js', 'utf8');
  const server = readFileSync('server.js', 'utf8');
  const packageJson = readFileSync('package.json', 'utf8');
  const schemaBootstrap = readFileSync('scripts/ensure-bria-observer-schema.js', 'utf8');

  assert.match(schema, /model BriaObserverSignal/);
  assert.match(schema, /dedupeKey\s+String\s+@unique/);
  assert.match(routes, /\/manager\/observer-signals/);
  assert.match(routes, /requireManagerRole/);
  assert.match(server, /initBriaObserverScheduler\(\)/);
  assert.match(packageJson, /ensure-bria-observer-schema\.js/);
  assert.match(schemaBootstrap, /CREATE TABLE IF NOT EXISTS "BriaObserverSignal"/);
  assert.equal(BRIA_OBSERVER_INTERVAL_MS, 10 * 60 * 1000);
});
