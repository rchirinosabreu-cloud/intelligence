import { AI_MODELS } from '../config/aiConfig.js';
import { createOpenAIClient } from './openAIClient.js';
import { getAIInstance } from './aiService.js';
import { getContentPlanById } from './contentService.js';
import { searchBriaMemory } from './briaMemoryService.js';

const REVIEW_CATEGORIES = new Set(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA']);
const REVIEW_SEVERITIES = new Set(['INFO', 'WARNING', 'CRITICAL']);
const REVIEW_VERDICTS = new Set(['ALINEADA', 'REQUIERE_AJUSTES', 'RIESGO']);

const CONTENT_PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['summary', 'verdict', 'score', 'findings'],
  properties: {
    summary: { type: 'string' },
    verdict: { type: 'string', enum: [...REVIEW_VERDICTS] },
    score: { type: 'number', minimum: 0, maximum: 100 },
    findings: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        required: ['category', 'severity', 'title', 'detail', 'recommendation', 'itemId', 'evidenceIds'],
        properties: {
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

export const parseBriaContentPlanReview = (rawText) => {
  const cleaned = String(rawText || '').replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 12) : [];

  return {
    summary: cleanString(parsed.summary, 1200),
    verdict: REVIEW_VERDICTS.has(parsed.verdict) ? parsed.verdict : 'REQUIERE_AJUSTES',
    score: Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0))),
    findings: findings.map((finding) => ({
      category: REVIEW_CATEGORIES.has(finding?.category) ? finding.category : 'CONSISTENCIA',
      severity: REVIEW_SEVERITIES.has(finding?.severity) ? finding.severity : 'INFO',
      title: cleanString(finding?.title, 180),
      detail: cleanString(finding?.detail, 800),
      recommendation: cleanString(finding?.recommendation, 800),
      itemId: finding?.itemId ? String(finding.itemId) : null,
      evidenceIds: Array.isArray(finding?.evidenceIds)
        ? [...new Set(finding.evidenceIds.map(String))].slice(0, 6)
        : []
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
  items: (plan.items || plan.contentItems || []).slice(0, 60).map((item) => ({
    id: item.id,
    objective: cleanString(item.objective, 500),
    format: cleanString(item.format, 120),
    copyText: cleanString(item.copyText, 1800),
    captionText: cleanString(item.captionText, 1800),
    clientFeedback: cleanString(item.comments, 1000),
    internalNotes: cleanString(item.internalNotes, 1000),
    publishDate: item.publishDate || null
  }))
});

const presentEvidence = (item) => ({
  id: String(item.id),
  title: cleanString(item.title, 240),
  subtitle: cleanString(item.subtitle, 300) || null,
  sourceKind: item.sourceKind || 'MEETING_MINUTE',
  sourceUrl: item.sourceUrl || null,
  content: cleanString(item.content, 1800),
  score: Number(item.score || 0)
});

const defaultAi = () => getAIInstance() || createOpenAIClient({ models: AI_MODELS });

export const reviewContentPlanWithBria = async ({
  planId,
  getPlan = getContentPlanById,
  searchMemory = searchBriaMemory,
  ai = defaultAi(),
  now = () => new Date()
} = {}) => {
  const plan = await getPlan(planId);
  if (!plan) {
    const error = new Error('La parrilla no existe o ya no está disponible.');
    error.code = 'CONTENT_PLAN_NOT_FOUND';
    throw error;
  }
  const client = plan.client || { id: plan.clientId, name: '', slug: '' };
  const query = buildContentPlanReviewQuery(plan);
  const candidates = await searchMemory({
    query,
    clientId: client.id,
    includeUnscoped: true,
    limit: 16
  });
  const evidence = candidates
    .filter((item) => belongsToClient(item, client))
    .slice(0, 8)
    .map(presentEvidence);

  const prompt = [
    'Revisa esta parrilla de contenido de Brainstudio.',
    'Analiza estrategia, cumplimiento de marca, gramática/ortografía y consistencia entre piezas.',
    'Usa la memoria solo como evidencia histórica y contexto: no conviertas acuerdos viejos en tareas vigentes.',
    'No inventes decisiones. Si una observación depende de memoria, incluye únicamente IDs de EVIDENCIA disponibles.',
    'Las observaciones puramente textuales pueden dejar evidenceIds vacío y deben señalar el itemId.',
    'Prioriza pocos hallazgos concretos y accionables. No modifiques la parrilla.',
    `\nPARRILLA ACTUAL:\n${JSON.stringify(compactPlan(plan))}`,
    `\nEVIDENCIA DEL CLIENTE:\n${JSON.stringify(evidence)}`
  ].join('\n');

  const aiResult = await ai.generate({
    model: AI_MODELS.fast,
    instructions: 'Eres Bria, directora de inteligencia operativa de Brainstudio. Responde solo con el JSON solicitado, en español claro y profesional.',
    prompt,
    responseSchema: CONTENT_PLAN_REVIEW_SCHEMA,
    maxOutputTokens: 4000
  });
  const review = parseBriaContentPlanReview(aiResult.text);
  const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
  const itemIds = new Set((plan.items || plan.contentItems || []).map((item) => String(item.id)));
  review.findings = review.findings.map((finding) => ({
    ...finding,
    itemId: finding.itemId && itemIds.has(finding.itemId) ? finding.itemId : null,
    evidenceIds: finding.evidenceIds.filter((id) => allowedEvidenceIds.has(id))
  }));

  return {
    review,
    evidence,
    meta: {
      clientId: client.id,
      planId: plan.id,
      model: aiResult.model || AI_MODELS.fast,
      requestId: aiResult.requestId || null,
      reviewedAt: now().toISOString(),
      memorySourcesUsed: evidence.length
    }
  };
};

