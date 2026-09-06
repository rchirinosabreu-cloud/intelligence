import { assertReviewedItems } from './briaReviewBatches.js';

const cleanString = (value, maxLength = 4000) => String(value || '').trim().slice(0, maxLength);
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

export const CONTENT_PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['summary', 'verdict', 'dimensions', 'findings', 'reviewedItemIds'],
  properties: {
    reviewedItemIds: { type: 'array', items: { type: 'string' } },
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

export const parseBriaContentPlanReview = (rawText, expectedItemIds) => {
  const cleaned = String(rawText || '').replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  if (expectedItemIds) {
    assertReviewedItems(parsed.reviewedItemIds, expectedItemIds);
    const valid = Object.keys(DIMENSION_WEIGHTS).every(key => {
      const value = parsed.dimensions?.[key];
      return value && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100
        && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1
        && typeof value.assessable === 'boolean' && typeof value.note === 'string';
    });
    if (!valid || typeof parsed.summary !== 'string' || !REVIEW_VERDICTS.has(parsed.verdict) || !Array.isArray(parsed.findings)) {
      throw Object.assign(new Error('Bria devolvió un lote incompleto; se reintentará sin publicar un puntaje parcial.'), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
    }
  }
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
