import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { normalizeAiUsage, summarizeAiCalls } from '../src/lib/aiUsage.js';
import { createBriaModelRuntime } from '../src/services/briaModelRuntime.js';

test('Bria isolates its model and opaque cache partitions from editorial configuration', async () => {
  const requests = [], ai = { generate: async request => { requests.push(request); return { text: 'ok' }; } };
  const env = { BRIA_CHAT_MODEL: 'gpt-6-luna', BRIA_CHAT_REASONING_EFFORT: 'low' };
  await createBriaModelRuntime({ ai, env, user: { userId: 'private-owner', role: 'ADMIN', modulePermissions: { bria: true } } }).generate({ prompt: 'Ficticio', maxOutputTokens: 2400 });
  await createBriaModelRuntime({ ai, env, user: { userId: 'private-owner', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } } }).generate({ prompt: 'Ficticio' });
  assert.equal(requests[0].model, 'gpt-6-luna'); assert.equal(requests[0].reasoningEffort, 'low');
  assert.doesNotMatch(requests[0].promptCacheKey, /private-owner/);
  assert.notEqual(requests[0].promptCacheKey, requests[1].promptCacheKey);
  assert.ok(requests[0].signal instanceof AbortSignal);
});

test('Bria retries only transient generation errors and refuses incomplete output', async () => {
  let calls = 0;
  const runtime = createBriaModelRuntime({ user: { id: 'fixture' }, ai: { generate: async () => { if (!calls++) throw Object.assign(new Error('Transient'), { status: 503 }); return { text: 'Complete', raw: { status: 'completed' } }; } } });
  assert.equal((await runtime.generate({})).text, 'Complete'); assert.equal(calls, 2);
  const incomplete = createBriaModelRuntime({ user: { id: 'fixture' }, ai: { generate: async () => ({ text: 'Partial', raw: { status: 'incomplete' } }) } });
  await assert.rejects(() => incomplete.generate({}), { status: 503 });
});

test('cache writes remain visible so a warm evaluation cannot understate token cost', () => {
  const usage = normalizeAiUsage({ input_tokens: 1000, output_tokens: 20, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } });
  assert.equal(usage.cacheWriteTokens, 300);
  assert.equal(summarizeAiCalls([{ model: 'fixture', usage }]).cacheWriteTokens, 300);
});

test('GPT-6 Responses carries explicit reasoning and does not store private chats at the provider', async () => {
  let body;
  const ai = createOpenAIClient({ apiKey: 'test', governance: { assertEgress: async () => {} }, usageLog: { record: async () => {} }, fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ model: 'gpt-6.1-sol', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Respuesta' }] }], usage: { input_tokens: 50, output_tokens: 10 } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  await ai.generate({ model: 'gpt-6.1-sol', prompt: 'Prueba', reasoningEffort: 'low', promptCacheKey: 'bria:opaque-owner-permissions', safetyIdentifier: 'opaque-owner', governanceContext: { useCase: 'bria.assistant' } });
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.prompt_cache_key, 'bria:opaque-owner-permissions');
  assert.equal(body.safety_identifier, 'opaque-owner');
});
