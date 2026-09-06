import { createHash } from 'node:crypto';
import { BRIA_REVIEW_RUBRIC, rubricHash } from '../lib/briaReviewRubric.js';
import { buildContentPlanReviewBatches } from '../services/briaReviewBatches.js';
import { CONTENT_PLAN_REVIEW_PROMPT_VERSION, generateContentPlanReview } from '../services/briaContentPlanReviewGenerator.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = finding => JSON.stringify([finding.ruleKey, finding.itemId ?? null, finding.field ?? null]);
const matches = (finding, label) => finding.ruleKey === label.ruleKey
  && (!Object.hasOwn(label, 'itemId') || finding.itemId === label.itemId)
  && (!Object.hasOwn(label, 'field') || finding.field === label.field);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export const validateBriaEvaluationCases = cases => {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Se necesitan casos de evaluación.');
  const ids = new Set();
  const rules = new Set(BRIA_REVIEW_RUBRIC.rules.map(rule => rule.key));
  for (const sample of cases) {
    if (!sample.id || ids.has(sample.id)) throw new Error('ID de caso ausente o repetido.');
    ids.add(sample.id);
    if (sample.source?.kind !== 'synthetic' && !(sample.source?.kind === 'anonymized' && sample.source?.approvedBy && sample.source?.labels === 'APPROVED')) throw new Error('Los casos reales requieren anonimización y aprobación explícita.');
    const items = sample.snapshot?.items;
    if (!sample.snapshot?.client?.id || !Array.isArray(items) || new Set(items.map(item => item.id)).size !== items.length || items.some(item => typeof item.id !== 'string' || !item.id || item.deletedAt)) throw new Error('IDs de piezas activas no válidos.');
    if (!Array.isArray(sample.evidence) || sample.evidence.some(item => !item.id || item.clientId !== sample.snapshot.client.id)) throw new Error('Evidencia sin procedencia o de otro cliente.');
    if (new Set(sample.evidence.map(item => item.id)).size !== sample.evidence.length) throw new Error('IDs de evidencia repetidos.');
    if (!Array.isArray(sample.expected?.required) || !Array.isArray(sample.expected?.forbidden) || typeof sample.expected.exhaustive !== 'boolean') throw new Error('Etiquetas de evaluación incompletas.');
    for (const labels of [sample.expected.required, sample.expected.forbidden]) {
      if (new Set(labels.map(key)).size !== labels.length) throw new Error('Etiquetas duplicadas.');
    }
    const overlaps = (a, b) => a.ruleKey === b.ruleKey && ['itemId', 'field'].every(field =>
      !Object.hasOwn(a, field) || !Object.hasOwn(b, field) || a[field] === b[field]);
    if (sample.expected.required.some(required => sample.expected.forbidden.some(forbidden => overlaps(required, forbidden)))) throw new Error('Etiquetas contradictorias.');
    for (const label of [...sample.expected.required, ...sample.expected.forbidden]) {
      if (!rules.has(label.ruleKey)) throw new Error('Regla esperada fuera del catálogo.');
      if (label.itemId && !items.some(item => item.id === label.itemId)) throw new Error('Etiqueta sobre una pieza ajena.');
    }
    for (const [dimension, band] of Object.entries(sample.expected.scoreBands || {})) {
      if (!(dimension in BRIA_REVIEW_RUBRIC.weights) || !Array.isArray(band) || band.length !== 2 || band.some(n => !Number.isFinite(n)) || band[0] < 0 || band[1] > 100 || band[0] > band[1]) throw new Error('Rango de puntaje inválido.');
    }
    for (const [dimension, value] of Object.entries(sample.expected.assessable || {})) {
      if (!(dimension in BRIA_REVIEW_RUBRIC.weights) || typeof value !== 'boolean') throw new Error('Dimensión evaluable inválida.');
    }
  }
  return { cases: cases.length, synthetic: cases.filter(sample => sample.source.kind === 'synthetic').length, datasetHash: hash(cases) };
};

