import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaConversationRouter } from '../src/routes/api/briaConversations.js';
import { createBriaKnowledgeRouter } from '../src/routes/api/briaKnowledge.js';
test('media is authenticated and multipart files cannot supply an identity or trusted parsed content', async () => {
  const id = '00000000-0000-0000-0000-000000000001'; let received, role = 'ADMIN';
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: 'session', role, modulePermissions: { bria: true } }; next(); });
  app.use('/chat', createBriaConversationRouter({ service: { read: async () => ({ id }), send: async args => { received = args; return { id, turns: [] }; }, transcribe: async (_user, file) => { assert.equal(file.buffer.toString(), 'fake recording'); return { text: 'Texto editable' }; } } }));
  app.use('/knowledge', createBriaKnowledgeRouter({ service: { registry: async () => assert.fail('PM reached registry') } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const form = new FormData(); form.set('question', 'Revisa'); form.set('user', '{"id":"victim"}'); form.set('files', new Blob(['Real bytes']), 'nota.txt');
    assert.equal((await fetch(`${base}/chat/${id}/messages`, { method: 'POST', body: form })).status, 200);
    assert.equal(received.user.id, 'session'); assert.equal(received.files[0].buffer.toString(), 'Real bytes');
    const audio = new FormData(); audio.set('audio', new Blob(['fake recording'], { type: 'audio/webm' }), 'dictado.webm');
    assert.equal((await fetch(`${base}/chat/dictation`, { method: 'POST', body: audio })).status, 200);
    role = 'PROJECT_MANAGER'; assert.equal((await fetch(`${base}/knowledge`)).status, 403);
    role = 'EDITOR'; assert.equal((await fetch(`${base}/chat/${id}/messages`, { method: 'POST', body: form })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
