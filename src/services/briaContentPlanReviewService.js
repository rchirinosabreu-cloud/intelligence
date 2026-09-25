import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AI_MODELS } from '../config/aiConfig.js';
import { getGovernanceService } from './aiGovernanceService.js';
import { prepareGovernedReview } from './aiGovernanceGate.js';
import { summarizeAiCalls } from '../lib/aiUsage.js';
import prisma from '../lib/prisma.js';
import { createOpenAIClient } from './openAIClient.js';
import { getAIInstance } from './aiService.js';
import { getContentPlanById } from './contentService.js';
import { searchBriaMemory } from './briaMemoryService.js';
import { completeContentPlanReviewLease, supersededReviewError, markContentPlanReviewPending, saveContentPlanReviewCheckpoint } from './briaContentPlanReviewState.js';
import { verifyContentPlanFindings } from './briaFindingVerification.js';
import { getReviewBatchProgress } from './briaReviewBatches.js';
import { generateContentPlanReview, CONTENT_PLAN_REVIEW_PROMPT_VERSION } from './briaContentPlanReviewGenerator.js';
import { createClientCriterionService } from './briaClientCriterionService.js';
export { CONTENT_PLAN_REVIEW_PROMPT_VERSION } from './briaContentPlanReviewGenerator.js';
export { parseBriaContentPlanReview, calculateContentPlanReviewScore } from './briaContentPlanReviewContract.js';

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const cleanString = (value, maxLength = 4000) => String(value || '').trim().slice(0, maxLength);
const hashValue = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const compactPlan = (plan, { truncate = true, maxItems = 60 } = {}) => {
  const text = truncate ? cleanString : (value) => String(value || '').trim();
  return ({
  id: plan.id,
  client: {
    id: plan.client?.id || plan.clientId,
    name: plan.client?.name || '',
    instructions: text(plan.client?.aiInstructions, 3000),
    ...(plan.approvedCriteria?.length ? { approvedCriteria: [...plan.approvedCriteria].sort((a, b) => a.id.localeCompare(b.id)) } : {})
  },
  period: `${plan.month}/${plan.year}`,
  strategicObjectives: text(plan.strategicObjectives, 3000),
  internalNotes: text(plan.internalNotes, 3000),
  items: (plan.items || plan.contentItems || [])
    .filter((item) => !item.deletedAt)
    .slice(0, maxItems)
    .map((item) => ({
      id: String(item.id), objective: text(item.objective, 500), format: text(item.format, 120),
      copyText: text(item.copyText, 1800), captionText: text(item.captionText, 1800),
      clientFeedback: text(item.comments, 1000), internalNotes: text(item.internalNotes, 1000),
      publishDate: item.publishDate || null, status: item.status || null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  });
};

export const buildContentPlanRevisionHash = (plan) => hashValue(compactPlan(plan, { truncate: false, maxItems: Infinity }));
export const buildContentPlanAnalysisHash = ({ revisionHash, evidence, promptVersion }) => hashValue({
  revisionHash,
  promptVersion,
  evidence: [...(evidence || [])]
    .map((item) => ({ id: String(item.id), content: cleanString(item.content, 1800) }))
    .sort((a, b) => a.id.localeCompare(b.id))
});
export const buildFindingFingerprint = ({ planId, itemId, ruleKey, field }) => hashValue({
  planId: String(planId || ''),
  itemId: String(itemId || 'PLAN'),
  ruleKey: normalizeText(ruleKey || 'general').replace(/\s+/g, '_'),
  field: normalizeText(field || 'plan')
});

export const transitionContentPlanFinding = (currentStatus, action, {
  now = new Date(), actorUserId = null, reason = null
} = {}) => {
  if (!['OPEN', 'VERIFYING'].includes(currentStatus)) throw new Error('Este hallazgo ya no admite esa acción.');
  if (action === 'UNDO_CORRECTION' && currentStatus === 'VERIFYING') {
    return { status: 'OPEN', resolvedAt: null, lastActionAt: now, lastActionById: actorUserId, actionReason: null };
  }
  if (action === 'MARK_CORRECTED') {
    return { status: 'VERIFYING', resolvedAt: null, dismissedAt: null, lastActionAt: now, lastActionById: actorUserId, actionReason: null };
  }
  if (action === 'DISMISS') {
    const actionReason = cleanString(reason, 300);
    if (!actionReason) throw new Error('Debes indicar un motivo para descartar el hallazgo.');
    return { status: 'DISMISSED', resolvedAt: null, dismissedAt: now, lastActionAt: now, lastActionById: actorUserId, actionReason };
  }
  throw new Error('Acción de hallazgo no válida.');
};

export const buildContentPlanReviewQuery = (plan) => [
  `Cliente: ${plan?.client?.name || plan?.clientId || 'sin identificar'}.`,
  plan?.strategicObjectives ? `Objetivo actual: ${plan.strategicObjectives}.` : null,
  'Decisiones, preferencias, reglas de marca, correcciones, tono, audiencias, acuerdos y aprendizajes aplicables a su contenido.'
].filter(Boolean).join(' ');

const belongsToClient = (evidence, client) => {
  if (evidence.clientId) return evidence.clientId === client.id;
  const clientName = normalizeText(client.name);
  const clientSlug = normalizeText(client.slug);
  const haystack = normalizeText(`${evidence.title || ''} ${evidence.subtitle || ''} ${evidence.content || ''}`);
  if (clientName.length >= 4 && haystack.includes(clientName)) return true;
  return clientSlug.length >= 4 && haystack.includes(clientSlug);
};
const presentEvidence = (item) => ({
  id: String(item.id), title: cleanString(item.title, 240), subtitle: cleanString(item.subtitle, 300) || null,
  sourceKind: item.sourceKind || 'MEETING_MINUTE', sourceUrl: item.sourceUrl || null,
  content: cleanString(item.content, 1800), score: Number(item.score || 0)
});
const defaultAi = () => getAIInstance() || createOpenAIClient({ models: AI_MODELS });
const subjectForFinding = (finding, plan) => {
  const item = (plan.items || plan.contentItems || []).find(({ id }) => String(id) === finding.itemId);
  return finding.field === 'plan'
    ? `${plan.strategicObjectives || ''}|${plan.internalNotes || ''}`
    : item?.[finding.field] ?? `${finding.detail}|${finding.recommendation}`;
};

// What one published review cost: the batch calls (paid now or by the attempt
// that wrote the checkpoint) plus the verification calls made in this run.
// Verification costs one model call per four findings, each carrying the whole
// plan. A plan with 157 open findings would need ~40 sequential calls, which
// never fits the job deadline: it spends money and publishes nothing. So each
// run verifies a bounded slice — everything a person marked as corrected first,
// then the open findings checked longest ago, rotating over the runs.
export const VERIFICATION_BUDGET = 12;

const verifiedAt = (finding) => {
  const value = finding?.lastVerifiedAt ?? finding?.verification?.checkedAt ?? null;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : -Infinity;
};
const claimedAt = (finding) => {
  const time = finding?.lastActionAt ? new Date(finding.lastActionAt).getTime() : NaN;
  return Number.isFinite(time) ? time : -Infinity;
};

export const selectFindingsToVerify = (findings, { budget = VERIFICATION_BUDGET } = {}) => {
  const list = Array.isArray(findings) ? findings : [];
  const claimed = list.filter((finding) => finding?.status === 'VERIFYING').sort((a, b) => claimedAt(a) - claimedAt(b));
  const open = list.filter((finding) => finding?.status !== 'VERIFYING').sort((a, b) => verifiedAt(a) - verifiedAt(b));
  return [...claimed, ...open].slice(0, budget);
};

export const buildContentPlanReviewUsage = ({ review = null, verification = null } = {}) => {
  // Discarded answers (lots the model did not confirm) were paid for: they count in the totals.
  const parts = [review, review?.discarded, verification].filter(Boolean);
  const total = field => parts.reduce((sum, part) => sum + (Number(part[field]) || 0), 0);
  return {
    version: 1, review, verification,
    totals: {
      calls: total('calls'), callsWithUsage: total('callsWithUsage'), inputTokens: total('inputTokens'),
      outputTokens: total('outputTokens'), totalTokens: total('totalTokens'), latencyMs: total('latencyMs'),
      models: [...new Set(parts.flatMap(part => part.models || []))].sort()
    }
  };
};

// Volumen de hallazgos (Rodny, 25 de septiembre de 2026). Revisar cien tarjetas
// cuesta más que hacer la parrilla, así que una revisión publica pocas y buenas:
// las informativas no entran, ninguna pieza acapara la lista y el total cabe en
// una sentada. El puntaje no depende de esto: lo calculan las dimensiones.
export const MAX_FINDINGS_PER_ITEM = 3;
export const MAX_FINDINGS_PER_PLAN = 15;
const PUBLISHABLE_SEVERITIES = { CRITICAL: 2, WARNING: 1 };

export const selectPublishableFindings = (findings, {
  maxPerItem = MAX_FINDINGS_PER_ITEM,
  maxTotal = MAX_FINDINGS_PER_PLAN
} = {}) => {
  const byPriority = (a, b) => (PUBLISHABLE_SEVERITIES[b.finding.severity] - PUBLISHABLE_SEVERITIES[a.finding.severity]) || (a.index - b.index);
  const publishable = (Array.isArray(findings) ? findings : [])
    .filter((finding) => PUBLISHABLE_SEVERITIES[finding?.severity])
    .map((finding, index) => ({ finding, index }));
  // Lo que afecta a la parrilla entera (estrategia, calendario) entra primero y
  // con cupo propio: si compitiera por orden, veinte piezas lo dejarían fuera.
  const ordered = [
    ...publishable.filter(({ finding }) => !finding.itemId).sort(byPriority).slice(0, maxPerItem),
    ...publishable.filter(({ finding }) => finding.itemId).sort(byPriority)
  ];
  const perItem = new Map();
  const selected = [];
  for (const { finding } of ordered) {
    if (selected.length >= maxTotal) break;
    if (finding.itemId) {
      const used = perItem.get(finding.itemId) || 0;
      if (used >= maxPerItem) continue;
      perItem.set(finding.itemId, used + 1);
    }
    selected.push(finding);
  }
  return selected;
};

const toApiResult = (run, findings = [], planState = 'CURRENT') => ({
  review: {
    summary: run.summary, verdict: run.verdict, score: run.score, coverage: run.coverage,
    dimensions: run.dimensions || {}, scope: run.scope || null, findings
  },
  evidence: Array.isArray(run.evidenceSnapshot) ? run.evidenceSnapshot : [],
  meta: {
    clientId: run.clientId || null, planId: run.planId, model: run.model, requestId: run.requestId,
    reviewedAt: run.completedAt?.toISOString?.() || run.meta?.reviewedAt || null,
    memorySourcesUsed: Array.isArray(run.evidenceSnapshot) ? run.evidenceSnapshot.length : 0,
    revisionHash: run.revisionHash, analysisHash: run.analysisHash, promptVersion: run.promptVersion,
    usage: run.usage || run.meta?.usage || null,
    cached: false, state: planState
  }
});

const guardReviewPublication = async (tx, { planId, execution, revisionHash, now, signal }) => {
  signal?.throwIfAborted();
  await completeContentPlanReviewLease(tx, execution, now());
  const currentPlan = await tx.contentPlan.findUnique({
    where: { id: planId }, include: { client: true, contentItems: { where: { deletedAt: null } } }
  });
  if (currentPlan) currentPlan.approvedCriteria = await createClientCriterionService(tx).approved(currentPlan.clientId, currentPlan.id);
  if (!currentPlan || buildContentPlanRevisionHash(currentPlan) !== revisionHash) throw supersededReviewError();
  signal?.throwIfAborted();
};

export const createContentPlanReviewRepository = (db = prisma) => ({
  findApprovedCriteria: (clientId, planId) => createClientCriterionService(db).approved(clientId, planId),
  async loadCheckpoint(planId) {
    const plan = await db.contentPlan.findUnique({ where: { id: planId }, select: { briaReviewCheckpoint: true } });
    return plan?.briaReviewCheckpoint;
  },
  async saveCheckpoint(planId, checkpoint, { execution, now, signal }) {
    signal?.throwIfAborted();
    if (execution?.planId !== planId) throw supersededReviewError();
    await saveContentPlanReviewCheckpoint(db, execution, checkpoint, now());
  },
  async findActiveFindings(planId) {
    return db.contentPlanReviewFinding.findMany({ where: { planId, status: { in: ['OPEN', 'VERIFYING'] } }, orderBy: { firstDetectedAt: 'asc' } });
  },
  async markCurrent(planId, _startedAt, guard) {
    await db.$transaction(tx => guardReviewPublication(tx, { ...guard, planId }));
  },
  async findByAnalysisHash(analysisHash, { planId } = {}) {
    if (!planId) return null;
    const run = await db.contentPlanReview.findUnique({ where: { planId_analysisHash: { planId, analysisHash } } });
    if (!run || run.status !== 'COMPLETED') return null;
    const [findings, planState] = await Promise.all([
      db.contentPlanReviewFinding.findMany({
        where: { planId, status: { in: ['OPEN', 'VERIFYING'] } },
        orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }]
      }),
      db.contentPlan.findUnique({ where: { id: planId }, select: { briaReviewState: true } })
    ]);
    return toApiResult(run, findings, planState?.briaReviewState || 'CURRENT');
  },
  async saveCompletedReview({ analysisHash, revisionHash, promptVersion, result, verifications = [], plan, trigger, requestedById, startedAt, execution, now, signal }) {
    return db.$transaction(async (tx) => {
      await guardReviewPublication(tx, { planId: plan.id, execution, revisionHash, now, signal });
      const run = await tx.contentPlanReview.upsert({
        where: { planId_analysisHash: { planId: plan.id, analysisHash } },
        create: {
          planId: plan.id, revisionHash, analysisHash, promptVersion, status: 'COMPLETED', trigger,
          summary: result.review.summary, verdict: result.review.verdict, score: result.review.score,
          coverage: result.review.coverage, dimensions: result.review.dimensions, scope: result.review.scope,
          findingsSnapshot: result.review.findings, evidenceSnapshot: result.evidence,
          model: result.meta.model, requestId: result.meta.requestId, requestedById,
          ...(result.meta.usage ? { usage: result.meta.usage } : {}),
          startedAt, completedAt: new Date(result.meta.reviewedAt)
        },
        update: {
          status: 'COMPLETED', trigger, summary: result.review.summary, verdict: result.review.verdict,
          score: result.review.score, coverage: result.review.coverage, dimensions: result.review.dimensions, scope: result.review.scope,
          findingsSnapshot: result.review.findings, evidenceSnapshot: result.evidence,
          model: result.meta.model, requestId: result.meta.requestId, requestedById,
          usage: result.meta.usage ?? Prisma.DbNull,
          startedAt, completedAt: new Date(result.meta.reviewedAt), errorMessage: null
        }
      });
      const detectedFingerprints = [];
      for (const finding of result.review.findings) {
        const fingerprint = buildFindingFingerprint({ planId: plan.id, ...finding });
        const subjectHash = hashValue(subjectForFinding(finding, plan));
        detectedFingerprints.push(fingerprint);
        const previous = await tx.contentPlanReviewFinding.findUnique({
          where: { planId_fingerprint: { planId: plan.id, fingerprint } }
        });
        const retainDismissal = previous?.status === 'DISMISSED' && previous.subjectHash === subjectHash;
        await tx.contentPlanReviewFinding.upsert({
          where: { planId_fingerprint: { planId: plan.id, fingerprint } },
          create: {
            planId: plan.id, itemId: finding.itemId, lastReviewId: run.id, fingerprint, subjectHash,
            ruleKey: finding.ruleKey, field: finding.field, category: finding.category, severity: finding.severity,
            title: finding.title, detail: finding.detail, recommendation: finding.recommendation,
            evidenceIds: finding.evidenceIds
          },
          update: {
            itemId: finding.itemId, lastReviewId: run.id, subjectHash, ruleKey: finding.ruleKey, field: finding.field,
            category: finding.category, severity: finding.severity, title: finding.title, detail: finding.detail,
            recommendation: finding.recommendation, evidenceIds: finding.evidenceIds,
            lastDetectedAt: new Date(result.meta.reviewedAt),
            ...(retainDismissal ? {} : { status: 'OPEN', actionReason: null, dismissedAt: null, resolvedAt: null, verification: Prisma.DbNull })
          }
        });
      }
      for (const decision of verifications) {
        const previous = await tx.contentPlanReviewFinding.findFirst({ where: { id: decision.findingId, planId: plan.id } });
        // A dismissal made while AI was running remains the team's decision.
        if (!previous || !['OPEN', 'VERIFYING'].includes(previous.status)) continue;
        const contradicted = decision.outcome === 'RESOLVED' && detectedFingerprints.includes(previous.fingerprint);
        const conclusion = contradicted ? { ...decision, outcome: 'INCONCLUSIVE', reason: 'La revisión y la verificación no coinciden. El hallazgo sigue abierto para comprobarlo.' } : decision;
        const resolved = conclusion.outcome === 'RESOLVED';
        await tx.contentPlanReviewFinding.update({ where: { id: previous.id }, data: {
          status: resolved ? 'RESOLVED' : 'OPEN', resolvedAt: resolved ? new Date(result.meta.reviewedAt) : null,
          verification: { ...conclusion, checkedAt: result.meta.reviewedAt, revisionHash },
          // Feeds the rotation: the ones checked longest ago go first next time.
          lastVerifiedAt: new Date(result.meta.reviewedAt), lastReviewId: run.id
        } });
      }
      // Un hallazgo que ya no aparece deja de ocupar la lista activa. No se
      // declara resuelto —no aparecer no lo demuestra— y vuelve a abrirse solo
      // si una revisión posterior lo detecta otra vez. Sin esto la pila crece
      // para siempre: nada cerraba lo que dejaba de detectarse.
      if (result.review.scope?.complete) {
        const examined = verifications.map((decision) => decision.findingId).filter(Boolean);
        await tx.contentPlanReviewFinding.updateMany({
          where: {
            planId: plan.id,
            status: 'OPEN',
            ...(detectedFingerprints.length ? { fingerprint: { notIn: detectedFingerprints } } : {}),
            // Lo que se acaba de comprobar conserva el resultado de su verificación.
            ...(examined.length ? { id: { notIn: examined } } : {})
          },
          data: {
            status: 'STALE',
            actionReason: 'Ya no se detecta en la parrilla actual',
            lastActionAt: new Date(result.meta.reviewedAt),
            lastActionById: null
          }
        });
      }
      const findings = await tx.contentPlanReviewFinding.findMany({
        where: { planId: plan.id, status: { in: ['OPEN', 'VERIFYING'] } },
        orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }]
      });
      signal?.throwIfAborted();
      return toApiResult(run, findings, 'CURRENT');
    });
  }
});