export const gradeBriaReview = (sample, review, { ruleMetricsComparable = true } = {}) => {
  const unique = [...new Map(review.findings.map(finding => [key(finding), finding])).values()];
  // Maximum one-to-one matching: a general label must not steal a specific label's only match.
  const assigned = new Map();
  const assign = (labelIndex, seen) => unique.some((finding, index) => {
    if (seen.has(index) || !matches(finding, sample.expected.required[labelIndex])) return false;
    seen.add(index);
    if (!assigned.has(index) || assign(assigned.get(index), seen)) {
      assigned.set(index, labelIndex);
      return true;
    }
    return false;
  });
  sample.expected.required.forEach((_, index) => assign(index, new Set()));
  const tp = assigned.size;
  const extra = unique.filter((_, index) => !assigned.has(index));
  const fp = extra.filter(finding => sample.expected.exhaustive || sample.expected.forbidden.some(label => matches(finding, label))).length;
  const fn = sample.expected.required.length - tp;
  return {
    ruleMetricsComparable, exhaustive: sample.expected.exhaustive,
    tp: ruleMetricsComparable ? tp : null, fp: ruleMetricsComparable ? fp : null, fn: ruleMetricsComparable ? fn : null,
    unadjudicated: ruleMetricsComparable ? extra.length - fp : unique.length,
    duplicateCount: review.findings.length - unique.length,
    // Diagnostic only: never overwrite the model score or infer a correction from absence.
    unsupportedDeductions: ruleMetricsComparable ? Object.keys(BRIA_REVIEW_RUBRIC.weights).filter(dimension =>
      review.dimensions[dimension]?.assessable === true && review.dimensions[dimension].score < 100
      && !unique.some(finding => finding.category === dimension && ['WARNING', 'CRITICAL'].includes(finding.severity))) : null,
    precision: ruleMetricsComparable && sample.expected.exhaustive ? ratio(tp, tp + fp) : null,
    recall: ruleMetricsComparable ? ratio(tp, tp + fn) : null,
    scoreBandChecks: Object.entries(sample.expected.scoreBands || {}).map(([dimension, [min, max]]) => ({ dimension, min, max, actual: review.dimensions[dimension]?.score,
      passed: review.dimensions[dimension]?.assessable === true && review.dimensions[dimension].score >= min && review.dimensions[dimension].score <= max })),
    assessabilityChecks: Object.entries(sample.expected.assessable || {}).map(([dimension, expected]) => ({ dimension, expected, actual: review.dimensions[dimension]?.assessable, passed: review.dimensions[dimension]?.assessable === expected }))
  };
};

export const summarizeBriaEvaluation = runs => {
  const successful = runs.filter(run => run.status === 'SUCCESS');
  const graded = successful.filter(run => run.grade.ruleMetricsComparable);
  const sum = field => graded.reduce((n, run) => n + (run.grade[field] || 0), 0);
  const calls = runs.flatMap(run => run.calls || []);
  const usage = calls.filter(call => Number.isFinite(call.usage?.input_tokens) && Number.isFinite(call.usage?.output_tokens));
  const stability = [...new Set(runs.map(run => run.caseId))].map(caseId => {
    const all = runs.filter(run => run.caseId === caseId);
    const group = all.filter(run => run.status === 'SUCCESS');
    const valid = group.length >= 2 && group.length === all.length;
    const agreements = [];
    if (valid) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = new Set(group[i].review.findings.map(key)), b = new Set(group[j].review.findings.map(key));
      const union = new Set([...a, ...b]);
      agreements.push(union.size ? [...a].filter(item => b.has(item)).length / union.size : 1);
    }
    return { caseId, successfulRuns: group.length, failedRuns: all.length - group.length,
      scoreSpread: valid ? Math.max(...group.map(run => run.review.score)) - Math.min(...group.map(run => run.review.score)) : null,
      findingAgreement: average(agreements) };
  });
  return {
    totalRuns: runs.length, successfulRuns: successful.length, failedRuns: runs.length - successful.length,
    contractSuccessRate: ratio(successful.length, runs.length),
    tp: sum('tp'), fp: sum('fp'), fn: sum('fn'), unadjudicated: successful.reduce((n, run) => n + run.grade.unadjudicated, 0),
    precision: graded.length && graded.every(run => run.grade.exhaustive) ? ratio(sum('tp'), sum('tp') + sum('fp')) : null,
    recall: graded.length ? ratio(sum('tp'), sum('tp') + sum('fn')) : null,
    unsupportedDeductionRuns: graded.length ? graded.filter(run => run.grade.unsupportedDeductions?.length).length : null,
    scoreBandPassRate: average(successful.flatMap(run => run.grade.scoreBandChecks || []).map(check => Number(check.passed))),
    assessabilityPassRate: average(successful.flatMap(run => run.grade.assessabilityChecks || []).map(check => Number(check.passed))),
    meanLatencyMs: average(calls.map(call => call.latencyMs).filter(Number.isFinite)),
    calls: calls.length, usageKnownCalls: usage.length,
    tokens: { input: usage.length ? usage.reduce((n, call) => n + call.usage.input_tokens, 0) : null, output: usage.length ? usage.reduce((n, call) => n + call.usage.output_tokens, 0) : null },
    rejectedFindingCount: calls.reduce((n, call) => n + (call.rejectedFindingCount || 0), 0),
    rejectedEvidenceCount: calls.reduce((n, call) => n + (call.rejectedEvidenceCount || 0), 0), stability
  };
};

