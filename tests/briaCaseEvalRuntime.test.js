import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as runtime from '../scripts/lib/briaResearchRuntime.js';

test('the evaluation CLI returns failure even when no provider handle keeps the process alive', () => {
  const script = readFileSync('scripts/eval-bria-casos.mjs', 'utf8');
  const finish = script.slice(script.lastIndexOf('const passed ='));
  for (const pass of [false, true]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import path from 'node:path'; const results = [{ pass: ${pass} }]; const output = 'fictional.json'; ${finish}`], { encoding: 'utf8' });
    assert.equal(child.status, pass ? 0 : 1, child.stderr || child.stdout);
  }
});

test('fictional evaluation reads only provider credentials and prefers injected configuration', async () => {
  assert.equal(typeof runtime.loadCaseEvalConfig, 'function');
  const config = await runtime.loadCaseEvalConfig({ env: { OPENAI_API_KEY: 'fake-key', OPENAI_MODEL_CHAT: 'fake-model', DATABASE_URL: 'must-not-load' }, load: async () => { throw new Error('No environment file should be read'); } });
  assert.deepEqual(config, { OPENAI_API_KEY: 'fake-key', OPENAI_MODEL_CHAT: 'fake-model' });
  const fromFile = await runtime.loadCaseEvalConfig({ env: { BRIA_PROJECT_ENV: 'fixture' }, load: async file => { assert.equal(file, 'fixture'); return { OPENAI_API_KEY: 'fake-key', DATABASE_URL: 'must-not-load', OTHER_SECRET: 'excluded' }; } });
  assert.deepEqual(fromFile, { OPENAI_API_KEY: 'fake-key' });
});

test('fictional evaluation uses a real provider request with in-memory governance and usage only', async () => {
  assert.equal(typeof runtime.createCaseEvalProvider, 'function');
  const requests = [], usage = [];
  const ai = await runtime.createCaseEvalProvider({ apiKey: 'fake-key', models: { chat: 'fake-model' }, usage,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ output_text: 'Respuesta ficticia', usage: { input_tokens: 4, output_tokens: 2 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const result = await ai.generate({ input: 'Solo datos ficticios' });
  assert.equal(result.text, 'Respuesta ficticia');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(usage.length, 1);
  assert.equal(usage[0].outcome, 'ALLOWED');
  assert.equal(JSON.stringify(usage).includes('Solo datos ficticios'), false);
});
