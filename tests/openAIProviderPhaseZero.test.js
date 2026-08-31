import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('OpenAI client preserves Responses API text, tools and reasoning contracts', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'x-request-id': 'req_phase_zero' }),
      async json() {
        return {
          id: 'resp_1',
          model: 'gpt-5.6-terra',
          output: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'get_client_guidelines',
              arguments: '{"identifier":"Brainstudio"}'
            },
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Respuesta verificada' }]
            }
          ]
        };
      }
    };
  };

  const { createOpenAIClient } = await import('../src/services/openAIClient.js');
  const client = createOpenAIClient({
    apiKey: 'test-key',
    fetchImpl,
    models: { chat: 'gpt-5.6-terra', fast: 'gpt-5.6-luna', embedding: 'text-embedding-3-large' }
  });

  const result = await client.generate({
    prompt: 'Crea una parrilla para Brainstudio',
    instructions: 'Consulta primero las reglas del cliente.',
    tools: [{
      name: 'get_client_guidelines',
      description: 'Obtiene las reglas del cliente.',
      parameters: {
        type: 'object',
        properties: { identifier: { type: 'string' } },
        required: ['identifier']
      }
    }]
  });

  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].body.model, 'gpt-5.6-terra');
  assert.deepEqual(requests[0].body.reasoning, { effort: 'none' });
  assert.equal(requests[0].body.tools[0].type, 'function');
  assert.equal(result.text, 'Respuesta verificada');
  assert.deepEqual(result.functionCalls, [{
    id: 'call_1',
    name: 'get_client_guidelines',
    args: { identifier: 'Brainstudio' }
  }]);
});

test('OpenAI embeddings keep the existing PostgreSQL vector dimension', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() { return { data: [{ embedding: [0.1, 0.2] }] }; }
    };
  };

  const { createOpenAIClient } = await import('../src/services/openAIClient.js');
  const client = createOpenAIClient({ apiKey: 'test-key', fetchImpl });
  const embedding = await client.embed('memoria de prueba');

  assert.deepEqual(embedding, [0.1, 0.2]);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/embeddings');
  assert.equal(requests[0].body.model, 'text-embedding-3-large');
  assert.equal(requests[0].body.dimensions, 3072);
});

test('OpenAI health accepts a successful authenticated response even when the tiny ping has no output text', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'x-request-id': 'req_health' }),
    async json() {
      return {
        id: 'resp_health',
        model: 'gpt-5',
        output: [{ type: 'reasoning', summary: [] }]
      };
    }
  });

  const { createOpenAIClient } = await import('../src/services/openAIClient.js');
  const client = createOpenAIClient({
    apiKey: 'test-key',
    fetchImpl,
    models: { fast: 'gpt-5' }
  });

  const health = await client.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.provider, 'openai');
  assert.equal(health.model, 'gpt-5');
  assert.equal(health.requestId, 'req_health');
});

test('Phase 0 selects OpenAI in every active Brain runtime and reports real AI health', async () => {
  const [config, aiService, brainCore, talentRadar, proxy, server] = await Promise.all([
    readFile('src/config/aiConfig.js', 'utf8'),
    readFile('src/services/aiService.js', 'utf8'),
    readFile('src/services/brainCoreService.js', 'utf8'),
    readFile('src/routes/api/talentRadar.js', 'utf8'),
    readFile('src/controllers/proxyController.js', 'utf8'),
    readFile('server.js', 'utf8')
  ]);

  assert.match(config, /provider:\s*['"]openai['"]/);
  for (const source of [aiService, brainCore, talentRadar]) {
    assert.doesNotMatch(source, /@google\/genai|GoogleGenAI|GEMINI_API_KEY|GEMINI_MODEL/);
  }
  assert.doesNotMatch(server, /Google GenAI iniciado correctamente/);
  assert.doesNotMatch(server, /app\.use\(['"]\/api\/gemini/);
  assert.doesNotMatch(proxy, /export const geminiProxy/);
  assert.match(server, /getAIHealth/);
  assert.match(server, /OPENAI_API_KEY/);
});

test('the browser proxy cannot bypass the centrally configured OpenAI chat model', async () => {
  const [proxy, frontend] = await Promise.all([
    readFile('src/controllers/proxyController.js', 'utf8'),
    readFile('src/services/frontendApiService.js', 'utf8')
  ]);

  assert.match(proxy, /import \{ AI_MODELS \} from ['"]\.\.\/config\/aiConfig\.js['"]/);
  assert.match(proxy, /requestBody\s*=\s*\{\s*\.\.\.req\.body,\s*model:\s*AI_MODELS\.chat,\s*stream:\s*true\s*\}/);
  assert.doesNotMatch(frontend, /model:\s*['"]gpt-5['"]/);
});
