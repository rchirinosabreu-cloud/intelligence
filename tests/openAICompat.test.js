import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenAICompat, parseOpenAIResponseText } from '../src/services/openAICompat.js';
import { FINAL_MODEL_NAME } from '../src/config/aiConfig.js';

test('central AI configuration never reuses the legacy Gemini model override', () => {
  assert.notEqual(FINAL_MODEL_NAME, process.env.MODEL_NAME);
  assert.match(FINAL_MODEL_NAME, /^gpt-/);
});

test('OpenAI compatibility client converts markdown-wrapped structured output', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-test');
    assert.equal(body.input[0].content[0].type, 'input_text');
    assert.equal(body.text.format.type, 'json_schema');
    return new Response(JSON.stringify({ output_text: '```json\n{"ok":true}\n```' }), { status: 200 });
  };

  try {
    const client = new OpenAICompat({ apiKey: 'test-key' });
    const result = await client.models.generateContent({
      model: 'gpt-test',
      contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
      config: { responseMimeType: 'application/json', responseSchema: { type: 'object' } }
    });
    assert.deepEqual(JSON.parse(result.text), { ok: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI compatibility client sends images as data URLs', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.input[0].content[1].type, 'input_image');
    assert.equal(body.input[0].content[1].image_url, 'data:image/png;base64,YQ==');
    return new Response(JSON.stringify({ output_text: 'ok' }), { status: 200 });
  };
  try {
    const client = new OpenAICompat({ apiKey: 'test-key' });
    await client.models.generateContent({
      model: 'gpt-test',
      contents: [{ role: 'user', parts: [{ text: 'mira' }, { inlineData: { mimeType: 'image/png', data: 'YQ==' } }] }]
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI compatibility client produces 3072-dimensional embeddings', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'text-embedding-3-large');
    assert.equal(body.dimensions, 3072);
    return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 });
  };
  try {
    const client = new OpenAICompat({ apiKey: 'test-key' });
    const result = await client.models.embedContent({ contents: [{ parts: [{ text: 'memoria' }] }] });
    assert.deepEqual(result.embedding.values, [0.1, 0.2]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI response parser supports output content blocks', () => {
  assert.equal(parseOpenAIResponseText({ output: [{ content: [{ type: 'output_text', text: 'respuesta' }] }] }), 'respuesta');
});
