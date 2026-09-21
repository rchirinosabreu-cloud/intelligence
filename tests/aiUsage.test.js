import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiUsage, summarizeAiCalls } from '../src/lib/aiUsage.js';

test('OpenAI usage is normalized to stable camelCase counters', () => {
  assert.deepEqual(normalizeAiUsage({
    input_tokens: 1200, output_tokens: 300, total_tokens: 1500,
    input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 50 }
  }), { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cachedTokens: 200, reasoningTokens: 50 });
  assert.deepEqual(normalizeAiUsage({ input_tokens: 10, output_tokens: 5 }),
    { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedTokens: 0, reasoningTokens: 0 });
  assert.deepEqual(normalizeAiUsage({ inputTokens: 7, outputTokens: 3, totalTokens: 10, cachedTokens: 1, reasoningTokens: 0 }),
    { inputTokens: 7, outputTokens: 3, totalTokens: 10, cachedTokens: 1, reasoningTokens: 0 });
});

test('missing or malformed usage stays unknown instead of counting as zero cost', () => {
  for (const raw of [undefined, null, 'usage', 42, {}, { input_tokens: 'many' }, []]) {
    assert.equal(normalizeAiUsage(raw), null);
  }
});

test('call summaries add tokens and latency only from calls whose usage is known', () => {
  const summary = summarizeAiCalls([
    { model: 'gpt-5.6-luna', latencyMs: 1200, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 0, reasoningTokens: 0 } },
    { model: 'gpt-5.6-luna', latencyMs: 800, usage: null },
    { model: 'gpt-5.6-mini', latencyMs: 300, usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, cachedTokens: 5, reasoningTokens: 1 } },
    null
  ]);
  assert.deepEqual(summary, {
    calls: 3, callsWithUsage: 2, inputTokens: 150, outputTokens: 30, totalTokens: 180, cachedTokens: 5, reasoningTokens: 1,
    latencyMs: 2300, models: ['gpt-5.6-luna', 'gpt-5.6-mini']
  });
  assert.deepEqual(summarizeAiCalls([]), {
    calls: 0, callsWithUsage: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0, latencyMs: 0, models: []
  });
  assert.equal(summarizeAiCalls(undefined).calls, 0);
});
