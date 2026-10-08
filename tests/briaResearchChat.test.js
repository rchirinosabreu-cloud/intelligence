import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaResearchChatService } from '../src/services/briaResearchChatService.js';
const user = { id: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
test('research chat retrieves evidence, preserves history and does not claim live platform access', async () => {
  const requests = [];
  const evidence = { id: 'drive:a', kind: 'drive', title: 'Endova onboarding', excerpt: 'Sebastián participa en revisión; aprobación final sin definir.', authority: 'Referencia documental', url: 'https://docs.google.com/document/d/a/edit' };
  const repository = { search: async () => [evidence], inbox: async () => [], read: async () => evidence };
  const ai = { async generate(request) {
    requests.push(request);
    return requests.length === 1 ? { output: [{ type: 'function_call', call_id: 'c', name: 'memoria_de_agencia', arguments: '{"consulta":"Endova"}' }], functionCalls: [{ id: 'c', name: 'memoria_de_agencia', args: { consulta: 'Endova' } }] } : { text: 'La aprobación final no está definida.' };
  } };
  const service = createBriaResearchChatService({ repository, ai });
  const result = await service.ask({ user, question: '¿Quién aprueba?', history: [{ role: 'user', text: 'Hablemos de Endova' }] });
  assert.equal(result.sources[0].id, 'drive:a');
  assert.match(requests[0].instructions, /7 de octubre de 2026/);
  assert.match(requests[0].instructions, /no están conectados/i);
  assert.doesNotMatch(requests[0].instructions, /búscalo con buscar_cliente/);
  assert.equal(requests[0].input[0].content[0].text, 'Hablemos de Endova');
  assert.match(requests[1].input.at(-1).output, /aprobación final sin definir/);
});
test('disabled users cannot trigger model calls or source reads', async () => {
  let called = false;
  const service = createBriaResearchChatService({ repository: {}, ai: { generate() { called = true; } } });
  await assert.rejects(() => service.ask({ user: { ...user, modulePermissions: {} }, question: 'Endova' }), { status: 403 });
  assert.equal(called, false);
  await assert.rejects(() => service.ask({ user, question: ' ' }), { status: 400 });
});
test('provider errors never expose a credential or raw upstream payload', async () => {
  const service = createBriaResearchChatService({ repository: {}, ai: { generate: async () => { throw Object.assign(new Error('Invalid key: private-secret-value'), { status: 401, code: 'invalid_api_key' }); } } });
  await assert.rejects(() => service.ask({ user, question: 'Endova' }), err => err.status === 503 && !err.message.includes('private-secret-value'));
});
test('an explicit conversational teaching persists a proposal and returns a receipt', async () => {
  let writes = 0, calls = 0;
  const knowledge = { list: async () => [], save: async (_user, input) => { writes++; return { ...input, id: 'remembered', revision: 1, author: 'Rodny' }; } };
  const ai = { generate: async request => {
    assert.ok(request.tools.some(tool => tool.name === 'recordar_aprendizaje'));
    return calls++ === 0 ? { output: [], functionCalls: [{ id: 'proposal', name: 'recordar_aprendizaje', args: { scope: 'ACCOUNT', entity: 'Cuenta de prueba', topic: 'Revisión', text: 'El responsable confirma antes de enviar.', kind: 'PROPOSAL', validFrom: '2026-10-07', validUntil: null } }] } : { text: 'Guardé la propuesta.' };
  } };
  const service = createBriaResearchChatService({ repository: {}, knowledge, ai });
  const result = await service.ask({ user, question: 'Aprende esta propuesta de revisión.' });
  assert.equal(result.sources[0].id, 'remembered'); assert.equal(writes, 1);
});
