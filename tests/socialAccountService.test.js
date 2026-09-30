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
      upsert: async ({ where, create, update }) => {
        const existing = accounts.find((row) => row.clientId === where.clientId_platform.clientId && row.platform === where.clientId_platform.platform);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `acc-${create.platform.toLowerCase()}`, ...create };
        accounts.push(row);
        return row;
      },
      update: async ({ where, data }) => { const row = accounts.find((candidate) => candidate.id === where.id); Object.assign(row, data); log.push(['account.update', where.id, data]); return row; }
    },
    socialPublication: {
      updateMany: async ({ where, data }) => { log.push(['publications.updateMany', where, data]); return { count: 1 }; }
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
  assert.deepEqual(Object.keys(rows[0]).sort(), ['clientId', 'connectedAt', 'displayName', 'externalId', 'id', 'isActive', 'lastError', 'pageId', 'platform']);
});
