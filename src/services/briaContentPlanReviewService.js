import { createHash } from 'node:crypto';
import { AI_MODELS } from '../config/aiConfig.js';
import prisma from '../lib/prisma.js';
import { createOpenAIClient } from './openAIClient.js';
import { getAIInstance } from './aiService.js';
import { getContentPlanById } from './contentService.js';
import { searchBriaMemory } from './briaMemoryService.js';

export const CONTENT_PLAN_REVIEW_PROMPT_VERSION = 'content-plan-review-v2';

const REVIEW_CATEGORIES = new Set(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA']);
const REVIEW_SEVERITIES = new Set(['INFO', 'WARNING', 'CRITICAL']);
const REVIEW_VERDICTS = new Set(['ALINEADA', 'REQUIERE_AJUSTES', 'RIESGO']);
const REVIEW_FIELDS = new Set(['objective', 'format', 'copyText', 'captionText', 'publishDate', 'plan']);
const DIMENSION_WEIGHTS = { ESTRATEGIA: 30, MARCA: 25, GRAMATICA: 25, CONSISTENCIA: 20 };

const DIMENSION_SCHEMA = {
  type: 'object',
  required: ['score', 'confidence', 'assessable', 'note'],
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    assessable: { type: 'boolean' },
    note: { type: 'string' }
  }
};

