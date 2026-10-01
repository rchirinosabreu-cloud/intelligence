import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createSocialPublishingRouter } from '../src/routes/api/socialPublishing.js';

// Routes take the identity from the session, whitelist the payload, and never leak internal errors.

const buildApp = ({ role = 'ADMIN' } = {}) => {
  const calls = [];
  const publishing = Object.fromEntries(['schedulePublications', 'cancelPublication', 'retryPublication', 'reopenPublication', 'listPlanPublications'].map((name) => [name, async (args) => {
    calls.push([name, args]);
    if (args?.itemId === 'invalid') throw Object.assign(new Error('La pieza necesita hora.'), { status: 422, code: 'SOCIAL_PUBLICATION_INVALID', problems: ['La pieza necesita hora.', 'Falta Instagram.'] });
    if (args?.itemId === 'boom') throw new Error('postgres://secret');
    return name === 'listPlanPublications' ? [{ id: 'p1' }] : { id: 'p1', status: 'SCHEDULED' };
  }]));
  const accounts = Object.fromEntries(['listAvailablePages', 'listClientAccounts', 'linkPage', 'disconnectAccount'].map((name) => [name, async (args) => {
    calls.push([name, args]);
    if (name === 'listAvailablePages' && role === 'NOTOKEN') throw Object.assign(new Error('falta META_SYSTEM_USER_TOKEN'), { status: 503, code: 'META_NOT_CONFIGURED' });
    return name === 'listAvailablePages' || name === 'listClientAccounts' ? [{ pageId: '5555' }] : [{ id: 'acc' }];
  }]));
  accounts.isConfigured = () => role !== 'NOTOKEN';
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'actual-actor', role: role === 'NOTOKEN' ? 'ADMIN' : role }; next(); });
  app.use('/social', createSocialPublishingRouter({ publishing, accounts, logger: { error() {} } }));
  return { app, calls };
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  try {
    await run(`http://127.0.0.1:${server.address().port}/social`);
  } finally {
    server.close();
  }
};

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('scheduling, cancelling and retrying use the session identity and pass the problems through', async () => {
  const { app, calls } = buildApp({ role: 'EDITOR' });
  await withServer(app, async (base) => {
    const scheduled = await fetch(`${base}/publications`, json('POST', { itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'spoofed' }));
    assert.equal(scheduled.status, 201);
    assert.deepEqual(calls.at(-1), ['schedulePublications', { itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'actual-actor' }]);

    const invalid = await fetch(`${base}/publications`, json('POST', { itemId: 'invalid', platforms: ['INSTAGRAM'] }));
    assert.equal(invalid.status, 422);
    const body = await invalid.json();
    assert.deepEqual(body.problems, ['La pieza necesita hora.', 'Falta Instagram.']);
    assert.equal(body.code, 'SOCIAL_PUBLICATION_INVALID');

    const failure = await fetch(`${base}/publications`, json('POST', { itemId: 'boom', platforms: ['INSTAGRAM'] }));
    assert.equal(failure.status, 500);
    assert.doesNotMatch(await failure.text(), /postgres:/);

    assert.equal((await fetch(`${base}/publications/p1`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(calls.at(-1), ['cancelPublication', { publicationId: 'p1', actorUserId: 'actual-actor' }]);
    assert.equal((await fetch(`${base}/publications/p1/retry`, { method: 'POST' })).status, 200);
    assert.deepEqual(calls.at(-1), ['retryPublication', { publicationId: 'p1', actorUserId: 'actual-actor' }]);
    assert.equal((await fetch(`${base}/publications/p1/reopen`, json('POST', { actorUserId: 'spoofed' }))).status, 200);
    assert.deepEqual(calls.at(-1), ['reopenPublication', { publicationId: 'p1', actorUserId: 'actual-actor' }]);
    const list = await fetch(`${base}/publications?planId=plan-1`);
    assert.equal(list.status, 200);
    assert.deepEqual(calls.at(-1), ['listPlanPublications', 'plan-1']);
    assert.equal((await fetch(`${base}/publications`)).status, 400, 'planId is required');
  });
});

test('anyone with the module can see a client\'s accounts; only managers see available pages, link or disconnect', async () => {
  const editor = buildApp({ role: 'EDITOR' });
  await withServer(editor.app, async (base) => {
    assert.equal((await fetch(`${base}/accounts?clientId=client-1`)).status, 200);
    assert.deepEqual(editor.calls.at(-1), ['listClientAccounts', 'client-1']);
    assert.equal((await fetch(`${base}/accounts/available`)).status, 403);
    assert.equal((await fetch(`${base}/accounts/link`, json('POST', { clientId: 'client-1', pageId: '5555' }))).status, 403);
    assert.equal((await fetch(`${base}/accounts/acc`, { method: 'DELETE' })).status, 403);
  });
  const admin = buildApp({ role: 'ADMIN' });
  await withServer(admin.app, async (base) => {
    const available = await fetch(`${base}/accounts/available`);
    assert.equal(available.status, 200);
    assert.deepEqual(await available.json(), { configured: true, pages: [{ pageId: '5555' }] });
    const link = await fetch(`${base}/accounts/link`, json('POST', { clientId: 'client-1', pageId: '5555', actorUserId: 'spoofed' }));
    assert.equal(link.status, 201);
    assert.deepEqual(admin.calls.at(-1), ['linkPage', { clientId: 'client-1', pageId: '5555', actorUserId: 'actual-actor' }]);
    assert.equal((await fetch(`${base}/accounts/acc`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(admin.calls.at(-1), ['disconnectAccount', { accountId: 'acc', actorUserId: 'actual-actor' }]);
  });
  const unconfigured = buildApp({ role: 'NOTOKEN' });
  await withServer(unconfigured.app, async (base) => {
    const available = await fetch(`${base}/accounts/available`);
    assert.equal(available.status, 503);
    assert.match((await available.json()).error, /META_SYSTEM_USER_TOKEN/);
  });
});

test('the router is mounted under the parrillas permission', () => {
  const index = readFileSync('src/routes/index.js', 'utf8');
  assert.match(index, /router\.use\('\/social', requireModulePermission\('parrillas'\), socialPublishingRouter\)/);
});
