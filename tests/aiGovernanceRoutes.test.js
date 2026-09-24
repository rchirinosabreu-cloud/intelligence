import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
const { createAiGovernanceRouter } = await import('../src/routes/api/aiGovernance.js').catch(() => ({}));
test('la API usa la sesión, rechaza anónimos y conserva códigos de conflicto', async () => {
  assert.equal(typeof createAiGovernanceRouter, 'function');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.headers['x-test-user']) req.user = { userId: 'session-admin' }; next(); });
  let actor;
  app.use('/api/ai-governance', createAiGovernanceRouter({ service: {
    options: async id => { actor = id; return { clients: [] }; },
    save: async () => { throw Object.assign(new Error('Recarga'), { status: 409, code: 'GOVERNANCE_VERSION_CONFLICT' }); }
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/ai-governance`;
  try {
    assert.equal((await fetch(`${base}/options`)).status, 401);
    assert.equal((await fetch(`${base}/options?actorId=forged`, { headers: { 'x-test-user': 'yes' } })).status, 200);
    assert.equal(actor, 'session-admin');
    const result = await fetch(`${base}/systems/id`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-test-user': 'yes' }, body: '{}' });
    assert.equal(result.status, 409); assert.equal((await result.json()).code, 'GOVERNANCE_VERSION_CONFLICT');
    assert.equal((await fetch(`${base}/documents/unknown`, { headers: { 'x-test-user': 'yes' } })).status, 404);
    for (const id of ['01-programa', '02-politica', '03-incidentes', '04-riesgos', '05-autorizacion', '06-operacion']) {
      assert.equal((await fetch(`${base}/documents/${id}`)).status, 401);
      const doc = await fetch(`${base}/documents/${id}`, { headers: { 'x-test-user': 'yes' } });
      assert.equal(doc.status, 200); assert.match(doc.headers.get('content-disposition'), /attachment/);
      assert.match(await doc.text(), /INTERNO/);
    }
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
