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

test('review usage counts every batch, including the ones resumed from a checkpoint', async () => {
  let checkpoint;
  const usage = index => ({ inputTokens: 1000 + index, outputTokens: 100, totalTokens: 1100 + index, cachedTokens: 0, reasoningTokens: 0 });
  const config = { snapshot, analysisHash: 'revision-1', loadCheckpoint: async () => checkpoint,
    saveCheckpoint: async value => { checkpoint = structuredClone(value); },
    reviewBatch: async batch => { if (batch.index === 1) throw new Error('temporary fixture'); return { review: review(80), model: 'gpt-test', latencyMs: 500, usage: usage(batch.index) }; }
  };
  await assert.rejects(batches.reviewContentPlanBatches(config), /temporary fixture/);
  const result = await batches.reviewContentPlanBatches({ ...config, reviewBatch: async batch => ({ review: review(80), model: 'gpt-test', latencyMs: 700, usage: usage(batch.index) }) });
  const total = batches.buildContentPlanReviewBatches(snapshot).length;
  assert.ok(total > 2);
  assert.equal(result.usage.calls, total);
  assert.equal(result.usage.callsWithUsage, total);
  assert.equal(result.usage.batches, total);
  assert.equal(result.usage.resumedBatches, 1);
  assert.equal(result.usage.inputTokens, Array.from({ length: total }, (_, i) => 1000 + i).reduce((a, b) => a + b, 0));
  assert.equal(result.usage.outputTokens, 100 * total);
  assert.equal(result.usage.latencyMs, 500 + 700 * (total - 1));
  assert.deepEqual(result.usage.models, ['gpt-test']);
});

test('batches from older checkpoints without usage count as calls of unknown cost', async () => {
  const small = { ...snapshot, items: snapshot.items.slice(0, 13) };
  const [first] = batches.buildContentPlanReviewBatches(small);
  const result = await batches.reviewContentPlanBatches({ snapshot: small, analysisHash: 'r',
    loadCheckpoint: async () => ({ analysisHash: 'r', totalBatches: 2, totalItems: 13, completed: [{ key: first.key, itemIds: first.itemIds, review: review(80) }] }),
    reviewBatch: async () => ({ review: review(80), model: 'gpt-test', latencyMs: 10, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedTokens: 0, reasoningTokens: 0 } })
  });
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.callsWithUsage, 1);
  assert.equal(result.usage.resumedBatches, 1);
  assert.equal(result.usage.inputTokens, 1);
});

const incomplete = () => Object.assign(new Error('incomplete fixture'), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
const part = batch => ({ review: { ...review(80), findings: [{ itemId: batch.itemIds[0], ruleKey: `rule-${batch.itemIds[0]}`, field: 'copyText', severity: 'INFO' }] },
  model: 'gpt-test', latencyMs: 10, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedTokens: 0, reasoningTokens: 0 } });

test('a lot the model does not confirm is split in halves and reviewed completely, never partially published', async () => {
  const small = { ...snapshot, items: snapshot.items.slice(0, 13) };
  const calls = [];
  const result = await batches.reviewContentPlanBatches({ snapshot: small, analysisHash: 'split', reviewBatch: async batch => {
    calls.push(batch.itemIds.length);
    if (batch.itemIds.length > 6) throw incomplete();
    return part(batch);
  } });
  assert.deepEqual(calls, [12, 6, 6, 1]);
  assert.equal(result.review.scope.reviewedItems, 13);
  assert.equal(result.review.scope.complete, true);
  assert.deepEqual([...result.review.scope.reviewedItemIds].sort(), small.items.map(item => item.id).sort());
  assert.equal(result.review.scope.batchCount, 3);
  assert.equal(result.review.findings.length, 3);
  assert.equal(result.usage.batches, 3);
  assert.equal(result.usage.calls, 3);
  assert.equal(result.usage.splitBatches, 1);
});

test('split parts are checkpointed one by one and resumed without repeating their AI calls', async () => {
  const small = { ...snapshot, items: snapshot.items.slice(0, 13) };
  let checkpoint;
  const calls = [];
  const config = { snapshot: small, analysisHash: 'split', loadCheckpoint: async () => checkpoint,
    saveCheckpoint: async value => { checkpoint = structuredClone(value); },
    reviewBatch: async batch => {
      calls.push(batch.itemIds.length);
      if (batch.itemIds.length > 6) throw incomplete();
      if (calls.length === 3) throw new Error('temporary fixture');
      return part(batch);
    } };
  await assert.rejects(batches.reviewContentPlanBatches(config), /temporary fixture/);
  assert.equal(checkpoint.completed.length, 1);
  assert.equal(checkpoint.completed[0].itemIds.length, 6);
  assert.equal(checkpoint.totalBatches, 3);
  assert.deepEqual(batches.getReviewBatchProgress(checkpoint), { completedBatches: 1, totalBatches: 3, reviewedItems: 6, totalItems: 13 });
  const resumed = await batches.reviewContentPlanBatches({ ...config, reviewBatch: async batch => { calls.push(batch.itemIds.length); return part(batch); } });
  assert.deepEqual(calls, [12, 6, 6, 6, 1]);
  assert.equal(resumed.review.scope.reviewedItems, 13);
  assert.equal(resumed.usage.resumedBatches, 1);
  assert.equal(resumed.usage.batches, 3);
});

test('a single piece that is never confirmed fails honestly instead of looping', async () => {
  let calls = 0;
  await assert.rejects(batches.reviewContentPlanBatches({ snapshot: { ...snapshot, items: snapshot.items.slice(0, 2) }, analysisHash: 'x',
    reviewBatch: async () => { calls++; throw incomplete(); } }), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
  assert.equal(calls, 2);
});

test('other failures are never split: they keep the bounded retry of the whole job', async () => {
  let calls = 0;
  await assert.rejects(batches.reviewContentPlanBatches({ snapshot: { ...snapshot, items: snapshot.items.slice(0, 12) }, analysisHash: 'x',
    reviewBatch: async () => { calls++; throw Object.assign(new Error('upstream'), { status: 503 }); } }), /upstream/);
  assert.equal(calls, 1);
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
