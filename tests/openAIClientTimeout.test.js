import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createOpenAIClient } from '../src/services/openAIClient.js';

test('OpenAI requests abort a delayed response within their configured deadline', async () => {
  const server = createServer((req, res) => {
    const timer = setTimeout(() => res.end(JSON.stringify({ output_text: 'too late' })), 400);
    res.on('close', () => clearTimeout(timer));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = createOpenAIClient({ apiKey: 'local-test', requestTimeoutMs: 40,
    fetchImpl: (_url, options) => fetch(`http://127.0.0.1:${server.address().port}`, options) });
  try {
    await assert.rejects(client.generate({ prompt: 'test only' }), { code: 'OPENAI_TIMEOUT' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
