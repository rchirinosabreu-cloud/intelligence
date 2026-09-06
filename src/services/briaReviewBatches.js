import { createHash } from 'node:crypto';

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
    summary: completed.length === 1 ? completed[0].review.summary : `Revisé ${totalItems} piezas en ${completed.length} lotes. ${completed.map(part => part.review.summary).join(' ').slice(0, 1050)}`,
    verdict, dimensions: mergedDimensions, findings: [...findings.values()],
    ...(completed.some(part => part.review.scoreChecks) ? { scoreChecks: completed.flatMap(part => part.review.scoreChecks || []) } : {}),
    scope: { version: 1, totalItems, reviewedItems: totalItems, reviewedItemIds: completed.flatMap(part => part.itemIds), batchCount: completed.length, complete: true,
      fullText: true, crossBatchTextComparison: completed.length === 1 }
  };
};

export const reviewContentPlanBatches = async ({ snapshot, analysisHash, reviewBatch, loadCheckpoint, saveCheckpoint, signal }) => {
  const batches = buildContentPlanReviewBatches(snapshot);
  const checkpoint = await loadCheckpoint?.();
  const stored = checkpoint?.analysisHash === analysisHash && Array.isArray(checkpoint.completed) ? checkpoint.completed : [];
  const completed = [];
  for (const batch of batches) {
    signal?.throwIfAborted();
    const previous = stored.find(part => part.key === batch.key);
    const result = previous || { ...await reviewBatch(batch), key: batch.key, itemIds: batch.itemIds };
    completed.push(result);
    if (!previous) await saveCheckpoint?.({ analysisHash, totalBatches: batches.length, totalItems: batches.reduce((n, part) => n + part.itemIds.length, 0), completed: [...completed] });
  }
  signal?.throwIfAborted();
  return { review: aggregateContentPlanReviewBatches(completed), model: completed.at(-1)?.model, requestId: completed.at(-1)?.requestId };
};

// Expose counters only: partial AI responses remain internal until atomic publication.
export const getReviewBatchProgress = checkpoint => checkpoint && Array.isArray(checkpoint.completed) ? {
  completedBatches: checkpoint.completed.length, totalBatches: checkpoint.totalBatches,
  reviewedItems: checkpoint.completed.reduce((n, part) => n + part.itemIds.length, 0), totalItems: checkpoint.totalItems
} : null;
