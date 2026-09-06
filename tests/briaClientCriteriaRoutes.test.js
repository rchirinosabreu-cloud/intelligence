import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createClientCriteriaRouter } from '../src/routes/api/clientCriteria.js';

test('criteria HTTP routes whitelist payload, use authenticated identity and hide internal errors', async () => {
  const calls = [];
  const service = Object.fromEntries(['list', 'propose', 'decide', 'remove'].map(name => [name, async args => {
    calls.push([name, args]);
    if (args.reason === 'fail') throw new Error('secret database hostname');
    if (args.reason === 'denied') throw Object.assign(new Error('Sin permiso.'), { status: 403 });
    return { ok: true };
  }]));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'actual-actor' }; next(); });
  app.use('/plans/:planId/criteria', createClientCriteriaRouter(service, { error() {} }));
  const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/plans/plan/criteria`;
    assert.equal((await fetch(base)).status, 200);
    const post = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actorUserId: 'spoofed-admin', clientId: 'foreign', status: 'APPROVED', text: 'Texto', category: 'MARCA', reason: 'Guía', requestId: 'key' }) });
    assert.equal(post.status, 201);
    assert.equal(calls[1][1].actorUserId, 'actual-actor');
    assert.equal(calls[1][1].clientId, undefined);
    assert.equal(calls[1][1].status, undefined);
    for (const [reason, status] of [['denied', 403], ['fail', 500]]) {
      const response = await fetch(`${base}/rule`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'APPROVE', version: 1, reason, actorUserId: 'spoofed-admin' }) });
      assert.equal(response.status, status);
      assert.doesNotMatch(await response.text(), /secret database/);
    }
    const deletion = await fetch(`${base}/rule`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 2, confirmation: 'ELIMINAR', actorUserId: 'spoofed-admin', role: 'ADMIN', clientId: 'foreign' }) });
    assert.equal(deletion.status, 200);
    assert.deepEqual(calls.at(-1), ['remove', { planId: 'plan', actorUserId: 'actual-actor', criterionId: 'rule', version: 2, confirmation: 'ELIMINAR' }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
