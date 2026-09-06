import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentPlanRevisionHash, reviewContentPlanWithBria } from '../src/services/briaContentPlanReviewService.js';
import { reviewPayload } from './helpers/briaReview.js';

const plan = { id: 'plan', clientId: 'client', client: { id: 'client', name: 'Cliente de prueba' }, month: 9, year: 2026, items: [{ id: 'piece', objective: 'Educar', copyText: 'Hola' }] };
const criteria = [{ id: 'rule', version: 2, category: 'MARCA', text: 'Usar tú.', sourcePlanId: 'plan' }];
test('approved client criteria participate in revision hashes including revocation and version changes', () => {
  assert.notEqual(buildContentPlanRevisionHash(plan), buildContentPlanRevisionHash({ ...plan, approvedCriteria: criteria }));
  assert.notEqual(buildContentPlanRevisionHash({ ...plan, approvedCriteria: criteria }), buildContentPlanRevisionHash({ ...plan, approvedCriteria: [{ ...criteria[0], version: 4 }] }));
  assert.equal(buildContentPlanRevisionHash(plan), buildContentPlanRevisionHash({ ...plan, approvedCriteria: [] }));
});
test('shared review includes authoritative client criteria as cited evidence, never arbitrary proposed text', async () => {
  const repository = { findApprovedCriteria: async id => { assert.equal(id, 'client'); return criteria; } };
  const result = await reviewContentPlanWithBria({ planId: plan.id, getPlan: async () => plan, repository, searchMemory: async () => [], ai: {
    generate: async request => {
      assert.match(request.prompt, /Usar tú/);
      assert.match(request.prompt, /CLIENT_CRITERION/);
      assert.match(request.prompt, /validados explícitamente/);
      return { text: JSON.stringify(reviewPayload(request)), model: 'test' };
    }
  } });
  assert.equal(result.evidence[0].sourceKind, 'CLIENT_CRITERION');
  assert.equal(result.evidence[0].id, 'criterion:rule:v2');
});
