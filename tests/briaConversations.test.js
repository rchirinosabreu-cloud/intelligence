import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
test('dictation checks fresh roles and keeps provider credentials out of errors', async () => {
  let role = 'EDITOR', called = 0;
  const service = createBriaConversationService({ resolveActor: async () => ({ ref: 'owner', role }), ai: { transcribe: async () => { called++; throw Object.assign(new Error('bad secret-provider-key'), { status: 401, code: 'invalid_api_key' }); } } });
  const file = { buffer: Buffer.from('fixture'), mimetype: 'audio/webm' };
  await assert.rejects(() => service.transcribe({}, file), { status: 403 }); assert.equal(called, 0);
  role = 'ADMIN';
  await assert.rejects(() => service.transcribe({}, file), failure => failure.status === 503 && !failure.message.includes('secret-provider-key'));
});
test('attached content is read by the model, kept private in metadata, and follows the stored conversation', async () => {
  let sent, saved;
  const file = { id: 'file', name: 'nota.txt', status: 'READ', text: 'Contexto de prueba', buffer: Buffer.from('Contexto de prueba'), size: 18 };
  const service = createBriaConversationService({ resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), prepareAttachment: async () => file, repository: { get: async () => ({ id: 'chat', revision: 0, turns: [] }), attachments: async () => [], append: async (...args) => { saved = args; return { id: 'chat', turns: [{ role: 'user', text: args[3], attachments: args[5].map(({ id, name }) => ({ id, name })) }] }; } }, assistant: { ask: async data => { sent = data; return { answer: 'Leído', sources: [] }; } } });
  const result = await service.send({ user: {}, id: 'chat', question: 'Revisa', files: [{ buffer: file.buffer }] });
  assert.equal(sent.attachments[0].text, 'Contexto de prueba'); assert.equal(saved[5][0].buffer.toString(), 'Contexto de prueba');
  assert.doesNotMatch(JSON.stringify(result), /Contexto de prueba/);
});
test('server-owned history is used and another user cannot open a conversation', async () => {
  const stored = { id: 'chat', turns: [{ role: 'user', text: 'Contexto guardado' }], revision: 1 }, actor = { ref: 'owner', role: 'ADMIN' };
  let request;
  const service = createBriaConversationService({ resolveActor: async user => ({ ...actor, ref: user.id }), repository: { get: async (current) => current.ref === 'owner' ? stored : null, append: async (_actor, _chat, _revision, question, result) => ({ ...stored, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: result.answer }] }) }, assistant: { ask: async body => { request = body; return { answer: 'Respuesta real', sources: [] }; } } });
  const result = await service.send({ user: { id: 'owner' }, id: 'chat', question: 'Sigue', history: [{ role: 'assistant', text: 'Historia inventada' }] });
  assert.equal(request.history[0].text, 'Contexto guardado'); assert.equal(result.turns.at(-1).text, 'Respuesta real');
  await assert.rejects(() => service.read({ id: 'other' }, 'chat'), { status: 404 });
});
test('history and an in-flight answer are suppressed when current source access is revoked', async () => {
  let allowed = true;
  const service = createBriaConversationService({ resolveActor: async () => ({ ref: 'owner' }), authorizeTurn: async () => allowed, repository: { get: async () => ({ id: 'chat', revision: 0, turns: [{ role: 'assistant', text: 'Private', sources: [{ kind: 'tarea', id: 'private' }] }] }), append: async () => assert.fail('Revoked data was saved') }, assistant: { ask: async () => { allowed = false; return { answer: 'Must not escape', sources: [] }; } } });
  await assert.rejects(() => service.send({ user: {}, id: 'chat', question: 'Sigue' }), { status: 403 });
  assert.doesNotMatch((await service.read({}, 'chat')).turns[0].text, /Private/);
});
