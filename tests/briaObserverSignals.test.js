import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BRIA_OBSERVER_INTERVAL_MS,
  buildMinuteObserverDetections,
  buildTaskAnalyticsObserverDetections,
  createPrismaObserverRepository,
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
        findFirst: async () => ({ lastDetectedAt: new Date('2026-08-20T12:00:00.000Z') }),
        count: async () => 0
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

  assert.deepEqual(result, { detectorKey: 'TASK_ANALYTICS', detected: 1, unverified: 0, resolved: 0 });
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

const transcript = 'Rodny: La fecha de publicación no fue aprobada por el cliente.\nHelen: Lo confirmo mañana.';
const groundedMinute = {
  id: 'minute-1',
  title: 'Seguimiento Aristea',
  meetingAt: new Date('2026-09-01T13:00:00.000Z'),
  status: 'READY',
  deletedAt: null,
  executiveSummary: 'Resumen de la reunión.',
  transcriptText: transcript,
  observerSignals: [
    { type: 'RISK', severity: 'warning', description: 'Falta aprobación', evidence: 'La fecha de publicación no fue aprobada', actionable: true, suggestedAction: 'Solicitar aprobación hoy.' }
  ]
};

test('a minute alert is only grounded when its evidence is a literal quote from the transcript', () => {
  const [grounded] = buildMinuteObserverDetections(groundedMinute);
  assert.equal(grounded.grounding, 'QUOTED');
  assert.match(grounded.evidence, /no fue aprobada/);

  // Odd spacing and casing in the transcript must not turn a real quote into a fabricated one.
  const spaced = buildMinuteObserverDetections({ ...groundedMinute, transcriptText: 'Rodny:  la   FECHA de publicación\n no fue aprobada por el cliente.' });
  assert.equal(spaced[0].grounding, 'QUOTED');

  const fabricated = buildMinuteObserverDetections({
    ...groundedMinute,
    observerSignals: [{ ...groundedMinute.observerSignals[0], evidence: 'El cliente canceló la campaña completa.' }]
  });
  assert.equal(fabricated[0].grounding, 'UNVERIFIED');
  assert.equal(fabricated[0].evidence, 'El cliente canceló la campaña completa.');
});

test('punctuation and quotation marks around a real quote do not turn it into a fabrication', () => {
  const quoted = evidence => buildMinuteObserverDetections({
    ...groundedMinute,
    observerSignals: [{ ...groundedMinute.observerSignals[0], evidence }]
  })[0].grounding;

  // The same words, dressed differently by the model.
  assert.equal(quoted('«La fecha de publicación no fue aprobada.»'), 'QUOTED');
  assert.equal(quoted('"La fecha de publicación, no fue aprobada"'), 'QUOTED');
  assert.equal(quoted('La fecha de publicación no fue aprobada...'), 'QUOTED');
  // Different words are still a fabrication, however tidy the punctuation.
  assert.equal(quoted('La fecha de publicación fue aprobada.'), 'UNVERIFIED');
  assert.equal(quoted('El cliente aprobó la fecha de publicación'), 'UNVERIFIED');
});

test('a missing or trivial quote is never replaced by the summary or by invented wording', () => {
  for (const evidence of ['', '   ', 'ok', 'Rodny:']) {
    const [detection] = buildMinuteObserverDetections({
      ...groundedMinute,
      observerSignals: [{ ...groundedMinute.observerSignals[0], evidence }]
    });
    assert.equal(detection.grounding, 'UNVERIFIED');
    assert.doesNotMatch(detection.evidence, /Resumen de la reunión/);
    assert.doesNotMatch(detection.evidence, /Detectado en el análisis/);
    assert.equal(detection.evidence, 'Falta aprobación');
  }
  // Without a transcript nothing can be confirmed, and nothing is invented either.
  const [noTranscript] = buildMinuteObserverDetections({ ...groundedMinute, transcriptText: '' });
  assert.equal(noTranscript.grounding, 'UNVERIFIED');
});

test('every detection carries the version of the evidence that produced it', () => {
  const [detection] = buildMinuteObserverDetections(groundedMinute);
  const [same] = buildMinuteObserverDetections({ ...groundedMinute });
  assert.ok(detection.evidenceVersion);
  assert.equal(detection.evidenceVersion, same.evidenceVersion);

  const [analytics] = buildTaskAnalyticsObserverDetections({ observer: { signals: [{ code: 'HIGH_REWORK', severity: 'attention', title: 'Retrabajo alto', evidence: '3 de 10 tareas devueltas.' }] } });
  assert.equal(analytics.grounding, 'DETERMINISTIC');
  const [changed] = buildTaskAnalyticsObserverDetections({ observer: { signals: [{ code: 'HIGH_REWORK', severity: 'attention', title: 'Retrabajo alto', evidence: '7 de 10 tareas devueltas.' }] } });
  assert.equal(changed.dedupeKey, analytics.dedupeKey);
  assert.notEqual(changed.evidenceVersion, analytics.evidenceVersion);
});

