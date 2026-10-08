import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaConversationRouter } from '../src/routes/api/briaConversations.js';
import { createBriaKnowledgeRouter } from '../src/routes/api/briaKnowledge.js';
test('media is authenticated and multipart files cannot supply an identity or trusted parsed content', async () => {
  const id = '00000000-0000-0000-0000-000000000001'; let received, role = 'ADMIN';
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: 'session', role, modulePermissions: { bria: true } }; next(); });
  const internal = { id, turns: [{ id: 'reply', role: 'assistant', text: 'Respuesta autorizada', sources: [{ label: 'Contrato confidencial', url: 'https://mail.google.com/private' }] }] };
  app.use('/chat', createBriaConversationRouter({ service: { read: async () => internal, send: async args => { received = args; return internal; }, transcribe: async (_user, file) => { assert.equal(file.buffer.toString(), 'fake recording'); return { text: 'Texto editable' }; } } }));
  app.use('/knowledge', createBriaKnowledgeRouter({ service: { registry: async () => assert.fail('PM reached registry') } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const form = new FormData(); form.set('question', 'Revisa'); form.set('user', '{"id":"victim"}'); form.set('files', new Blob(['Real bytes']), 'nota.txt');
    const sent = await fetch(`${base}/chat/${id}/messages`, { method: 'POST', body: form });
    assert.equal(sent.status, 200);
    assert.equal(Object.hasOwn((await sent.json()).turns[0], 'sources'), false, 'source titles and URLs stay server-side');
    assert.equal(Object.hasOwn((await (await fetch(`${base}/chat/${id}`)).json()).turns[0], 'sources'), false, 'reopened history also hides sources');
    assert.equal(internal.turns[0].sources.length, 1, 'internal provenance is preserved for authorization');
    assert.equal(received.user.id, 'session'); assert.equal(received.files[0].buffer.toString(), 'Real bytes');
    const audio = new FormData(); audio.set('audio', new Blob(['fake recording'], { type: 'audio/webm' }), 'dictado.webm');
    assert.equal((await fetch(`${base}/chat/dictation`, { method: 'POST', body: audio })).status, 200);
    role = 'PROJECT_MANAGER'; assert.equal((await fetch(`${base}/knowledge`)).status, 403);
    role = 'EDITOR'; assert.equal((await fetch(`${base}/chat/${id}/messages`, { method: 'POST', body: form })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('permanent deletion uses the authenticated author, validates ids and reports pending files honestly', async () => {
  let received, active = true;
  const id = '00000000-0000-0000-0000-000000000001';
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: 'owner-session', role: 'ADMIN', isActive: active, modulePermissions: { bria: true } }; next(); });
  app.use('/chat', createBriaConversationRouter({ service: { remove: async (...args) => { received = args; return { deleted: true, filesPending: true }; } } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/chat/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 3, user: { id: 'victim' } }) });
    assert.equal(response.status, 202); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { deleted: true, filesPending: true });
    assert.equal(received[0].id, 'owner-session'); assert.equal(received[2], 3);
    assert.equal((await fetch(`${base}/chat/invalid`, { method: 'DELETE' })).status, 400);
    active = false; received = null;
    assert.equal((await fetch(`${base}/chat/${id}`, { method: 'DELETE' })).status, 403); assert.equal(received, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
