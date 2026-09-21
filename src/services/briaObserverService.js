import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { getManagerTaskAnalytics } from './managerTaskAnalyticsService.js';

export const BRIA_OBSERVER_INTERVAL_MS = 10 * 60 * 1000;
export const BRIA_OBSERVER_START_DELAY_MS = 90 * 1000;

const ACTIVE_STATUSES = ['OPEN', 'REVIEWED', 'SNOOZED'];
// Statuses a person may filter by. ARCHIVED is baseline history, readable but
// never produced by a human action.
const VALID_STATUSES = ['OPEN', 'REVIEWED', 'SNOOZED', 'DISMISSED', 'RESOLVED', 'ARCHIVED'];
// A closed signal stays closed; only genuinely new evidence reopens it.
const CLOSED_STATUSES = ['DISMISSED', 'RESOLVED'];
// Legacy rows have no grounding recorded; they are shown, not hidden.
const GROUNDED_FILTER = { OR: [{ grounding: null }, { grounding: { not: 'UNVERIFIED' } }] };
// Shorter than this, a "quote" matches almost any transcript by accident.
const MIN_QUOTE_LENGTH = 12;

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const hash = (value) => crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 20);
const comparable = (value) => clean(value).toLowerCase();
// Same words, different typography: the model often wraps a real quote in
// guillemets or adds a final period. Dropping punctuation on BOTH sides keeps
// this a literal word-for-word match, never a fuzzy one.
const wordsOnly = (value) => comparable(value).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

