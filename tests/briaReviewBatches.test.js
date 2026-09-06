import test from 'node:test';
import assert from 'node:assert/strict';
import * as batches from '../src/services/briaReviewBatches.js';

const snapshot = { id: 'plan', client: { id: 'client', instructions: 'Tono claro' }, items: Array.from({ length: 61 }, (_, i) => ({ id: `piece-${String(i).padStart(2, '0')}`, copyText: `Contenido ${i} ` + 'a'.repeat(2001), captionText: 'Final completo', objective: 'Informar', format: 'Reel' })) };
const review = score => ({ summary: 'Lote revisado', verdict: 'ALINEADA', findings: [], dimensions: Object.fromEntries(
  ['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { score, confidence: 0.8, assessable: true, note: 'Verificado' }])) });

test('batches cover every active piece and preserve full text with stable ordering', () => {
  const result = batches.buildContentPlanReviewBatches(snapshot);
  assert.ok(result.length > 1);
  assert.deepEqual(result.flatMap(batch => batch.snapshot.items), snapshot.items);
  assert.ok(result.every(batch => batch.snapshot.items.length <= 12));
  assert.deepEqual(batches.buildContentPlanReviewBatches({ ...snapshot, items: [...snapshot.items].reverse() }), result);
});

test('a single oversized piece stops with an explicit error instead of silent truncation', () => {
  assert.throws(() => batches.buildContentPlanReviewBatches({ ...snapshot, items: [{ id: 'long', copyText: 'x'.repeat(210000) }] }), { code: 'BRIA_REVIEW_CONTEXT_TOO_LARGE' });
});

test('aggregation weights dimensions by reviewed pieces and does not discard findings from later batches', () => {
  const parts = [{ itemIds: ['a', 'b'], review: review(90) }, { itemIds: ['c'], review: { ...review(30), findings: [{ itemId: 'c', ruleKey: 'late', field: 'copyText' }] } }];
  const result = batches.aggregateContentPlanReviewBatches(parts);
  assert.equal(result.dimensions.GRAMATICA.score, 70);
  assert.equal(result.findings[0].itemId, 'c');
  assert.equal(result.scope.totalItems, 3);
  assert.equal(result.scope.reviewedItems, 3);
  assert.equal(result.scope.complete, true);
});

test('an incomplete batch cannot claim coverage for omitted or foreign pieces', () => {
  for (const ids of [undefined, [], ['piece-0', 'outside'], ['piece-0', 'piece-0']]) {
    assert.throws(() => batches.assertReviewedItems(ids, ['piece-0', 'piece-1']), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
  }
  assert.doesNotThrow(() => batches.assertReviewedItems(['piece-1', 'piece-0'], ['piece-0', 'piece-1']));
});

test('repeated rules retain the most severe observation across batches', () => {
  const result = batches.aggregateContentPlanReviewBatches([
    { itemIds: ['a'], review: { ...review(90), findings: [{ itemId: null, field: 'plan', ruleKey: 'STRATEGY', severity: 'INFO', title: 'Minor' }] } },
    { itemIds: ['b'], review: { ...review(30), findings: [{ itemId: null, field: 'plan', ruleKey: 'strategy', severity: 'CRITICAL', title: 'Major' }] } }
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].severity, 'CRITICAL');
});

test('a failed second batch resumes from the first checkpoint without repeating its AI call', async () => {
  let checkpoint;
  const calls = [];
  const config = { snapshot, analysisHash: 'revision-1', loadCheckpoint: async () => checkpoint,
    saveCheckpoint: async value => { checkpoint = structuredClone(value); },
    reviewBatch: async batch => { calls.push(batch.index); if (batch.index === 1) throw new Error('temporary fixture'); return { review: review(80) }; }
  };
  await assert.rejects(batches.reviewContentPlanBatches(config), /temporary fixture/);
  assert.equal(checkpoint.completed.length, 1);
  const result = await batches.reviewContentPlanBatches({ ...config, reviewBatch: async batch => { calls.push(batch.index); return { review: review(80) }; } });
  assert.equal(calls.filter(index => index === 0).length, 1);
  assert.equal(result.review.scope.reviewedItems, 61);
});

test('checkpoints from other revisions are never reused and cancellation prevents publication', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(batches.reviewContentPlanBatches({ snapshot, analysisHash: 'new', signal: controller.signal,
    loadCheckpoint: async () => ({ analysisHash: 'old', completed: [{ index: 0, review: review(100) }] }),
    saveCheckpoint: async () => { controller.abort(); }, reviewBatch: async () => { calls++; return { review: review(80) }; }
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
