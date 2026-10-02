import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialAccountService } from '../src/services/socialAccountService.js';

// The Meta system user of Brain Studio's Business Manager is the "robot" that publishes. Its token lives
// in an environment variable; an admin picks, per client, which page it manages. Nobody pastes tokens.

const NOW = new Date('2036-10-01T12:00:00.000Z');
const pages = [
  { pageId: '5555', pageName: 'Titanes', pageToken: 'page-token-5555', instagram: { id: '1789', username: 'titanes' } },
  { pageId: '6666', pageName: 'Sin Instagram', pageToken: 'page-token-6666', instagram: null }
];

const memoryDb = () => {
  const accounts = [];
  const publications = [];
  const log = [];
  const db = {
    clientSocialAccount: {
      findMany: async ({ where }) => accounts.filter((row) => row.clientId === where.clientId),
      findUnique: async ({ where }) => accounts.find((row) => row.id === where.id) || null,
      // No upsert by «client and network» any more: a client may have several accounts of a network.
      create: async ({ data }) => {
        const row = { id: `acc-${data.platform.toLowerCase()}-${data.externalId}`, isPrimary: false, ...data };
        accounts.push(row);
        return row;
      },
      update: async ({ where, data }) => { const row = accounts.find((candidate) => candidate.id === where.id); Object.assign(row, data); log.push(['account.update', where.id, data]); return row; }
    },
    socialPublication: {
      updateMany: async ({ where, data }) => { log.push(['publications.updateMany', where, data]); return { count: 1 }; }
    },
    contentItem: {
      updateMany: async ({ where, data }) => { log.push(['items.updateMany', where, data]); return { count: 0 }; }
    },
    client: { findUnique: async ({ where }) => (where.id === 'client-1' ? { id: 'client-1', name: 'Titanes' } : null) }
  };
  return { db, accounts, publications, log };
};

const build = ({ db, token = 'sys-token', listManagedPages = async () => pages } = {}) => createSocialAccountService({
  db, meta: { listManagedPages }, encrypt: (value) => `enc:${value}`, systemToken: () => token, now: () => NOW
});

test('without the system token nothing can be listed or linked, and the message says which variable is missing', async () => {
  const { db } = memoryDb();
  const service = build({ db, token: '' });
  assert.equal(service.isConfigured(), false);
  await assert.rejects(service.listAvailablePages(), (error) => error.status === 503 && /META_SYSTEM_USER_TOKEN/.test(error.message));
  await assert.rejects(service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' }), (error) => error.status === 503);
});

test('available pages come from Meta without their tokens', async () => {
  const { db } = memoryDb();
  const service = build({ db });
  const available = await service.listAvailablePages();
  assert.deepEqual(available, [
    { pageId: '5555', pageName: 'Titanes', instagram: { id: '1789', username: 'titanes' } },
    { pageId: '6666', pageName: 'Sin Instagram', instagram: null }
  ]);
  assert.equal(JSON.stringify(available).includes('page-token'), false);
});

test('linking a page creates the Facebook and Instagram rows of that client with the page token encrypted', async () => {
  const { db, accounts } = memoryDb();
  const service = build({ db });
  const linked = await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'user-rodny' });
  assert.deepEqual(linked.map((row) => [row.platform, row.externalId, row.displayName, row.pageId, row.isActive]), [
    ['FACEBOOK', '5555', 'Titanes', '5555', true],
    ['INSTAGRAM', '1789', '@titanes', '5555', true]
  ]);
  assert.equal(accounts[0].encryptedToken, 'enc:page-token-5555');
  assert.equal(accounts[0].connectedById, 'user-rodny');
  assert.equal(JSON.stringify(linked).includes('page-token'), false, 'the public shape never carries the token');
  assert.equal(JSON.stringify(linked).includes('enc:'), false);

  const relinked = await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'user-rodny' });
  assert.equal(accounts.length, 2, 'linking again refreshes the same rows');
  assert.equal(relinked.length, 2);
});

test('a page without Instagram links Facebook only and says so; an unknown page is refused', async () => {
  const { db } = memoryDb();
  const service = build({ db });
  const linked = await service.linkPage({ clientId: 'client-1', pageId: '6666', actorUserId: 'u' });
  assert.deepEqual(linked.map((row) => row.platform), ['FACEBOOK']);
  await assert.rejects(service.linkPage({ clientId: 'client-1', pageId: '9999', actorUserId: 'u' }), (error) => error.status === 404 && /no administra/i.test(error.message));
  await assert.rejects(service.linkPage({ clientId: 'ghost', pageId: '5555', actorUserId: 'u' }), (error) => error.status === 404);
});

