import { createHash } from 'node:crypto';
import { summarizeAiCalls } from '../lib/aiUsage.js';

const dimensions = ['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'];
const severityWeight = { INFO: 0, WARNING: 1, CRITICAL: 2 };
const normalizeRule = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const contextError = () => Object.assign(new Error('El contenido supera el tamaño seguro de revisión. Divide la pieza o el contexto antes de reintentar.'), { code: 'BRIA_REVIEW_CONTEXT_TOO_LARGE', status: 422 });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const buildContentPlanReviewBatches = snapshot => {
  const { items = [], ...context } = snapshot;
  const active = items.filter(item => !item.deletedAt).sort((a, b) => a.id.localeCompare(b.id));
  // Calendar/objective context aids cross-piece checks, without claiming full cross-batch text comparison.
  const overview = active.map(({ id, objective, format, publishDate }) => ({ id, objective, format, publishDate }));
  const base = { ...context, overview };
  if (JSON.stringify(base).length > 100000) throw contextError();
  const groups = [];
  let group = [];
  for (const item of active) {
    if (JSON.stringify({ ...base, items: [item] }).length > 200000) throw contextError();
    if (group.length && (group.length >= 12 || JSON.stringify({ ...base, items: [...group, item] }).length > 60000)) {
      groups.push(group);
      group = [];
    }
    group.push(item);
  }
  if (group.length || !groups.length) groups.push(group);
  if (groups.length > 100) throw contextError();
  return groups.map((items, index) => ({ index, key: hash({ ...base, items }), itemIds: items.map(item => item.id), snapshot: { ...base, items } }));
};

export const assertReviewedItems = (actual, expected) => {
  if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== expected.length || expected.some(id => !actual.includes(id))) {
    throw Object.assign(new Error('Bria no confirmó la revisión completa del lote; se reintentará sin publicar un puntaje parcial.'), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
  }
};

// Cada lote escribe su propio resumen. Encadenarlos tal cual producía un texto
// que se contradecía («la revisión cubre las seis piezas del lote» junto a «las
// cuatro piezas presentan…») y repetía la misma frase por cada lote. Se
// compone uno solo: un recuento real y las observaciones distintas.
export const composeReviewSummary = (completed = [], totalItems = 0) => {
  if (completed.length === 1) return String(completed[0]?.review?.summary || '').trim();
  const seen = new Set();
  const sentences = [];
  for (const part of completed) {
    for (const sentence of String(part?.review?.summary || '').split(/(?<=\.)\s+/)) {
      const text = sentence.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      sentences.push(text);
    }
  }
  return `Revisé ${totalItems} piezas. ${sentences.join(' ')}`.trim().slice(0, 1050);
};

export const aggregateContentPlanReviewBatches = completed => {
  const totalItems = completed.reduce((count, part) => count + part.itemIds.length, 0);
  const mergedDimensions = Object.fromEntries(dimensions.map(key => {
    const available = completed.filter(part => part.review.dimensions[key]?.assessable === true);
    const weight = available.reduce((sum, part) => sum + Math.max(1, part.itemIds.length), 0);
    const weighted = field => weight ? available.reduce((sum, part) => sum + Number(part.review.dimensions[key]?.[field] || 0) * Math.max(1, part.itemIds.length), 0) / weight : 0;
    return [key, { score: Math.round(weighted('score')), confidence: weighted('confidence'), assessable: weight > 0,
      note: completed.length === 1 ? completed[0].review.dimensions[key]?.note || '' : `Evaluada en ${available.reduce((n, part) => n + part.itemIds.length, 0)}/${totalItems} piezas.` }];
  }));
  const findings = new Map();
  for (const part of completed) for (const finding of part.review.findings) {
    const key = JSON.stringify([finding.itemId, normalizeRule(finding.ruleKey), finding.field]);
    const previous = findings.get(key);
    if (!previous || severityWeight[finding.severity] > severityWeight[previous.severity]) findings.set(key, finding);
  }
  const verdict = completed.some(part => part.review.verdict === 'RIESGO') ? 'RIESGO'
    : completed.some(part => part.review.verdict === 'REQUIERE_AJUSTES') ? 'REQUIERE_AJUSTES' : 'ALINEADA';
  return {
    summary: composeReviewSummary(completed, totalItems),
    verdict, dimensions: mergedDimensions, findings: [...findings.values()],
    ...(completed.some(part => part.review.scoreChecks) ? { scoreChecks: completed.flatMap(part => part.review.scoreChecks || []) } : {}),
    scope: { version: 1, totalItems, reviewedItems: totalItems, reviewedItemIds: completed.flatMap(part => part.itemIds), batchCount: completed.length, complete: true,
      fullText: true, crossBatchTextComparison: completed.length === 1 }
  };
};

