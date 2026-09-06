import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { buildTraceableRequest } from '../src/services/briaTraceableScore.js';
test('strict schema and reasoning are opt-in for the traceable candidate; existing requests retain defaults', async () => {
  const sent = [];
  const ai = createOpenAIClient({ apiKey: 'test-only', fetchImpl: async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ output_text: '{}' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const batch = { index: 0, itemIds: ['p1'], snapshot: { items: [{ id: 'p1', copyText: 'Texto.' }] } };
  await ai.generate(buildTraceableRequest(batch, []));
  assert.equal(sent[0].text.format.strict, true);
  assert.equal(sent[0].reasoning.effort, 'low');
  assert.equal(sent[0].text.format.schema.additionalProperties, false);
  assert.equal(sent[0].text.format.schema.properties.checks.items.additionalProperties, false);
  assert.equal(sent[0].text.format.schema.properties.checks.minItems, 11);
  assert.equal(sent[0].text.format.schema.properties.checks.maxItems, 11);
  await ai.generate({ prompt: 'Existing request', responseSchema: { type: 'object', properties: {} }, model: 'gpt-5.6-luna' });
  assert.equal(sent[1].text.format.strict, false);
  assert.equal(sent[1].reasoning.effort, 'none');
});