const CONTENT_PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['summary', 'verdict', 'dimensions', 'findings'],
  properties: {
    summary: { type: 'string' },
    verdict: { type: 'string', enum: [...REVIEW_VERDICTS] },
    dimensions: {
      type: 'object',
      required: [...REVIEW_CATEGORIES],
      properties: Object.fromEntries([...REVIEW_CATEGORIES].map((key) => [key, DIMENSION_SCHEMA]))
    },
    findings: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        required: ['ruleKey', 'field', 'category', 'severity', 'title', 'detail', 'recommendation', 'itemId', 'evidenceIds'],
        properties: {
          ruleKey: { type: 'string' },
          field: { type: ['string', 'null'] },
          category: { type: 'string', enum: [...REVIEW_CATEGORIES] },
          severity: { type: 'string', enum: [...REVIEW_SEVERITIES] },
          title: { type: 'string' },
          detail: { type: 'string' },
          recommendation: { type: 'string' },
          itemId: { type: ['string', 'null'] },
          evidenceIds: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const cleanString = (value, maxLength = 4000) => String(value || '').trim().slice(0, maxLength);
const hashValue = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const compactPlan = (plan) => ({
  id: plan.id,
  client: {
    id: plan.client?.id || plan.clientId,
    name: plan.client?.name || '',
    instructions: cleanString(plan.client?.aiInstructions, 3000)
  },
  period: `${plan.month}/${plan.year}`,
  strategicObjectives: cleanString(plan.strategicObjectives, 3000),
  internalNotes: cleanString(plan.internalNotes, 3000),
  items: (plan.items || plan.contentItems || [])
    .slice(0, 60)
    .map((item) => ({
      id: String(item.id), objective: cleanString(item.objective, 500), format: cleanString(item.format, 120),
      copyText: cleanString(item.copyText, 1800), captionText: cleanString(item.captionText, 1800),
      clientFeedback: cleanString(item.comments, 1000), internalNotes: cleanString(item.internalNotes, 1000),
      publishDate: item.publishDate || null, status: item.status || null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
});

export const buildContentPlanRevisionHash = (plan) => hashValue(compactPlan(plan));
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

const normalizeDimension = (dimension) => ({
  score: Math.min(100, Math.max(0, Math.round(Number(dimension?.score) || 0))),
  confidence: Math.min(1, Math.max(0, Number(dimension?.confidence) || 0)),
  assessable: dimension?.assessable !== false,
  note: cleanString(dimension?.note, 500)
});

export const calculateContentPlanReviewScore = (dimensions = {}) => {
  const assessableDimensions = Object.keys(DIMENSION_WEIGHTS)
    .filter((key) => dimensions[key] && dimensions[key]?.assessable !== false);
  const availableWeight = assessableDimensions.reduce((total, key) => total + DIMENSION_WEIGHTS[key], 0);
  const weightedScore = assessableDimensions.reduce(
    (total, key) => total + normalizeDimension(dimensions[key]).score * DIMENSION_WEIGHTS[key], 0
  );
  return {
    score: availableWeight ? Math.round(weightedScore / availableWeight) : 0,
    coverage: availableWeight,
    assessableDimensions
  };
};

export const transitionContentPlanFinding = (currentStatus, action, {
  now = new Date(), actorUserId = null, reason = null
} = {}) => {
  if (!['OPEN', 'VERIFYING'].includes(currentStatus)) throw new Error('Este hallazgo ya no admite esa acción.');
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

export const parseBriaContentPlanReview = (rawText) => {
  const cleaned = String(rawText || '').replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  const dimensions = Object.fromEntries(Object.keys(DIMENSION_WEIGHTS).map((key) => [key, normalizeDimension(parsed.dimensions?.[key])]));
  const hasDimensions = parsed.dimensions && typeof parsed.dimensions === 'object';
  const calculated = calculateContentPlanReviewScore(dimensions);
  const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 12) : [];
  return {
    summary: cleanString(parsed.summary, 1200),
    verdict: REVIEW_VERDICTS.has(parsed.verdict) ? parsed.verdict : 'REQUIERE_AJUSTES',
    score: hasDimensions ? calculated.score : Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0))),
    coverage: hasDimensions ? calculated.coverage : 100,
    assessableDimensions: hasDimensions ? calculated.assessableDimensions : [...REVIEW_CATEGORIES],
    dimensions,
    findings: findings.map((finding) => ({
      ruleKey: cleanString(finding?.ruleKey || `${finding?.category || 'CONSISTENCIA'}_${finding?.title || 'GENERAL'}`, 120),
      field: REVIEW_FIELDS.has(finding?.field) ? finding.field : null,
      category: REVIEW_CATEGORIES.has(finding?.category) ? finding.category : 'CONSISTENCIA',
      severity: REVIEW_SEVERITIES.has(finding?.severity) ? finding.severity : 'INFO',
      title: cleanString(finding?.title, 180), detail: cleanString(finding?.detail, 800),
      recommendation: cleanString(finding?.recommendation, 800),
      itemId: finding?.itemId ? String(finding.itemId) : null,
      evidenceIds: Array.isArray(finding?.evidenceIds) ? [...new Set(finding.evidenceIds.map(String))].slice(0, 6) : []
    }))
  };
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

const toApiResult = (run, findings = [], planState = 'CURRENT') => ({
  review: {
    summary: run.summary, verdict: run.verdict, score: run.score, coverage: run.coverage,
    dimensions: run.dimensions || {}, findings
  },
  evidence: Array.isArray(run.evidenceSnapshot) ? run.evidenceSnapshot : [],
  meta: {
    clientId: run.clientId || null, planId: run.planId, model: run.model, requestId: run.requestId,
    reviewedAt: run.completedAt?.toISOString?.() || run.meta?.reviewedAt || null,
    memorySourcesUsed: Array.isArray(run.evidenceSnapshot) ? run.evidenceSnapshot.length : 0,
    revisionHash: run.revisionHash, analysisHash: run.analysisHash, promptVersion: run.promptVersion,
    cached: false, state: planState
  }
});

const createPrismaRepository = (db = prisma) => ({
  async markCurrent(planId, startedAt) {
    await db.contentPlan.updateMany({
      where: { id: planId, OR: [{ briaReviewRequestedAt: null }, { briaReviewRequestedAt: { lte: startedAt } }] },
      data: { briaReviewState: 'CURRENT', briaReviewStartedAt: null, briaReviewError: null }
    });
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
  async saveCompletedReview({ analysisHash, revisionHash, promptVersion, result, plan, trigger, requestedById, startedAt }) {
    return db.$transaction(async (tx) => {
      const run = await tx.contentPlanReview.upsert({
        where: { planId_analysisHash: { planId: plan.id, analysisHash } },
        create: {
          planId: plan.id, revisionHash, analysisHash, promptVersion, status: 'COMPLETED', trigger,
          summary: result.review.summary, verdict: result.review.verdict, score: result.review.score,
          coverage: result.review.coverage, dimensions: result.review.dimensions,
          findingsSnapshot: result.review.findings, evidenceSnapshot: result.evidence,
          model: result.meta.model, requestId: result.meta.requestId, requestedById,
          startedAt, completedAt: new Date(result.meta.reviewedAt)
        },
        update: {
          status: 'COMPLETED', trigger, summary: result.review.summary, verdict: result.review.verdict,
          score: result.review.score, coverage: result.review.coverage, dimensions: result.review.dimensions,
          findingsSnapshot: result.review.findings, evidenceSnapshot: result.evidence,
          model: result.meta.model, requestId: result.meta.requestId, requestedById,
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
            ...(retainDismissal ? {} : { status: 'OPEN', actionReason: null, dismissedAt: null, resolvedAt: null })
          }
        });
      }
      await tx.contentPlanReviewFinding.updateMany({
        where: {
          planId: plan.id,
          status: { in: ['OPEN', 'VERIFYING'] },
          ...(detectedFingerprints.length ? { fingerprint: { notIn: detectedFingerprints } } : {})
        },
        data: { status: 'RESOLVED', resolvedAt: new Date(result.meta.reviewedAt) }
      });
      await tx.contentPlan.updateMany({
        where: { id: plan.id, OR: [{ briaReviewRequestedAt: null }, { briaReviewRequestedAt: { lte: startedAt } }] },
        data: { briaReviewState: 'CURRENT', briaReviewStartedAt: null, briaReviewError: null }
      });
      const findings = await tx.contentPlanReviewFinding.findMany({
        where: { planId: plan.id, status: { in: ['OPEN', 'VERIFYING'] } },
        orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }]
      });
      return toApiResult(run, findings, 'CURRENT');
    });
  }
});

export const getContentPlanReview = async (planId, { db = prisma } = {}) => {
  const [plan, run, findings] = await Promise.all([
    db.contentPlan.findUnique({
      where: { id: planId },
      select: { id: true, clientId: true, briaReviewState: true, briaReviewError: true, briaReviewRequestedAt: true }
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
      requestedAt: plan.briaReviewRequestedAt, cached: true
    }
  };
  const result = toApiResult({ ...run, clientId: plan.clientId }, findings, plan.briaReviewState);
  result.meta.cached = true;
  result.meta.error = plan.briaReviewError;
  return result;
};

export const updateContentPlanReviewFinding = async ({
  planId, findingId, action, reason, actorUserId, db = prisma, now = new Date()
}) => {
  const finding = await db.contentPlanReviewFinding.findFirst({ where: { id: findingId, planId } });
  if (!finding) return null;
  const data = transitionContentPlanFinding(finding.status, action, { now, actorUserId, reason });
  return db.contentPlanReviewFinding.update({ where: { id: finding.id }, data });
};

export const reviewContentPlanWithBria = async ({
  planId, getPlan = getContentPlanById, searchMemory = searchBriaMemory, ai = defaultAi(), repository,
  trigger = 'MANUAL', requestedById = null, force = false, now = () => new Date()
} = {}) => {
  const startedAt = now();
  const plan = await getPlan(planId);
  if (!plan) {
    const error = new Error('La parrilla no existe o ya no está disponible.');
    error.code = 'CONTENT_PLAN_NOT_FOUND';
    throw error;
  }
  const client = plan.client || { id: plan.clientId, name: '', slug: '' };
  const candidates = await searchMemory({
    query: buildContentPlanReviewQuery(plan), clientId: client.id, includeUnscoped: true, limit: 16
  });
  const evidence = candidates.filter((item) => belongsToClient(item, client)).slice(0, 8).map(presentEvidence);
  const revisionHash = buildContentPlanRevisionHash(plan);
  const analysisHash = buildContentPlanAnalysisHash({ revisionHash, evidence, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION });
  const persistence = repository || (getPlan === getContentPlanById ? createPrismaRepository() : null);
  const cached = force ? null : await persistence?.findByAnalysisHash?.(analysisHash, { planId: plan.id });
  if (cached) {
    await persistence?.markCurrent?.(plan.id, startedAt);
    return { ...cached, meta: { ...cached.meta, revisionHash, analysisHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION, cached: true, state: 'CURRENT' } };
  }

  const prompt = [
    'Revisa esta parrilla de contenido de Brainstudio como un sistema profesional de control de calidad.',
    'Evalúa por separado ESTRATEGIA (30%), MARCA (25%), GRAMATICA (25%) y CONSISTENCIA (20%).',
    'Marca una dimensión assessable=false cuando falte evidencia suficiente; no castigues el puntaje por información ausente.',
    'Usa la memoria solo como evidencia histórica y contexto: no conviertas acuerdos viejos en tareas vigentes.',
    'No inventes decisiones. Si una observación depende de memoria, incluye únicamente IDs de EVIDENCIA disponibles.',
    'Cada hallazgo debe tener un ruleKey estable y específico; field indica objective, format, copyText, captionText, publishDate o plan.',
    'Las observaciones puramente textuales pueden dejar evidenceIds vacío y deben señalar el itemId.',
    'Prioriza pocos hallazgos concretos, verificables y accionables. No modifiques la parrilla.',
    `\nPARRILLA ACTUAL:\n${JSON.stringify(compactPlan(plan))}`,
    `\nEVIDENCIA DEL CLIENTE:\n${JSON.stringify(evidence)}`
  ].join('\n');
  const aiResult = await ai.generate({
    model: AI_MODELS.fast,
    instructions: 'Eres Bria, directora de inteligencia operativa de Brainstudio. Responde solo con el JSON solicitado, en español claro y profesional.',
    prompt, responseSchema: CONTENT_PLAN_REVIEW_SCHEMA, maxOutputTokens: 5000
  });
  const review = parseBriaContentPlanReview(aiResult.text);
  const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
  const itemIds = new Set((plan.items || plan.contentItems || []).map((item) => String(item.id)));
  review.findings = review.findings.map((finding) => ({
    ...finding,
    itemId: finding.itemId && itemIds.has(finding.itemId) ? finding.itemId : null,
    evidenceIds: finding.evidenceIds.filter((id) => allowedEvidenceIds.has(id))
  }));
  const result = {
    review, evidence,
    meta: {
      clientId: client.id, planId: plan.id, model: aiResult.model || AI_MODELS.fast,
      requestId: aiResult.requestId || null, reviewedAt: now().toISOString(), memorySourcesUsed: evidence.length,
      revisionHash, analysisHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION, cached: false, state: 'CURRENT'
    }
  };
  return persistence?.saveCompletedReview
    ? persistence.saveCompletedReview({
        analysisHash, revisionHash, promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION,
        result, plan, trigger, requestedById, startedAt
      })
    : result;
};
