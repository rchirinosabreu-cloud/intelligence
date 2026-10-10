// Respuestas de OpenAI por partes (9 de octubre de 2026): Bria escribe en vivo. El resultado final es el mismo que
// sin partes, y el registro de uso conserva los tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient } from '../src/services/openAIClient.js';

const sse = (events) => new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    // Partido en trozos que no coinciden con los eventos, como llega de verdad.
    const text = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
    for (let i = 0; i < text.length; i += 17) controller.enqueue(encoder.encode(text.slice(i, i + 17)));
    controller.close();
  }
});
const completed = { id: 'resp_1', model: 'gpt-test', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hola mundo' }] }], usage: { input_tokens: 120, output_tokens: 4, input_tokens_details: { cached_tokens: 100 } } };

const client = (events, records, bodies = []) => createOpenAIClient({
  apiKey: 'test',
  governance: { assertEgress: async () => {} },
  usageLog: { record: async (event) => { records.push(event); } },
  fetchImpl: async (_url, options) => { bodies.push(JSON.parse(options.body)); return new Response(sse(events), { headers: { 'content-type': 'text/event-stream' } }); }
});

test('the text arrives in pieces and the final result is the same as without them', async () => {
  const records = [], bodies = [], deltas = [];
  const ai = client([
    { type: 'response.created', response: { id: 'resp_1' } },
    { type: 'response.output_text.delta', delta: 'Hola ' },
    { type: 'response.output_text.delta', delta: 'mundo' },
    { type: 'response.completed', response: completed }
  ], records, bodies);
  const result = await ai.generate({ input: 'Saluda', model: 'gpt-test', onTextDelta: (delta) => deltas.push(delta) });
  assert.equal(bodies[0].stream, true);
  assert.deepEqual(deltas, ['Hola ', 'mundo']);
  assert.equal(result.text, 'Hola mundo');
  assert.equal(result.id, 'resp_1');
  assert.deepEqual(result.usage, completed.usage);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(records.length, 1, 'exactly one usage row');
  assert.equal(records[0].inputTokens, 120, 'tokens are kept for streamed calls');
  assert.equal(records[0].outcome, 'ALLOWED');
});

test('a failed stream throws instead of returning half an answer, and still leaves its row', async () => {
  const records = [];
  const ai = client([{ type: 'response.output_text.delta', delta: 'Ho' }, { type: 'response.failed', response: { error: { code: 'server_error', message: 'boom' } } }], records);
  await assert.rejects(() => ai.generate({ input: 'x', model: 'gpt-test', onTextDelta: () => {} }), (error) => error.name === 'OpenAIRequestError' && error.status === 502);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(records.length, 1);
});

test('without onTextDelta nothing changes: no stream is requested', async () => {
  const bodies = [];
  const ai = createOpenAIClient({ apiKey: 'test', governance: { assertEgress: async () => {} }, usageLog: { record: async () => {} }, fetchImpl: async (_url, options) => { bodies.push(JSON.parse(options.body)); return new Response(JSON.stringify(completed), { headers: { 'content-type': 'application/json' } }); } });
  const result = await ai.generate({ input: 'x', model: 'gpt-test' });
  assert.equal(bodies[0].stream, undefined);
  assert.equal(result.text, 'Hola mundo');
});
