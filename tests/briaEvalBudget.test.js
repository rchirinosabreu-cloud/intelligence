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

test('exact provider token counting reserves before generation and fails closed on invalid counts', async () => {
  let generated = 0, counted = 0;
  const budget = createSettledEvalFetch({ ...prices, maxUsd: .01015, countInputTokens: async body => {
    counted++; assert.equal(body.model, 'fictional'); return 100;
  }, fetchImpl: async () => { generated++; return new Response('{}'); } });
  await budget.fetch('provider', { body: JSON.stringify({ model: 'fictional', input: 'x'.repeat(10000), max_output_tokens: 100 }) });
  assert.equal(generated, 1);
  assert.equal(counted, 1);
  assert.ok(Math.abs(budget.committedUsd() - .0101) < 1e-10);
  await assert.rejects(() => budget.fetch('provider', init), /Presupuesto/);
  assert.equal(generated, 1);
  for (const count of [null, -1, 1.5, NaN]) {
    const invalid = createSettledEvalFetch({ ...prices, countInputTokens: async () => count, fetchImpl: async () => { generated++; return new Response('{}'); } });
    await assert.rejects(() => invalid.fetch('provider', init), /conteo/i);
  }
  assert.equal(generated, 1);
});

test('cache writes are included in the reservation and cache discounts use only complete usage evidence', async () => {
  const budget = createSettledEvalFetch({ model: 'fictional', maxUsd: .1, inputUsdPerMillion: 1, outputUsdPerMillion: 10,
    cachedInputUsdPerMillion: .1, cacheWriteUsdPerMillion: 1.25, countInputTokens: async () => 1000,
    fetchImpl: async () => new Response(JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 10,
      input_tokens_details: { cached_tokens: 600, cache_write_tokens: 200 } } })) });
  await budget.fetch('provider', init);
  assert.ok(Math.abs(budget.committedUsd() - .00061) < 1e-10);
});
