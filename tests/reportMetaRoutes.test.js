import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createReportMetaRouter } from '../src/routes/api/reportMetaRoutes.js';

// The doors of «cifras de Meta» in Reportes: anyone with the module sees what a client can bring;
// only administrators and project managers choose the ad account. Identity comes from the session.

const buildApp = ({ role = 'ADMIN' } = {}) => {
  const calls = [];
  const meta = Object.fromEntries(['listClientSources', 'listAvailableAdAccounts', 'previewCampaigns', 'linkAdAccount', 'unlinkAdAccount'].map((name) => [name, async (args) => {
    calls.push([name, args]);
    if (name === 'listAvailableAdAccounts' && role === 'NOTOKEN') throw Object.assign(new Error('falta META_SYSTEM_USER_TOKEN'), { status: 503, code: 'META_NOT_CONFIGURED' });
    if (args === 'boom') throw new Error('postgres://secret');
    if (name === 'listClientSources') return { configured: true, instagram: [{ id: 's-ig', displayName: '@cliente', pageId: 'p1' }], adAccounts: [] };
    if (name === 'listAvailableAdAccounts') return [{ id: '123', name: 'Francisco Villa', currency: 'COP', isActive: true }];
    if (name === 'previewCampaigns') return { matching: [{ id: 'k1', name: 'TITANES' }], others: [] };
    return { id: 'ad-1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: args?.campaignFilter || null };
  }]));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'actual-actor', role: role === 'NOTOKEN' ? 'ADMIN' : role }; next(); });
  app.use('/meta', createReportMetaRouter({ meta, logger: { error() {} } }));
  return { app, calls };
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  try { await run(`http://127.0.0.1:${server.address().port}/meta`); } finally { server.close(); }
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('anyone with the module sees what the client can bring from Meta', async () => {
  const { app, calls } = buildApp({ role: 'EDITOR' });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/sources?clientId=c1`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).instagram[0].displayName, '@cliente');
    assert.deepEqual(calls.at(-1), ['listClientSources', 'c1']);
    assert.equal((await fetch(`${base}/sources`)).status, 400);
    const failure = await fetch(`${base}/sources?clientId=boom`);
    assert.equal(failure.status, 500);
    assert.doesNotMatch(await failure.text(), /postgres:/);
  });
});

test('choosing the ad account of a client is for administrators and project managers', async () => {
  const editor = buildApp({ role: 'EDITOR' });
  await withServer(editor.app, async (base) => {
    assert.equal((await fetch(`${base}/ad-accounts/available`)).status, 403);
    assert.equal((await fetch(`${base}/ad-accounts`, json('POST', { clientId: 'c1', adAccountId: '123' }))).status, 403);
    assert.equal((await fetch(`${base}/ad-accounts/ad-1`, { method: 'DELETE' })).status, 403);
    assert.equal((await fetch(`${base}/ad-accounts/123/campaigns?filter=titanes`)).status, 403);
    assert.equal(editor.calls.length, 0);
  });
  const admin = buildApp({ role: 'ADMIN' });
  await withServer(admin.app, async (base) => {
    const available = await fetch(`${base}/ad-accounts/available`);
    assert.deepEqual(await available.json(), { accounts: [{ id: '123', name: 'Francisco Villa', currency: 'COP', isActive: true }] });
    const preview = await fetch(`${base}/ad-accounts/act_123/campaigns?filter=titanes`);
    assert.equal(preview.status, 200);
    assert.deepEqual(admin.calls.at(-1), ['previewCampaigns', { adAccountId: 'act_123', campaignFilter: 'titanes' }]);
    const linked = await fetch(`${base}/ad-accounts`, json('POST', { clientId: 'c1', adAccountId: '123', campaignFilter: 'Titanes', actorUserId: 'spoofed' }));
    assert.equal(linked.status, 201);
    assert.deepEqual(admin.calls.at(-1), ['linkAdAccount', { clientId: 'c1', adAccountId: '123', campaignFilter: 'Titanes', actorUserId: 'actual-actor' }]);
    assert.equal((await fetch(`${base}/ad-accounts`, json('POST', { clientId: 'c1' }))).status, 400);
    assert.equal((await fetch(`${base}/ad-accounts/ad-1`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(admin.calls.at(-1), ['unlinkAdAccount', { id: 'ad-1' }]);
  });
});

test('a server without the key of Meta says so instead of failing in silence', async () => {
  const { app } = buildApp({ role: 'NOTOKEN' });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/ad-accounts/available`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'META_NOT_CONFIGURED');
  });
});

test('the routes are mounted before the report by id and the extraction is wired to Meta', () => {
  const source = readFileSync(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf("router.use('/meta'") > 0 && source.indexOf("router.use('/meta'") < source.indexOf("router.get('/:reportId'"));
  assert.match(source, /fetchMetaSources:\s*metaReportService\.fetchSources/);
});