export const runBriaReviewEvaluation = async ({ cases, ai, repeats = 1, maxCalls = 40, variant = 'candidate', signal }) => {
  const validation = validateBriaEvaluationCases(cases);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Las repeticiones deben estar entre 1 y 5.');
  if (!['baseline', 'candidate'].includes(variant)) throw new Error('Variante desconocida.');
  const plannedCalls = cases.reduce((n, sample) => n + buildContentPlanReviewBatches(sample.snapshot).length * repeats, 0);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 200 || plannedCalls > maxCalls) throw new Error(`El presupuesto de ${maxCalls} llamadas no cubre las ${plannedCalls} necesarias.`);
  const runs = [];
  for (const sample of cases) for (let repeat = 0; repeat < repeats; repeat++) {
    signal?.throwIfAborted();
    const inputHash = hash({ snapshot: sample.snapshot, evidence: sample.evidence });
    const base = { caseId: sample.id, repeat: repeat + 1, inputHash, labels: sample.source };
    const attemptedCalls = [];
    // Record even rejected contracts and provider failures: they consumed budget too.
    const measuredAi = { generate: async request => {
      const started = performance.now();
      try {
        const result = await ai.generate(request);
        attemptedCalls.push({ model: result.model || request.model, requestId: result.requestId || null, usage: result.raw?.usage || null, latencyMs: Math.round(performance.now() - started) });
        return result;
      } catch (error) {
        console.error('Bria eval: error del proveedor', error.response?.data || error.message);
        attemptedCalls.push({ model: request.model, requestId: error.requestId || null, usage: null, latencyMs: Math.round(performance.now() - started), errorCode: error.code || 'PROVIDER_ERROR' });
        throw error;
      }
    } };
    try {
      const result = await generateContentPlanReview({ snapshot: sample.snapshot, evidence: sample.evidence, analysisHash: inputHash, ai: measuredAi, variant, signal });
      runs.push({ ...base, status: 'SUCCESS', review: result.review, calls: result.calls, grade: gradeBriaReview(sample, result.review, { ruleMetricsComparable: variant === 'candidate' }) });
    } catch (error) {
      if (signal?.aborted) throw error;
      runs.push({ ...base, status: 'FAILED', calls: attemptedCalls, error: { code: error.code || 'REVIEW_ERROR', requestId: error.requestId || null } });
    }
  }
  return { reportVersion: 1, createdAt: new Date().toISOString(), datasetHash: validation.datasetHash,
    promptVersion: CONTENT_PLAN_REVIEW_PROMPT_VERSION, variant, rubric: variant === 'candidate' ? { version: BRIA_REVIEW_RUBRIC.version, hash: rubricHash() } : null,
    repeats, plannedCalls, decision: validation.synthetic ? 'NEEDS_HUMAN_CALIBRATION' : 'REQUIRES_TEAM_DECISION',
    summary: summarizeBriaEvaluation(runs), runs };
};
