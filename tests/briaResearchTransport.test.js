import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient } from '../src/services/openAIClient.js';
test('local research can log usage without writing the application database', async () => {
  const events = [];
  const ai = createOpenAIClient({ apiKey: 'fake-test-key', governance: { assertEgress: async () => ({ allowed: true }) }, usageLog: { record: async (event) => events.push(event) }, fetchImpl: async () => new Response(JSON.stringify({ id: 'r', output: [], usage: { input_tokens: 3, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } }) });
  await ai.generate({ input: 'private test question' });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(events.length, 1);
  assert.doesNotMatch(JSON.stringify(events), /private test question|fake-test-key/);
});