// Rodny, 2 October 2026: «conectar más de una cuenta a un cliente». Before this, linking a second page
// replaced the first one, and what was scheduled for Endova would have gone out on the new page.
test('linking a second page adds an account: the first one is left exactly as it was and stays the default', async () => {
  const { db, accounts, log } = memoryDb();
  const service = build({ db });
  await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' });
  const before = accounts.map((row) => ({ ...row }));
  const added = await service.linkPage({ clientId: 'client-1', pageId: '6666', actorUserId: 'u' });
  assert.deepEqual(added.map((row) => [row.platform, row.externalId, row.isPrimary]), [['FACEBOOK', '6666', false]]);
  assert.equal(accounts.length, 3);
  assert.deepEqual(accounts.slice(0, 2), before, 'the accounts already connected are not touched');
  assert.deepEqual(accounts.map((row) => [row.pageId, row.isPrimary, row.isActive]), [['5555', true, true], ['5555', true, true], ['6666', false, true]]);
  assert.equal(log.some(([kind]) => kind === 'publications.updateMany'), false, 'nothing scheduled on the first account is cancelled');
  // With one account the pieces name none; with two, a piece that names none goes nowhere. So what was
  // already scheduled on the only account now names it, and keeps its destination.
  const stamped = log.filter(([kind]) => kind === 'items.updateMany');
  assert.equal(stamped.length, 1, 'only when the client goes from one account to two');
  assert.deepEqual(stamped[0][2], { socialPageIds: ['5555'] });
  assert.deepEqual(stamped[0][1].socialPageIds, { isEmpty: true }, 'a piece that already chose is left alone');
  assert.deepEqual(stamped[0][1].publications.some.status, { in: ['SCHEDULED', 'PUBLISHING'] });
  assert.deepEqual(stamped[0][1].publications.some.socialAccountId.in.sort(), ['acc-facebook-5555', 'acc-instagram-1789']);
  const listed = await service.listClientAccounts('client-1');
  assert.deepEqual(listed.map((row) => row.isPrimary), [true, true, false]);
});

test('a page that lost its Instagram switches that Instagram off — its own, never the one of another account', async () => {
  const { db, accounts, log } = memoryDb();
  let current = pages;
  const service = build({ db, listManagedPages: async () => current });
  await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' });
  current = [{ ...pages[0], instagram: null }, { pageId: '7777', pageName: 'Otra', pageToken: 't-7777', instagram: { id: '2000', username: 'otra' } }];
  await service.linkPage({ clientId: 'client-1', pageId: '7777', actorUserId: 'u' });
  const relinked = await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' });
  const stale = accounts.find((row) => row.platform === 'INSTAGRAM' && row.pageId === '5555');
  assert.equal(stale.isActive, false, 'the stale Instagram must not be offered by the editor any more');
  assert.match(stale.lastError, /ya no tiene Instagram/);
  assert.deepEqual(relinked.map((row) => [row.platform, row.isActive]), [['FACEBOOK', true], ['INSTAGRAM', false]]);
  const cancelled = log.find(([kind, where]) => kind === 'publications.updateMany' && where.socialAccountId === stale.id);
  assert.equal(cancelled[2].status, 'CANCELLED');
  assert.match(cancelled[2].error, /Instagram/);
  assert.equal(accounts.find((row) => row.platform === 'INSTAGRAM' && row.pageId === '7777').isActive, true, 'the Instagram of the other account stays on');
  assert.equal(JSON.stringify(relinked).includes('enc:'), false);
});

test('disconnecting keeps the row (history) but deactivates it and cancels what was scheduled on it', async () => {
  const { db, accounts, log } = memoryDb();
  const service = build({ db });
  await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' });
  const result = await service.disconnectAccount({ accountId: accounts[1].id, actorUserId: 'u' });
  assert.equal(result.isActive, false);
  assert.equal(accounts.length, 2);
  const cancelled = log.find(([kind]) => kind === 'publications.updateMany');
  assert.deepEqual(cancelled[1], { socialAccountId: accounts[1].id, status: 'SCHEDULED' });
  assert.equal(cancelled[2].status, 'CANCELLED');
  assert.match(cancelled[2].error, /desconect/i);
  await assert.rejects(service.disconnectAccount({ accountId: 'nope', actorUserId: 'u' }), (error) => error.status === 404);
});

test('listing a client\'s accounts returns the public shape only', async () => {
  const { db } = memoryDb();
  const service = build({ db });
  await service.linkPage({ clientId: 'client-1', pageId: '5555', actorUserId: 'u' });
  const rows = await service.listClientAccounts('client-1');
  assert.equal(rows.length, 2);
  assert.equal('encryptedToken' in rows[0], false);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['clientId', 'connectedAt', 'displayName', 'externalId', 'id', 'isActive', 'isPrimary', 'lastError', 'pageId', 'platform']);
});