export const getContentPlanReview = async (planId, { db = prisma } = {}) => {
  const [plan, run, findings] = await Promise.all([
    db.contentPlan.findUnique({
      where: { id: planId },
      select: { id: true, clientId: true, briaReviewState: true, briaReviewError: true, briaReviewRequestedAt: true, briaReviewStartedAt: true, briaReviewCheckpoint: true, briaReviewDiagnostics: true }
    }),
    db.contentPlanReview.findFirst({ where: { planId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } }),
    db.contentPlanReviewFinding.findMany({
      where: { planId, status: { in: ['OPEN', 'VERIFYING'] } },
      orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }]
    })
  ]);
  if (!plan) return null;
  if (!run) return {
    review: null, evidence: [],
    meta: {
      clientId: plan.clientId, planId, state: plan.briaReviewState, error: plan.briaReviewError,
      diagnostics: Array.isArray(plan.briaReviewDiagnostics) ? plan.briaReviewDiagnostics : null,
      requestedAt: plan.briaReviewRequestedAt, startedAt: plan.briaReviewStartedAt, cached: true, progress: getReviewBatchProgress(plan.briaReviewCheckpoint)
    }
  };
  const result = toApiResult({ ...run, clientId: plan.clientId }, findings, plan.briaReviewState);
  result.meta.cached = true;
  result.meta.error = plan.briaReviewError;
  result.meta.diagnostics = Array.isArray(plan.briaReviewDiagnostics) ? plan.briaReviewDiagnostics : null;
  result.meta.requestedAt = plan.briaReviewRequestedAt;
  result.meta.startedAt = plan.briaReviewStartedAt;
  result.meta.progress = getReviewBatchProgress(plan.briaReviewCheckpoint);
  return result;
};

