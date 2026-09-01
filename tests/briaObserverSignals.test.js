import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BRIA_OBSERVER_INTERVAL_MS,
  buildMinuteObserverDetections,
  buildTaskAnalyticsObserverDetections,
  getObserverInbox,
  initializeObserverDetectorBaseline,
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

test('Observer promotes only explicit post-activation minute alerts while retaining historical context outside the inbox', () => {
  const activatedAt = new Date('2026-09-01T12:00:00.000Z');
  const actionableMinute = {
    id: 'minute-1',
    title: 'Seguimiento Aristea',
    meetingAt: new Date('2026-09-01T13:00:00.000Z'),
    status: 'READY',
    deletedAt: null,
    observerSignals: [
      { type: 'RISK', severity: 'warning', description: 'Falta aprobación', evidence: 'La fecha de publicación no fue aprobada.', actionable: true, suggestedAction: 'Solicitar aprobación hoy.' }
    ]
  };
  const detections = buildMinuteObserverDetections(actionableMinute, { activatedAt });

  assert.equal(detections.length, 1);
  assert.equal(detections[0].sourceKind, 'MEETING_MINUTE');
  assert.equal(detections[0].sourceRecordId, 'minute-1');
  assert.equal(detections[0].sourceUrl, '/minutas?minute=minute-1');
  assert.match(detections[0].dedupeKey, /^MINUTE_SIGNAL:minute-1:/);
  assert.equal(detections[0].suggestedAction, 'Solicitar aprobación hoy.');
  assert.equal(buildMinuteObserverDetections({ ...actionableMinute, meetingAt: new Date('2026-08-31T13:00:00.000Z') }, { activatedAt }).length, 0);
  assert.equal(buildMinuteObserverDetections({ ...actionableMinute, observerSignals: [{ ...actionableMinute.observerSignals[0], actionable: false }] }, { activatedAt }).length, 0);
  assert.equal(buildMinuteObserverDetections({ id: 'minute-1', status: 'EXCLUDED', observerSignals: [{}] }).length, 0);
});

test('Observer establishes one durable baseline and archives pre-existing minute alerts without deleting their memory', async () => {
  const calls = [];
  const now = new Date('2026-09-01T12:00:00.000Z');
  const repository = {
    ensureDetectorState: async (detectorKey, activatedAt) => {
      calls.push(['ensure', detectorKey, activatedAt]);
      return { detectorKey, activatedAt, baselineArchivedAt: null };
    },
    archiveExistingSignals: async (detectorKey, archivedAt) => {
      calls.push(['archive', detectorKey, archivedAt]);
      return { count: 284 };
    },
    markBaselineArchived: async (detectorKey, archivedAt) => {
      calls.push(['mark', detectorKey, archivedAt]);
      return { detectorKey, activatedAt: now, baselineArchivedAt: archivedAt };
    }
  };

  const result = await initializeObserverDetectorBaseline({ detectorKey: 'MINUTE_SIGNAL', repository, now });

  assert.equal(result.activatedAt, now);
  assert.equal(result.archived, 284);
  assert.deepEqual(calls.map(([operation]) => operation), ['ensure', 'archive', 'mark']);
});

test('Observer inbox reports the real scan time and counts archived baseline as memory rather than active work', async () => {
  const scannedAt = new Date('2026-09-01T15:30:00.000Z');
  const result = await getObserverInbox({
    db: {
      briaObserverSignal: {
        findMany: async () => [],
        groupBy: async () => [{ status: 'ARCHIVED', _count: { _all: 284 } }],
        findFirst: async () => ({ lastDetectedAt: new Date('2026-08-20T12:00:00.000Z') })
      },
      briaObserverDetectorState: {
        findFirst: async () => ({ lastScannedAt: scannedAt })
      }
    }
  });

  assert.equal(result.summary.active, 0);
  assert.equal(result.summary.historical, 284);
  assert.equal(result.summary.lastScannedAt, scannedAt);
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
  assert.match(schema, /model BriaObserverDetectorState/);
  assert.match(schema, /dedupeKey\s+String\s+@unique/);
  assert.match(schema, /archivedAt\s+DateTime\?/);
  assert.match(routes, /\/manager\/observer-signals/);
  assert.match(routes, /requireManagerRole/);
  assert.match(server, /initBriaObserverScheduler\(\)/);
  assert.match(packageJson, /ensure-bria-observer-schema\.js/);
  assert.match(schemaBootstrap, /CREATE TABLE IF NOT EXISTS "BriaObserverSignal"/);
  assert.match(schemaBootstrap, /CREATE TABLE IF NOT EXISTS "BriaObserverDetectorState"/);
  assert.match(schemaBootstrap, /ADD COLUMN IF NOT EXISTS "archivedAt"/);
  assert.equal(BRIA_OBSERVER_INTERVAL_MS, 10 * 60 * 1000);
});
