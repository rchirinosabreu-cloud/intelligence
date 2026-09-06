import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewContentPlanWithBria } from '../src/services/briaContentPlanReviewService.js';
import { reviewSnapshot, reviewPayload } from './helpers/briaReview.js';

const plan = { id: 'plan', clientId: 'client', client: { id: 'client', name: 'Aristea' }, month: 9, year: 2026,
  items: Array.from({ length: 61 }, (_, i) => ({ id: `piece-${String(i).padStart(2, '0')}`, objective: 'Reconocimiento', copyText: 'A'.repeat(2100) + ` FIN-${i}` })) };
const options = { planId: plan.id, getPlan: async () => plan, searchMemory: async () => [] };
test('service reviews every active piece with full text, publishes one weighted score and retains late findings', async () => {
  const seen = [];
  let published = 0;
  const result = await reviewContentPlanWithBria({ ...options, repository: { saveCompletedReview: async ({ result }) => { published++; return result; } },
    ai: { generate: async request => {
      const snapshot = reviewSnapshot(request);
      seen.push(...snapshot.items);
      return { text: '```json\n' + JSON.stringify(reviewPayload(request, { findings: snapshot.items.map(item => ({
        ruleKey: 'COPY', field: 'copyText', category: 'GRAMATICA', severity: 'INFO', title: 'Revisar', detail: 'Revisar copy', recommendation: 'Corregir', itemId: item.id, evidenceIds: []
      })) })) + '\n```' };
    } }
  });
  assert.equal(published, 1);
  assert.equal(seen.length, 61);
  assert.ok(seen.every(item => item.copyText === plan.items.find(source => source.id === item.id).copyText));
  assert.equal(result.review.scope.reviewedItems, 61);
  assert.equal(result.review.scope.totalItems, 61);
  assert.equal(result.review.scope.complete, true);
  assert.equal(result.review.findings.length, 61);
  assert.equal(result.review.score, 80);
});
test('unacknowledged pieces and malformed dimensions fail before publishing a partial score', async () => {
  for (const patch of [{ reviewedItemIds: [] }, { dimensions: {} }, { dimensions: { GRAMATICA: { score: 90 } } }]) {
    await assert.rejects(reviewContentPlanWithBria({ ...options,
      repository: { saveCompletedReview: async () => assert.fail('partial review published') },
      ai: { generate: async request => ({ text: JSON.stringify(reviewPayload(request, patch)) }) }
    }), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
  }
});
test('findings for foreign pieces cannot become plan-wide findings', async () => {
  const result = await reviewContentPlanWithBria({ ...options, getPlan: async () => ({ ...plan, items: plan.items.slice(0, 1) }),
    ai: { generate: async request => ({ text: JSON.stringify(reviewPayload(request, { findings: [{ itemId: 'foreign', title: 'Foreign', ruleKey: 'COPY' }] })) }) }
  });
  assert.deepEqual(result.review.findings, []);
});