test('a signal a person already closed does not reopen just because the same source is read again', async () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  const updates = [];
  const stored = { id: 'signal-1', status: 'RESOLVED', evidenceVersion: 'v1', resolvedAt: new Date('2026-09-20T12:00:00.000Z') };
  const db = {
    briaObserverSignal: {
      findUnique: async () => stored,
      update: async args => { updates.push(args.data); return args.data; },
      create: async args => { updates.push(args.data); return args.data; }
    }
  };
  const repository = createPrismaObserverRepository(db);

  await repository.upsertDetection({ dedupeKey: 'k', title: 'T', evidence: 'E', evidenceVersion: 'v1' }, now);
  assert.equal(updates[0].status, 'RESOLVED');
  assert.equal(updates[0].lastDetectedAt, now);
  assert.equal('resolvedAt' in updates[0], false);

  // Dismissals are the team's decision too: only genuinely new evidence reopens them.
  stored.status = 'DISMISSED';
  await repository.upsertDetection({ dedupeKey: 'k', title: 'T', evidence: 'E', evidenceVersion: 'v1' }, now);
  assert.equal(updates[1].status, 'DISMISSED');

  // The baseline history never comes back to the inbox.
  stored.status = 'ARCHIVED';
  await repository.upsertDetection({ dedupeKey: 'k', title: 'T', evidence: 'E', evidenceVersion: 'v2' }, now);
  assert.equal(updates[2].status, 'ARCHIVED');
});

test('new evidence does reopen a closed signal, and clears its closing marks', async () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  let written;
  const repository = createPrismaObserverRepository({
    briaObserverSignal: {
      findUnique: async () => ({ id: 'signal-1', status: 'RESOLVED', evidenceVersion: 'v1', resolvedAt: new Date('2026-09-20T12:00:00.000Z') }),
      update: async args => { written = args.data; return args.data; },
      create: async args => args.data
    }
  });

  await repository.upsertDetection({ dedupeKey: 'k', title: 'T', evidence: 'E nueva', evidenceVersion: 'v2' }, now);
  assert.equal(written.status, 'OPEN');
  assert.equal(written.resolvedAt, null);
  assert.equal(written.dismissedAt, null);
  assert.equal(written.evidenceVersion, 'v2');
});

test('signals whose source was not examined in this scan are never resolved by absence', async () => {
  const queries = [];
  const repository = createPrismaObserverRepository({
    briaObserverSignal: { updateMany: async args => { queries.push(args.where); return { count: 0 }; } }
  });

  await repository.resolveMissing('MINUTE_SIGNAL', ['a'], new Date(), { scopeRecordIds: ['minute-1', 'minute-2'] });
  assert.deepEqual(queries[0].sourceRecordId, { in: ['minute-1', 'minute-2'] });

  // A detector with a single global source keeps resolving across the whole detector.
  await repository.resolveMissing('TASK_ANALYTICS', ['b'], new Date());
  assert.equal('sourceRecordId' in queries[1], false);

  // An empty scope must never resolve everything.
  await repository.resolveMissing('MINUTE_SIGNAL', [], new Date(), { scopeRecordIds: [] });
  assert.deepEqual(queries[2].sourceRecordId, { in: [] });
});

test('reconciliation passes the examined scope and keeps unverified alerts out of the active inbox', async () => {
  const writes = [];
  const repository = {
    upsertDetection: async item => writes.push(['upsert', item.dedupeKey]),
    resolveMissing: async (detectorKey, activeKeys, now, options) => writes.push(['resolve', detectorKey, options?.scopeRecordIds])
  };
  await reconcileObserverDetections({
    detectorKey: 'MINUTE_SIGNAL',
    detections: [{ detectorKey: 'MINUTE_SIGNAL', dedupeKey: 'MINUTE_SIGNAL:one', title: 'One', evidence: 'E' }],
    scopeRecordIds: ['minute-1'],
    repository
  });
  assert.deepEqual(writes, [['upsert', 'MINUTE_SIGNAL:one'], ['resolve', 'MINUTE_SIGNAL', ['minute-1']]]);
});

test('the inbox hides unverified alerts, counts them apart and can list archived history', async () => {
  const queries = [];
  const db = {
    briaObserverSignal: {
      findMany: async args => { queries.push(args.where); return []; },
      groupBy: async () => [{ status: 'OPEN', _count: { _all: 8 } }],
      findFirst: async () => null,
      count: async args => { queries.push(args.where); return 3; }
    },
    briaObserverDetectorState: { findFirst: async () => null }
  };

  const active = await getObserverInbox({ db });
  assert.deepEqual(active.summary.unverified, 3);
  assert.ok(JSON.stringify(queries[0]).includes('UNVERIFIED'), 'the active query must exclude unverified alerts');

  const archived = await getObserverInbox({ db, status: 'ARCHIVED' });
  assert.deepEqual(archived.signals, []);
  assert.deepEqual(queries.at(-2), { status: 'ARCHIVED' });

  const unverified = await getObserverInbox({ db, status: 'UNVERIFIED' });
  assert.deepEqual(unverified.signals, []);
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
  assert.match(schema, /evidenceVersion\s+String\?/);
  assert.match(schema, /grounding\s+String\?/);
  assert.match(schemaBootstrap, /ADD COLUMN IF NOT EXISTS "evidenceVersion"/);
  assert.match(schemaBootstrap, /ADD COLUMN IF NOT EXISTS "grounding"/);
  assert.equal(BRIA_OBSERVER_INTERVAL_MS, 10 * 60 * 1000);
});
