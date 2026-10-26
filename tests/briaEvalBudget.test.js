import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettledEvalFetch } from '../scripts/lib/briaEvalBudget.js';

const init = { body: JSON.stringify({ model: 'fictional', input: 'data', max_output_tokens: 100 }) };
const prices = { model: 'fictional', maxUsd: .015, inputUsdPerMillion: 1, outputUsdPerMillion: 100 };
test('evaluation reserves before network and only settles complete successful usage', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 1 } }), { status: 200 }); };
  const budget = createSettledEvalFetch({ ...prices, fetchImpl });
  await budget.fetch('provider', init);
  await budget.fetch('provider', init);
  assert.equal(calls, 2);
  assert.ok(Math.abs(budget.committedUsd() - .00022) < 1e-10);
  await assert.rejects(() => budget.fetch('provider', { body: JSON.stringify({ model: 'fictional', max_output_tokens: 1000 }) }), /Presupuesto/);
  assert.equal(calls, 2);
});
test('uncertain responses retain their reservation, and invalid limits cannot reach the provider', async () => {
  let calls = 0;
  const budget = createSettledEvalFetch({ ...prices, fetchImpl: async () => { calls++; return new Response('{}'); } });
  await budget.fetch('provider', init);
  await assert.rejects(() => budget.fetch('provider', init), /Presupuesto/);
  assert.equal(calls, 1);
  for (const body of [{ model: 'other', max_output_tokens: 1 }, { model: 'fictional' }, { model: 'fictional', max_output_tokens: -1 }]) await assert.rejects(() => budget.fetch('provider', { body: JSON.stringify(body) }));
  assert.equal(calls, 1);
  assert.throws(() => createSettledEvalFetch({ ...prices, maxUsd: NaN }));
});