export const updateContentPlanReviewFinding = async ({
  planId, findingId, action, reason, actorUserId, db = prisma, now = new Date()
}) => {
  return db.$transaction(async tx => {
    // Lock in the same order as publication: plan first, finding second.
    const plans = await tx.$queryRaw`SELECT "id" FROM "ContentPlan" WHERE "id" = ${planId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!plans.length) return null;
    const finding = await tx.contentPlanReviewFinding.findFirst({ where: { id: findingId, planId } });
    if (!finding) return null;
    const data = transitionContentPlanFinding(finding.status, action, { now, actorUserId, reason });
    const updated = await tx.contentPlanReviewFinding.update({ where: { id: finding.id }, data: {
      ...data, ...(action === 'DISMISS' ? {} : { verification: Prisma.DbNull })
    } });
    if (['MARK_CORRECTED', 'UNDO_CORRECTION'].includes(action)) await markContentPlanReviewPending(planId, { db: tx, requestedAt: now });
    return updated;
  });
};

export const reviewContentPlanWithBria = async ({
  planId, getPlan = getContentPlanById, searchMemory = searchBriaMemory, ai = defaultAi(), repository,
  trigger = 'MANUAL', requestedById = null, force = false, now = () => new Date(), execution, signal,
  governance = getPlan === getContentPlanById ? getGovernanceService() : null
} = {}) => {
  signal?.throwIfAborted();
  const startedAt = now();
  const loadedPlan = await getPlan(planId);
  if (!loadedPlan) {
    const error = new Error('La parrilla no existe o ya no está disponible.');
    error.code = 'CONTENT_PLAN_NOT_FOUND';
    throw error;
  }
  const persistence = repository || (getPlan === getContentPlanById ? createContentPlanReviewRepository() : null);
  const plan = { ...loadedPlan, approvedCriteria: await persistence?.findApprovedCriteria?.(loadedPlan.clientId || loadedPlan.client?.id, loadedPlan.id) || [] };
  const client = plan.client || { id: plan.clientId, name: '', slug: '' };
  const governed = await prepareGovernedReview({ ai, clientId: client.id, governance });
  const candidates = governed.useHistoricalMemory ? await searchMemory({
    query: buildContentPlanReviewQuery(plan), clientId: client.id, includeUnscoped: true, limit: 16
  }) : [];
  signal?.throwIfAborted();
  const evidence = [
    ...plan.approvedCriteria.map(criterion => ({
      id: `criterion:${criterion.id}:v${criterion.version}`, title: `Criterio validado · ${criterion.category}`,
      sourceKind: 'CLIENT_CRITERION', sourceUrl: `/parrillas/${plan.id}`, content: criterion.text, score: 1
    })),
    ...candidates.filter((item) => belongsToClient(item, client)).slice(0, 8).map(presentEvidence)
  ];
  const revisionHash = buildContentPlanRevisionHash(plan);
  const analysisHash = buildContentPlanAnalysisHash({ revisionHash, evidence, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION });
  const activeFindings = selectFindingsToVerify(await persistence?.findActiveFindings?.(plan.id) || []);
  const cached = force ? null : await persistence?.findByAnalysisHash?.(analysisHash, { planId: plan.id });
  if (cached && !activeFindings.some(finding => finding.status === 'VERIFYING') && !cached.review?.findings?.some(finding => finding.status === 'VERIFYING')) {
    await persistence?.markCurrent?.(plan.id, startedAt, { execution, revisionHash, now, signal });
    return { ...cached, meta: { ...cached.meta, revisionHash, analysisHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION, cached: true, state: 'CURRENT' } };
  }

  const snapshot = compactPlan(plan, { truncate: false, maxItems: Infinity });
  const aiResult = await generateContentPlanReview({
    snapshot, evidence, analysisHash, ai: governed.ai, signal,
    loadCheckpoint: () => persistence?.loadCheckpoint?.(plan.id),
    saveCheckpoint: checkpoint => persistence?.saveCheckpoint?.(plan.id, checkpoint, { execution, now, signal })
  });
  const review = { ...aiResult.review, findings: selectPublishableFindings(aiResult.review.findings) };
  const verificationCalls = [];
  const verifications = await verifyContentPlanFindings({
    snapshot, findings: activeFindings, evidence, ai: governed.ai, signal, calls: verificationCalls
  });
  const usage = buildContentPlanReviewUsage({
    review: aiResult.usage || null,
    verification: { ...summarizeAiCalls(verificationCalls), findings: activeFindings.length }
  });
  const result = {
    review, evidence,
    meta: {
      clientId: client.id, planId: plan.id, model: aiResult.model || AI_MODELS.fast,
      requestId: aiResult.requestId || null, reviewedAt: now().toISOString(), memorySourcesUsed: evidence.length,
      revisionHash, analysisHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION, usage, cached: false, state: 'CURRENT'
    }
  };
  return persistence?.saveCompletedReview
    ? persistence.saveCompletedReview({
        analysisHash, revisionHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION,
        result, verifications, plan, trigger, requestedById, startedAt, execution, now, signal
      })
    : result;
};
