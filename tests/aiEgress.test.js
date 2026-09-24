import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';
import { createFirefliesClient } from '../src/services/firefliesService.js';
import { readFileSync } from 'node:fs';
const module = await import('../src/services/aiEgress.js').catch(() => ({}));
const response = () => ({ ok: true, headers: new Headers(), json: async () => ({ id: 'fake', output_text: 'OK', data: [{ embedding: [1] }] }) });
const denied = () => { throw Object.assign(new Error('Sin permiso'), { code: 'AI_AUTHORIZATION_REQUIRED', status: 403 }); };
test('la salida común no transmite cuando la autorización se rechaza', async () => {
  assert.equal(typeof module.createGovernedFetch, 'function'); let sent = 0;
  const send = module.createGovernedFetch({ governance: { assertEgress: denied }, fetchImpl: async () => { sent++; return response(); } });
  await assert.rejects(send('https://api.openai.com/v1/responses', { body: JSON.stringify({ model: 'm' }), governanceContext: { clientId: 'c', useCase: 'reports.vision' } }), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
  assert.equal(sent, 0);
});
test('valida el destino y modelo efectivos y no transmite metadatos internos', async () => {
  assert.equal(typeof module.createGovernedFetch, 'function'); let decision, outgoing;
  const send = module.createGovernedFetch({ governance: { assertEgress: async c => { decision = c; } }, fetchImpl: async (_url, options) => { outgoing = options; return response(); } });
  await send('https://api.openai.com/v1/embeddings', { body: JSON.stringify({ model: 'embedding-real', input: 'synthetic' }), governanceContext: { clientId: 'c', useCase: 'memory.index', provider: 'forged', model: 'forged' } });
  assert.equal(decision.provider, 'openai'); assert.equal(decision.model, 'embedding-real'); assert.equal(decision.clientId, 'c');
  assert.equal(outgoing.governanceContext, undefined); assert.equal(outgoing.redirect, 'error');
});
test('el adaptador común protege generate, embed y la compatibilidad generateContent', async () => {
  let sent = 0;
  const ai = createOpenAIClient({ apiKey: 'test', governance: { assertEgress: denied }, fetchImpl: async () => { sent++; return response(); } });
  for (const call of [() => ai.generate({ prompt: 'synthetic' }), () => ai.embed('synthetic'), () => ai.models.generateContent({ contents: [{ parts: [{ text: 'synthetic' }] }] })]) {
    await assert.rejects(call(), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
  }
  assert.equal(sent, 0);
});
test('la comprobación de salud envía solo su contenido fijo aunque no haya autorizaciones', async () => {
  const bodies = [];
  const ai = createOpenAIClient({ apiKey: 'test', governance: { assertEgress: denied }, fetchImpl: async (_u, o) => { bodies.push(JSON.parse(o.body)); return response(); } });
  await ai.healthCheck(); assert.equal(bodies.length, 1); assert.equal(bodies[0].input, 'Responde únicamente: OK');
});
test('destinos no inventariados se rechazan sin red', async () => {
  assert.equal(typeof module.createGovernedFetch, 'function');
  const send = module.createGovernedFetch({ governance: { assertEgress: async () => {} }, fetchImpl: async () => { throw new Error('network must not happen'); } });
  await assert.rejects(send('https://api.openai.com.attacker.invalid/v1/responses', { body: '{}' }), e => e.code === 'AI_DESTINATION_INVALID');
});

test('el servicio rechaza el alcance desconocido si hay cualquier empresa protegida', async () => {
  const service = createGovernanceService({ pool: { query: async () => ({ rows: [{ enabled: true }] }) } });
  assert.equal(typeof service.assertEgress, 'function');
  await assert.rejects(service.assertEgress({ provider: 'openai', model: 'm' }), e => e.code === 'AI_SCOPE_REQUIRED');
});
test('sin controles activos conserva el comportamiento anterior; fallo de BD no permite salida', async () => {
  const service = createGovernanceService({ pool: { query: async () => ({ rows: [{ enabled: false }] }) } });
  assert.equal(typeof service.assertEgress, 'function');
  assert.equal((await service.assertEgress({ provider: 'openai', model: 'm' })).enforced, false);
  const failed = createGovernanceService({ pool: { query: async () => { throw new Error('DB unavailable'); } } });
  await assert.rejects(failed.assertEgress({}), /DB unavailable/);
});
test('Fireflies no solicita transcripciones sin permiso', async () => {
  let sent = 0;
  const api = createFirefliesClient({ apiKey: 'test', governance: { assertEgress: denied }, fetchImpl: async () => { sent++; return response(); } });
  await assert.rejects(api.listTranscripts(), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
  await assert.rejects(api.getTranscript('fake'), e => e.code === 'AI_AUTHORIZATION_REQUIRED');
  assert.equal(sent, 0);
});
test('las salidas directas inventariadas usan el transporte protegido', () => {
  for (const file of ['src/controllers/proxyController.js', 'src/services/reportVisionService.js', 'src/routes/api/reports.js', 'lib/ai/providers.ts']) {
    assert.match(readFileSync(file, 'utf8'), /import \{ governedFetch as fetch \} from .*aiEgress.js/, file);
  }
});