const subBatch = (batch, items) => {
  const { items: _all, ...base } = batch.snapshot;
  return { index: batch.index, key: hash({ ...base, items }), itemIds: items.map(item => item.id), snapshot: { ...base, items } };
};

export const reviewContentPlanBatches = async ({ snapshot, analysisHash, reviewBatch, loadCheckpoint, saveCheckpoint, signal }) => {
  const batches = buildContentPlanReviewBatches(snapshot);
  const checkpoint = await loadCheckpoint?.();
  const stored = checkpoint?.analysisHash === analysisHash && Array.isArray(checkpoint.completed) ? checkpoint.completed : [];
  const totalItems = batches.reduce((n, part) => n + part.itemIds.length, 0);
  const completed = [];
  let plannedBatches = batches.length;
  let resumedBatches = 0;
  let splitBatches = 0;
  const persist = () => saveCheckpoint?.({ analysisHash, totalBatches: plannedBatches, totalItems, completed: [...completed] });

  // Review one lot. When the model does not confirm every piece of it, split the
  // lot in halves and review each half: the plan is still covered completely and
  // no partial score is ever published. A single piece that is never confirmed
  // fails like before, so the bounded retry of the whole job still applies.
  const reviewOrSplit = async batch => {
    signal?.throwIfAborted();
    try {
      completed.push({ ...await reviewBatch(batch), key: batch.key, itemIds: batch.itemIds });
      await persist();
      return;
    } catch (error) {
      if (error?.code !== 'BRIA_REVIEW_INCOMPLETE_BATCH' || batch.itemIds.length < 2) throw error;
    }
    splitBatches += 1;
    plannedBatches += 1;
    const middle = Math.ceil(batch.snapshot.items.length / 2);
    for (const items of [batch.snapshot.items.slice(0, middle), batch.snapshot.items.slice(middle)]) await resolveBatch(subBatch(batch, items));
  };

  // Reuse stored parts that cover this lot, exactly or as pieces of an earlier
  // split, and review only what is left.
  const resolveBatch = async batch => {
    signal?.throwIfAborted();
    const exact = stored.find(part => part.key === batch.key);
    if (exact) {
      resumedBatches += 1;
      completed.push(exact);
      return;
    }
    const covering = stored.filter(part => part.itemIds?.length && !completed.includes(part) && part.itemIds.every(id => batch.itemIds.includes(id)));
    if (!covering.length) return reviewOrSplit(batch);
    const coveredIds = new Set(covering.flatMap(part => part.itemIds));
    for (const part of covering) {
      resumedBatches += 1;
      completed.push(part);
    }
    const remaining = batch.snapshot.items.filter(item => !coveredIds.has(item.id));
    splitBatches += 1;
    plannedBatches += covering.length + (remaining.length ? 1 : 0) - 1;
    if (remaining.length) await reviewOrSplit(subBatch(batch, remaining));
  };

  for (const batch of batches) await resolveBatch(batch);
  signal?.throwIfAborted();
  // Each completed part is one model call, paid in this attempt or in the one
  // that wrote the checkpoint; both belong to the cost of the published result.
  return {
    review: aggregateContentPlanReviewBatches(completed), model: completed.at(-1)?.model, requestId: completed.at(-1)?.requestId,
    usage: { ...summarizeAiCalls(completed), batches: completed.length, resumedBatches, splitBatches }
  };
};

// Expose counters only: partial AI responses remain internal until atomic publication.
export const getReviewBatchProgress = checkpoint => checkpoint && Array.isArray(checkpoint.completed) ? {
  completedBatches: checkpoint.completed.length, totalBatches: checkpoint.totalBatches,
  reviewedItems: checkpoint.completed.reduce((n, part) => n + part.itemIds.length, 0), totalItems: checkpoint.totalItems
} : null;
