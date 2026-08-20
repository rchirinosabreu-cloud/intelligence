import test from 'node:test';
import assert from 'node:assert/strict';

const loadService = async () => {
  try {
    return await import('../src/services/talentInsightService.js');
  } catch (error) {
    assert.fail(`Talent Insight OpenAI service should exist: ${error.message}`);
  }
};

test('generates a talent insight through the OpenAI Responses API', async () => {
  const { generateTalentInsightWithOpenAI } = await loadService();
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({ output_text: 'Análisis ejecutivo listo.' })
    };
  };

  const insight = await generateTalentInsightWithOpenAI('Datos reales del periodo', {
    env: { OPENAI_API_KEY: 'test-key', OPENAI_MODEL_RADAR: 'gpt-radar-test' },
    fetchImpl
  });

  assert.equal(insight, 'Análisis ejecutivo listo.');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'gpt-radar-test');
  assert.equal(body.input, 'Datos reales del periodo');
  assert.match(body.instructions, /Director de Operaciones/);
});

test('uses the shared OpenAI model and stable fallback in priority order', async () => {
  const { resolveTalentInsightModel } = await loadService();

  assert.equal(resolveTalentInsightModel({ OPENAI_MODEL_RADAR: 'radar', OPENAI_MODEL: 'shared' }), 'radar');
  assert.equal(resolveTalentInsightModel({ OPENAI_MODEL: 'shared' }), 'shared');
  assert.equal(resolveTalentInsightModel({}), 'gpt-5');
});

test('fails clearly when the OpenAI API key is missing', async () => {
  const { generateTalentInsightWithOpenAI } = await loadService();

  await assert.rejects(
    generateTalentInsightWithOpenAI('prompt', { env: {}, fetchImpl: async () => assert.fail('fetch should not run') }),
    /OPENAI_API_KEY/
  );
});

test('rejects failed or empty OpenAI responses', async () => {
  const { generateTalentInsightWithOpenAI } = await loadService();
  const env = { OPENAI_API_KEY: 'test-key' };

  await assert.rejects(
    generateTalentInsightWithOpenAI('prompt', {
      env,
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => '{"error":"rate limited"}' })
    }),
    /OpenAI talent insight generation failed \(429\)/
  );

  await assert.rejects(
    generateTalentInsightWithOpenAI('prompt', {
      env,
      fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ output: [] }) })
    }),
    /response content is empty/
  );
});
