import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaKnowledgeRouter } from '../src/routes/api/briaKnowledge.js';
test('learning writes use the session identity, reject disabled sessions and validate versions', async () => {
  const app = express(); app.use(express.json()); let saved;
  app.use((req, _res, next) => { req.user = { id: 'session', role: 'ADMIN', modulePermissions: { bria: true } }; next(); });
  app.use(createBriaKnowledgeRouter({ service: { save: async (user, body) => { saved = user; return { id: 'learning', text: body.text }; }, undo: async () => ({}) } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: { id: 'victim' }, text: 'Aprendizaje' }) })).status, 200);
    assert.equal(saved.id, 'session');
    assert.equal((await fetch(`${base}/00000000-0000-0000-0000-000000000001/undo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: '1' }) })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
