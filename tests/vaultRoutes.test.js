import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createVaultRouter } from '../src/routes/api/vault.js';
import { createRateLimiter } from '../src/config/security.js';
import { createVaultService } from '../src/services/vaultService.js';
import { createVaultTools } from '../src/services/vaultTools.js';

const buildApp = ({ service, max = 30 } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'u-actual', role: 'PROJECT_MANAGER', sessionVersion: 0 }; next(); });
  app.use('/vault', createVaultRouter({ service, logger: { error() {} }, revealLimiter: createRateLimiter({ windowMs: 60_000, max, keyGenerator: (req) => req.user.userId }) }));
  return app;
};
const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}/vault`); } finally { server.close(); }
};
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('the vault answers without cache, uses the session identity, and never tells technical causes', async () => {
  const calls = [];
  const service = {
    list: async (user, filters) => { calls.push(['list', user.userId, filters]); return [{ id: 'a1', platform: 'Instagram' }]; },
    reveal: async (user, id, via) => { calls.push(['reveal', user.userId, id, via]); return { id, secret: 'ficticia' }; },
    update: async (user, id, revision, changes) => { calls.push(['update', id, revision, changes]); return { id, revision: revision + 1 }; },
    get: async () => { throw new Error('postgres://secreto'); }
  };
  await withServer(buildApp({ service }), async (base) => {
    const list = await fetch(`${base}/credentials?clientId=c1&q=insta`);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls[0], ['list', 'u-actual', { clientId: 'c1', query: 'insta' }]);
    const shown = await fetch(`${base}/credentials/a1/reveal`, post({ via: 'BRIA', user: { userId: 'spoofed' } }));
    assert.equal(shown.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls[1], ['reveal', 'u-actual', 'a1', 'BRIA']);
    await fetch(`${base}/credentials/a1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, changes: { label: 'Nuevo' } }) });
    assert.deepEqual(calls[2], ['update', 'a1', 2, { label: 'Nuevo' }]);
    const broken = await fetch(`${base}/credentials/a1`);
    assert.equal(broken.status, 500);
    assert.equal(JSON.stringify(await broken.json()).includes('postgres'), false);
  });
});

test('revealing is limited per person', async () => {
  const service = { reveal: async (_u, id) => ({ id, secret: 'x' }) };
  await withServer(buildApp({ service, max: 2 }), async (base) => {
    assert.equal((await fetch(`${base}/credentials/a/reveal`, post({}))).status, 200);
    assert.equal((await fetch(`${base}/credentials/a/reveal`, post({}))).status, 200);
    assert.equal((await fetch(`${base}/credentials/a/reveal`, post({}))).status, 429);
  });
});

test('the service reads the clients a PM manages today and refuses people outside the team', async () => {
  const seen = [];
  const repository = { list: async (actor) => { seen.push(actor); return []; } };
  const db = (row, clients = []) => ({ user: { findUnique: async () => row }, client: { findMany: async (args) => { seen.push(args.where); return clients; } } });
  const pmRow = { id: 'u-pm', name: 'Camila', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 0, teamMember: { id: 'm-camila', name: 'Camila', isActive: true } };
  await createVaultService({ repository, db: db(pmRow, [{ id: 'c1' }, { id: 'c2' }]) }).list({ userId: 'u-pm', sessionVersion: 0 }, {});
  assert.deepEqual(seen[0], { projectManagerId: 'm-camila' });
  assert.deepEqual(seen[1].managedClientIds, ['c1', 'c2']);
  await assert.rejects(() => createVaultService({ repository, db: db({ ...pmRow, role: 'EDITOR' }) }).list({ userId: 'u-pm', sessionVersion: 0 }, {}), { status: 403 });
  await assert.rejects(() => createVaultService({ repository, db: db({ ...pmRow, teamMember: { isActive: false } }) }).list({ userId: 'u-pm', sessionVersion: 0 }, {}), { status: 403 });
  await assert.rejects(() => createVaultService({ repository, db: db(pmRow) }).list({ userId: 'u-pm', sessionVersion: 3 }, {}), { status: 401 });
});

test('Bria finds accesses but never receives a password: the platform shows it behind a button', async () => {
  const service = { list: async (_user, filters) => [{ id: 'a1', clientName: 'Aristea', platform: 'Instagram', label: 'Cuenta principal', url: 'https://instagram.com/x', hasUsername: true, kind: 'ACCESO', ...(filters.clientId ? {} : {}) }] };
  const [tool] = createVaultTools(service);
  assert.equal(tool.name, 'buscar_acceso');
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } }), true);
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', isActive: true, modulePermissions: {} }), false);
  const out = await tool.run({ clientId: 'c1', consulta: 'instagram' }, { user: { userId: 'u-pm' } });
  assert.deepEqual(out.accessCards, [{ id: 'a1', cliente: 'Aristea', plataforma: 'Instagram', nombre: 'Cuenta principal' }]);
  assert.equal(JSON.stringify(out).includes('secret'), false);
  assert.match(out.data.instruccion, /botón/i);
});

test('the vault route is mounted behind authentication and for managers only', () => {
  const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  const auth = routes.indexOf('router.use(authenticateToken)');
  const vault = routes.indexOf("router.use('/vault', requireManagerRole, createVaultRouter())");
  assert.ok(auth > 0 && vault > auth);
});
