import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createClientOperationsRouter } from '../src/routes/api/clientOperations.js';

// Operación de clientes: solo administradores y project managers. La identidad sale de la sesión, el
// cuerpo se filtra y un error interno nunca se muestra.

const buildApp = (role = 'ADMIN') => {
  const calls = [];
  const service = Object.fromEntries(['listOperations', 'getOperation', 'saveProfile', 'setMonthlyReport', 'markPiecePublished'].map((name) => [name, async (args) => {
    calls.push([name, args]);
    if (args?.clientId === 'invalid') throw Object.assign(new Error('Revisa los campos marcados.'), { status: 422, code: 'CLIENT_OPERATION_INVALID', errors: { agency: 'Elige Brain Studio o MIO Agencia.' } });
    if (args === 'boom') throw new Error('postgres://secret');
    return name === 'listOperations' ? [{ id: 'c1' }] : { id: 'c1' };
  }]));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'actual-actor', role }; next(); });
  app.use('/ops', createClientOperationsRouter({ service, logger: { error() {} } }));
  return { app, calls };
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}/ops`); } finally { server.close(); }
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('quien no es administrador ni project manager no entra', async () => {
  const { app, calls } = buildApp('EDITOR');
  await withServer(app, async (base) => {
    assert.equal((await fetch(base)).status, 403);
    assert.equal((await fetch(`${base}/nattal`)).status, 403);
    assert.equal((await fetch(`${base}/c1/profile`, json('PUT', {}))).status, 403);
  });
  assert.equal(calls.length, 0);
});

test('el tablero y la página del cliente se leen', async () => {
  const { app, calls } = buildApp('PROJECT_MANAGER');
  await withServer(app, async (base) => {
    assert.deepEqual(await (await fetch(base)).json(), [{ id: 'c1' }]);
    assert.equal((await fetch(`${base}/nattal`)).status, 200);
    assert.deepEqual(calls.at(-1), ['getOperation', 'nattal']);
    const failure = await fetch(`${base}/boom`);
    assert.equal(failure.status, 500);
    assert.doesNotMatch(await failure.text(), /postgres/);
  });
});

test('guardar la ficha filtra el cuerpo y usa el actor de la sesión', async () => {
  const { app, calls } = buildApp();
  await withServer(app, async (base) => {
    const saved = await fetch(`${base}/c1/profile`, json('PUT', { agency: 'MIO', contract: { status: 'ACTIVO' }, renew: true, actorUserId: 'spoofed', name: 'otro', slug: 'x' }));
    assert.equal(saved.status, 200);
    assert.deepEqual(calls.at(-1), ['saveProfile', { clientId: 'c1', actorUserId: 'actual-actor', input: { agency: 'MIO', contract: { status: 'ACTIVO' }, renew: true } }]);
    const invalid = await fetch(`${base}/invalid/profile`, json('PUT', { agency: 'OTRA' }));
    assert.equal(invalid.status, 422);
    assert.deepEqual((await invalid.json()).errors, { agency: 'Elige Brain Studio o MIO Agencia.' });
  });
});

test('el informe del mes y «Ya se publicó»', async () => {
  const { app, calls } = buildApp();
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/c1/reports/2026/9`, json('PUT', { delivered: true }))).status, 200);
    assert.deepEqual(calls.at(-1), ['setMonthlyReport', { clientId: 'c1', year: 2026, month: 9, delivered: true, actorUserId: 'actual-actor' }]);
    assert.equal((await fetch(`${base}/c1/reports/2026/9`, json('PUT', { delivered: 'sí' }))).status, 400, 'delivered tiene que ser booleano');
    assert.equal((await fetch(`${base}/c1/pieces/item-1/published`, { method: 'POST' })).status, 200);
    assert.deepEqual(calls.at(-1), ['markPiecePublished', { clientId: 'c1', itemId: 'item-1' }]);
  });
});
