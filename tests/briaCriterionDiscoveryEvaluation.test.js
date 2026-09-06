import test from 'node:test';
import assert from 'node:assert/strict';
const evaluation = await import('../src/evals/briaCriterionDiscoveryEvaluation.js').catch(() => ({}));
test('discovery evaluation bounds synthetic calls and reports empty/wrong-scope outputs honestly', async () => {
  assert.equal(typeof evaluation.evaluateCriterionDiscovery, 'function');
  let calls = 0;
  const result = await evaluation.evaluateCriterionDiscovery({ generate: async () => { calls++; return { text: '{"proposals":[]}', model: 'fake' }; } });
  assert.equal(calls, 5);
  assert.equal(result.runs.length, 5);
  assert.equal(result.runs.filter(r => r.expectationMet).length, 2);
  assert.equal(result.humanValidated, false);
  assert.equal(result.runs.every(r => r.contractValid), true);
});