// The model's evidence is trusted only when it appears literally in the
// transcript. Whitespace, casing and punctuation are normalized; wording is not.
export const isQuotedInTranscript = (quote, transcriptText) => {
  const needle = comparable(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  if (comparable(transcriptText).includes(needle)) return true;
  const stripped = wordsOnly(quote);
  return stripped.length >= MIN_QUOTE_LENGTH && wordsOnly(transcriptText).includes(stripped);
};

const normalizeSeverity = (value) => {
  const severity = clean(value).toLowerCase();
  if (['critical', 'error', 'high', 'alta'].includes(severity)) return 'critical';
  if (['warning', 'warn', 'medium', 'media'].includes(severity)) return 'warning';
  if (['attention', 'risk', 'riesgo'].includes(severity)) return 'attention';
  return 'info';
};

export const buildTaskAnalyticsObserverDetections = (analytics = {}) =>
  (analytics.observer?.signals || [])
    .filter((signal) => signal?.code && signal.severity !== 'positive')
    .map((signal) => ({
      detectorKey: 'TASK_ANALYTICS',
      dedupeKey: `TASK_ANALYTICS:${signal.code}`,
      sourceKind: 'TASK_ANALYTICS',
      sourceRecordId: signal.code,
      sourceUrl: '/manager',
      category: 'OPERATIONS',
      severity: normalizeSeverity(signal.severity),
      title: clean(signal.title) || 'Señal operativa',
      evidence: clean(signal.evidence) || 'Sin evidencia descriptiva.',
      // Threshold rules over real task data: computed, not authored by a model.
      grounding: 'DETERMINISTIC',
      evidenceVersion: hash([signal.code, clean(signal.title), clean(signal.evidence), normalizeSeverity(signal.severity)].join('|')),
      confidence: 1,
      suggestedAction: signal.code === 'UNCLASSIFIED_TASKS'
        ? 'Completar categoría y complejidad de las tareas señaladas.'
        : 'Revisar la evidencia operativa y corregir la causa si continúa activa.',
      metadata: { code: signal.code, generatedFrom: analytics.observer?.generatedFrom || 'task_work_sessions' }
    }));

export const buildMinuteObserverDetections = (minute = {}, { activatedAt } = {}) => {
  if (!minute.id || minute.deletedAt || minute.status !== 'READY') return [];
  const meetingAt = new Date(minute.meetingAt);
  const activationDate = activatedAt ? new Date(activatedAt) : null;
  if (activationDate && (!Number.isFinite(meetingAt.getTime()) || meetingAt < activationDate)) return [];
  return (Array.isArray(minute.observerSignals) ? minute.observerSignals : [])
    .filter((signal) => signal?.actionable === true && clean(signal?.suggestedAction) && clean(signal?.description || signal?.title || signal?.evidence))
    .map((signal) => {
      const title = clean(signal.description || signal.title) || 'Hallazgo en reunión';
      // Never fill a missing quote with the summary or with invented wording:
      // an unsupported alert must look unsupported.
      const quote = clean(signal.evidence);
      const grounding = isQuotedInTranscript(quote, minute.transcriptText) ? 'QUOTED' : 'UNVERIFIED';
      // A claimed quote is shown even when it is not confirmed, so a person can
      // judge it. Something too short to be a quote carries nothing: use the
      // model's own description instead of dressing it up as evidence.
      const evidence = quote.length >= MIN_QUOTE_LENGTH ? quote : title;
      const fingerprint = hash([signal.type, title, evidence].join('|'));
      return {
        detectorKey: 'MINUTE_SIGNAL',
        dedupeKey: `MINUTE_SIGNAL:${minute.id}:${fingerprint}`,
        sourceKind: 'MEETING_MINUTE',
        sourceRecordId: minute.id,
        sourceUrl: `/minutas?minute=${encodeURIComponent(minute.id)}`,
        clientId: minute.clientId || null,
        category: clean(signal.type).toUpperCase() || 'MEETING',
        severity: normalizeSeverity(signal.severity || signal.type),
        title,
        evidence,
        grounding,
        evidenceVersion: hash([signal.type, title, evidence, normalizeSeverity(signal.severity || signal.type), clean(signal.suggestedAction)].join('|')),
        confidence: Number.isFinite(Number(signal.confidence)) ? Number(signal.confidence) : null,
        suggestedAction: clean(signal.suggestedAction),
        metadata: {
          meetingTitle: minute.title || 'Reunión sin título',
          meetingAt: minute.meetingAt || null,
          owner: clean(signal.owner) || null,
          dueDate: clean(signal.dueDate) || null,
          actionable: true
        }
      };
    });
};

export const createPrismaObserverBaselineRepository = (db = prisma) => ({
  ensureDetectorState: (detectorKey, activatedAt) => db.briaObserverDetectorState.upsert({
    where: { detectorKey },
    create: { detectorKey, activatedAt },
    update: {}
  }),
  archiveExistingSignals: (detectorKey, archivedAt) => db.briaObserverSignal.updateMany({
    where: { detectorKey, status: { not: 'ARCHIVED' } },
    data: {
      status: 'ARCHIVED',
      archivedAt,
      archiveReason: 'BASELINE_HISTORICAL',
      snoozedUntil: null
    }
  }),
  markBaselineArchived: (detectorKey, baselineArchivedAt) => db.briaObserverDetectorState.update({
    where: { detectorKey },
    data: { baselineArchivedAt }
  }),
  markScanned: (detectorKey, lastScannedAt) => db.briaObserverDetectorState.update({
    where: { detectorKey },
    data: { lastScannedAt }
  })
});

export const initializeObserverDetectorBaseline = async ({
  detectorKey,
  repository = createPrismaObserverBaselineRepository(),
  now = new Date()
} = {}) => {
  if (!detectorKey) throw new Error('OBSERVER_DETECTOR_KEY_REQUIRED');
  const state = await repository.ensureDetectorState(detectorKey, now);
  if (state.baselineArchivedAt) return { activatedAt: state.activatedAt, archived: 0, baselineArchivedAt: state.baselineArchivedAt };
  const archiveResult = await repository.archiveExistingSignals(detectorKey, now);
  const updatedState = await repository.markBaselineArchived(detectorKey, now);
  return {
    activatedAt: updatedState.activatedAt || state.activatedAt,
    archived: Number(archiveResult?.count || 0),
    baselineArchivedAt: updatedState.baselineArchivedAt || now
  };
};

export const transitionObserverSignal = (action, { now = new Date(), snoozedUntil } = {}) => {
  switch (clean(action).toUpperCase()) {
    case 'REVIEW': return { status: 'REVIEWED', reviewedAt: now };
    case 'DISMISS': return { status: 'DISMISSED', dismissedAt: now, snoozedUntil: null };
    case 'RESOLVE': return { status: 'RESOLVED', resolvedAt: now, snoozedUntil: null };
    case 'REOPEN': return { status: 'OPEN', reviewedAt: null, dismissedAt: null, resolvedAt: null, snoozedUntil: null };
    case 'SNOOZE': {
      const until = new Date(snoozedUntil);
      if (!Number.isFinite(until.getTime()) || until <= now) throw new Error('INVALID_SNOOZE_UNTIL');
      return { status: 'SNOOZED', snoozedUntil: until };
    }
    default: throw new Error('INVALID_OBSERVER_ACTION');
  }
};

export const createPrismaObserverRepository = (db = prisma) => ({
  upsertDetection: async (detection, now = new Date()) => {
    const existing = await db.briaObserverSignal.findUnique({ where: { dedupeKey: detection.dedupeKey } });
    if (!existing) return db.briaObserverSignal.create({ data: { ...detection, firstDetectedAt: now, lastDetectedAt: now } });
    // Reading the same document again is not new evidence. A decision a person
    // took stands until the evidence behind the signal actually changes, and
    // the archived baseline never returns to the inbox.
    const evidenceChanged = Boolean(detection.evidenceVersion) && detection.evidenceVersion !== existing.evidenceVersion;
    const reopens = CLOSED_STATUSES.includes(existing.status) && evidenceChanged;
    if (existing.status === 'ARCHIVED' || (CLOSED_STATUSES.includes(existing.status) && !reopens)) {
      return db.briaObserverSignal.update({
        where: { id: existing.id },
        data: { ...detection, status: existing.status, lastDetectedAt: now }
      });
    }
    return db.briaObserverSignal.update({
      where: { id: existing.id },
      data: {
        ...detection,
        status: reopens ? 'OPEN' : existing.status,
        lastDetectedAt: now,
        ...(reopens ? { resolvedAt: null, dismissedAt: null, snoozedUntil: null } : {})
      }
    });
  },
  // Only sources examined in this scan may be resolved by absence: a source
  // left outside the read window is unknown, not solved.
  resolveMissing: (detectorKey, activeKeys, now = new Date(), { scopeRecordIds = null } = {}) => db.briaObserverSignal.updateMany({
    where: {
      detectorKey,
      status: { in: ACTIVE_STATUSES },
      ...(activeKeys.length ? { dedupeKey: { notIn: activeKeys } } : {}),
      ...(scopeRecordIds ? { sourceRecordId: { in: scopeRecordIds } } : {})
    },
    data: { status: 'RESOLVED', resolvedAt: now, snoozedUntil: null }
  })
});

export const reconcileObserverDetections = async ({ detectorKey, detections = [], repository = createPrismaObserverRepository(), now = new Date(), scopeRecordIds = null }) => {
  const normalized = detections.filter((item) => item?.detectorKey === detectorKey && item?.dedupeKey && item?.title && item?.evidence);
  for (const detection of normalized) await repository.upsertDetection(detection, now);
  const resolvedResult = await repository.resolveMissing(detectorKey, normalized.map((item) => item.dedupeKey), now, { scopeRecordIds });
  return {
    detectorKey,
    detected: normalized.length,
    unverified: normalized.filter((item) => item.grounding === 'UNVERIFIED').length,
    resolved: Number(resolvedResult?.count || 0)
  };
};

export const reconcileBriaObserver = async ({ db = prisma, now = new Date(), logger = console } = {}) => {
  const baselineRepository = createPrismaObserverBaselineRepository(db);
  const minuteBaseline = await initializeObserverDetectorBaseline({
    detectorKey: 'MINUTE_SIGNAL',
    repository: baselineRepository,
    now
  });
  const [analytics, minutes] = await Promise.all([
    getManagerTaskAnalytics({ periodDays: 30, now, prismaClient: db }),
    db.meetingMinute.findMany({
      where: { status: 'READY', deletedAt: null, meetingAt: { gte: minuteBaseline.activatedAt } },
      orderBy: { updatedAt: 'desc' },
      take: 500
    })
  ]);
  const repository = createPrismaObserverRepository(db);
  const taskResult = await reconcileObserverDetections({
    detectorKey: 'TASK_ANALYTICS',
    detections: buildTaskAnalyticsObserverDetections(analytics),
    repository,
    now
  });
  const minuteResult = await reconcileObserverDetections({
    detectorKey: 'MINUTE_SIGNAL',
    detections: minutes.flatMap((minute) => buildMinuteObserverDetections(minute, { activatedAt: minuteBaseline.activatedAt })),
    // The read window is capped: only the minutes actually examined are in scope.
    scopeRecordIds: minutes.map((minute) => minute.id),
    repository,
    now
  });
  await baselineRepository.markScanned('MINUTE_SIGNAL', now);
  const result = {
    scannedAt: now,
    detectors: [taskResult, minuteResult],
    detected: taskResult.detected + minuteResult.detected,
    historicalArchived: minuteBaseline.archived
  };
  logger.info(`[BriaObserver] Escaneo completado: ${result.detected} señales activas detectadas.`);
  return result;
};

export const getObserverInbox = async ({ db = prisma, status = 'ACTIVE', limit = 60, now = new Date() } = {}) => {
  const normalizedStatus = clean(status).toUpperCase();
  // An alert without a verifiable quote is never presented as actionable work;
  // it stays available under its own filter so the misses can be counted.
  const where = normalizedStatus === 'ACTIVE'
    ? { AND: [GROUNDED_FILTER, { OR: [{ status: { in: ['OPEN', 'REVIEWED'] } }, { status: 'SNOOZED', snoozedUntil: { lte: now } }] }] }
    : normalizedStatus === 'ALL' ? {}
      : normalizedStatus === 'UNVERIFIED' ? { grounding: 'UNVERIFIED', status: { in: ACTIVE_STATUSES } }
        : { status: VALID_STATUSES.includes(normalizedStatus) ? normalizedStatus : 'OPEN' };
  const [signals, grouped, latest, latestScan, unverified] = await Promise.all([
    db.briaObserverSignal.findMany({ where, orderBy: [{ lastDetectedAt: 'desc' }], take: Math.min(Math.max(Number(limit) || 60, 1), 200) }),
    db.briaObserverSignal.groupBy({ by: ['status'], _count: { _all: true } }),
    db.briaObserverSignal.findFirst({ orderBy: { lastDetectedAt: 'desc' }, select: { lastDetectedAt: true } }),
    db.briaObserverDetectorState.findFirst({ where: { lastScannedAt: { not: null } }, orderBy: { lastScannedAt: 'desc' }, select: { lastScannedAt: true } }),
    db.briaObserverSignal.count({ where: { grounding: 'UNVERIFIED', status: { in: ACTIVE_STATUSES } } })
  ]);
  const counts = Object.fromEntries(grouped.map((item) => [item.status, item._count._all]));
  return {
    summary: {
      active: (counts.OPEN || 0) + (counts.REVIEWED || 0),
      open: counts.OPEN || 0,
      reviewed: counts.REVIEWED || 0,
      snoozed: counts.SNOOZED || 0,
      dismissed: counts.DISMISSED || 0,
      resolved: counts.RESOLVED || 0,
      historical: counts.ARCHIVED || 0,
      unverified: Number(unverified || 0),
      lastScannedAt: latestScan?.lastScannedAt || latest?.lastDetectedAt || null
    },
    signals
  };
};

export const updateObserverSignalStatus = async ({ id, action, snoozedUntil, actorId, db = prisma, now = new Date() } = {}) => {
  if (!id) throw new Error('OBSERVER_SIGNAL_ID_REQUIRED');
  const transition = transitionObserverSignal(action, { now, snoozedUntil });
  return db.briaObserverSignal.update({ where: { id }, data: { ...transition, lastActionById: actorId || null } });
};
