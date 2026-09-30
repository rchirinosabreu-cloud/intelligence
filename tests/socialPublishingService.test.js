import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';
import { initSocialPublishingScheduler, SOCIAL_PUBLISHING_INTERVAL_MS } from '../src/services/socialPublishingScheduler.js';

// Rodny, 29 September 2026: the queue is the only place that knows whether a piece went out. Rows are
// claimed by compare-and-set, like Bria's reviews, so two replicas never publish the same piece twice.

const NOW = new Date('2036-10-03T15:31:00.000Z'); // 10:31 in Bogotá
const image = { id: 'a1', name: 'post.jpg', mimeType: 'image/jpeg', size: 1024, storageKey: 'plans/x/post.jpg', externalProvider: null, externalFileId: null };
const igAccount = { id: 'acc-ig', clientId: 'client-1', platform: 'INSTAGRAM', externalId: '1789', displayName: '@titanes', pageId: '5555', encryptedToken: 'enc:ig', isActive: true };
const fbAccount = { id: 'acc-fb', clientId: 'client-1', platform: 'FACEBOOK', externalId: '5555', displayName: 'Titanes', pageId: '5555', encryptedToken: 'enc:fb', isActive: true };

const baseItem = () => ({
  id: 'item-1', planId: 'plan-1', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '11:00',
  deletedAt: null, finalAssets: [image], plan: { id: 'plan-1', clientId: 'client-1', deletedAt: null, client: { id: 'client-1', socialAccounts: [igAccount, fbAccount] } }
});

/** A tiny in-memory Prisma: enough of `where` to keep the service honest, nothing more. */
const memoryDb = ({ item = baseItem(), publications = [] } = {}) => {
  const state = { item, publications: publications.map((row) => ({ ...row })), log: [] };
  const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some((clause) => matches(row, clause));
    if (key === 'AND') return expected.every((clause) => matches(row, clause));
    if (key === 'contentItem') return true;
    const value = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(value);
      if ('lte' in expected) return value != null && new Date(value).getTime() <= new Date(expected.lte).getTime();
      if ('lt' in expected) return value != null && new Date(value).getTime() < new Date(expected.lt).getTime();
      if ('not' in expected) return value !== expected.not;
      if ('equals' in expected) return value === expected.equals;
      return false;
    }
    if (expected === null) return value == null;
    return value === expected;
  });
  const db = {
    contentItem: {
      findUnique: async ({ where }) => (where.id === state.item.id ? { ...state.item, publications: state.publications.filter((row) => row.contentItemId === state.item.id) } : null),
      update: async ({ where, data }) => { state.log.push(['contentItem.update', where.id, data]); Object.assign(state.item, data); return state.item; }
    },
    socialPublication: {
      findMany: async ({ where = {}, take } = {}) => { state.log.push(['findMany', where]); const rows = state.publications.filter((row) => matches(row, where)); return take ? rows.slice(0, take) : rows; },
      findUnique: async ({ where }) => {
        const row = where.id
          ? state.publications.find((candidate) => candidate.id === where.id)
          : state.publications.find((candidate) => candidate.contentItemId === where.contentItemId_platform.contentItemId && candidate.platform === where.contentItemId_platform.platform);
        if (!row) return null;
        return { ...row, contentItem: { ...state.item }, socialAccount: [igAccount, fbAccount].find((account) => account.id === row.socialAccountId) };
      },
      upsert: async ({ where, create, update }) => {
        const { contentItemId, platform } = where.contentItemId_platform;
        const existing = state.publications.find((row) => row.contentItemId === contentItemId && row.platform === platform);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `pub-${platform.toLowerCase()}`, attempts: 0, nextAttemptAt: null, leaseToken: null, leaseAt: null, error: null, ...create };
        state.publications.push(row);
        return row;
      },
      update: async ({ where, data }) => { const row = state.publications.find((candidate) => candidate.id === where.id); state.log.push(['update', where.id, data]); Object.assign(row, data); return row; },
      updateMany: async ({ where, data }) => {
        const rows = state.publications.filter((row) => matches(row, where));
        state.log.push(['updateMany', where, data, rows.length]);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      count: async ({ where }) => state.publications.filter((row) => matches(row, where)).length
    },
    clientSocialAccount: {
      update: async ({ where, data }) => { state.log.push(['account.update', where.id, data]); return { id: where.id, ...data }; }
    }
  };
  return { db, state };
};

const fakeMeta = (script = {}) => {
  const calls = [];
  return {
    calls,
    client: {
      publishToInstagram: async (args) => { calls.push(['instagram', args]); if (script.instagram instanceof Error) throw script.instagram; return script.instagram || { mediaId: 'ig-1', permalink: 'https://www.instagram.com/p/1/' }; },
      publishToFacebookPage: async (args) => { calls.push(['facebook', args]); if (script.facebook instanceof Error) throw script.facebook; return script.facebook || { mediaId: 'fb-1', permalink: 'https://www.facebook.com/1' }; }
    }
  };
};

const build = ({ db, meta = fakeMeta().client, notifications = [] } = {}) => createSocialPublishingService({
  db, meta, now: () => NOW, decrypt: (value) => value.replace('enc:', 'token-'),
  mediaUrlFor: async (asset) => `https://signed.example/${asset.storageKey}`,
  notify: async (data) => { notifications.push(data); return data; },
  randomId: () => 'lease-1', logger: { error() {}, warn() {}, info() {} }
});

test('scheduling creates one SCHEDULED row per network at the Bogotá hour and remembers who asked', async () => {
  const { db, state } = memoryDb();
  const service = build({ db });
  const rows = await service.schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM', 'FACEBOOK'], actorUserId: 'user-rodny' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.platform, row.status, row.socialAccountId, row.requestedById]), [
    ['INSTAGRAM', 'SCHEDULED', 'acc-ig', 'user-rodny'], ['FACEBOOK', 'SCHEDULED', 'acc-fb', 'user-rodny']
  ]);
  assert.equal(rows[0].scheduledAt.toISOString(), '2036-10-03T16:00:00.000Z', '11:00 in Bogotá');
  assert.equal(state.publications.length, 2);
  const again = await service.schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'user-rodny' });
  assert.equal(again.length, 1);
  assert.equal(state.publications.length, 2, 'scheduling again reuses the row instead of duplicating it');
});

test('scheduling refuses with every problem named, and never for a piece already out on that network', async () => {
  const { db } = memoryDb({ item: { ...baseItem(), status: 'BORRADOR', publishTime: '' } });
  const service = build({ db });
  await assert.rejects(service.schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'u' }), (error) => (
    error.status === 422 && error.code === 'SOCIAL_PUBLICATION_INVALID' && error.problems.length === 2 && /aprobada/.test(error.problems[0]) && /hora/.test(error.problems[1])
  ));
  const published = memoryDb({ publications: [{ id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'PUBLISHED', scheduledAt: NOW }] });
  await assert.rejects(build({ db: published.db }).schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM'], actorUserId: 'u' }), (error) => /ya se publicó en Instagram/.test(error.problems[0]));
  await assert.rejects(build({ db: memoryDb().db }).schedulePublications({ itemId: 'missing', platforms: ['INSTAGRAM'], actorUserId: 'u' }), (error) => error.status === 404);
});

test('a scheduled publication can be cancelled; one already publishing cannot', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW },
    { id: 'pub-facebook', contentItemId: 'item-1', socialAccountId: 'acc-fb', platform: 'FACEBOOK', status: 'PUBLISHING', scheduledAt: NOW }
  ] });
  const service = build({ db });
  const cancelled = await service.cancelPublication({ publicationId: 'pub-instagram', actorUserId: 'u' });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(state.publications[0].cancelledAt.toISOString(), NOW.toISOString());
  await assert.rejects(service.cancelPublication({ publicationId: 'pub-facebook', actorUserId: 'u' }), (error) => error.status === 409 && /publicando/i.test(error.message));
  await assert.rejects(service.cancelPublication({ publicationId: 'nope', actorUserId: 'u' }), (error) => error.status === 404);
});

test('retrying a failed publication puts it back in the queue for right now, with a clean attempt count', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'FAILED', attempts: 3, error: 'Meta respondió: x', scheduledAt: new Date('2036-10-01T00:00:00.000Z') }
  ] });
  const service = build({ db });
  const row = await service.retryPublication({ publicationId: 'pub-instagram', actorUserId: 'u' });
  assert.equal(row.status, 'SCHEDULED');
  assert.equal(row.attempts, 0);
  assert.equal(row.error, null);
  assert.equal(state.publications[0].scheduledAt.toISOString(), NOW.toISOString(), 'a past hour means "as soon as possible"');
  await assert.rejects(service.retryPublication({ publicationId: 'pub-instagram', actorUserId: 'u' }), (error) => error.status === 409, 'only FAILED rows retry');
});

test('the cron claims due rows by compare-and-set, publishes with signed URLs and marks the piece PUBLICADO once every network is out', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: new Date('2036-10-03T15:30:00.000Z'), attempts: 0, requestedById: 'user-rodny' },
    { id: 'pub-facebook', contentItemId: 'item-1', socialAccountId: 'acc-fb', platform: 'FACEBOOK', status: 'SCHEDULED', scheduledAt: new Date('2036-10-03T15:30:00.000Z'), attempts: 0, requestedById: 'user-rodny' },
    { id: 'pub-later', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'LATER', status: 'SCHEDULED', scheduledAt: new Date('2036-10-03T18:00:00.000Z'), attempts: 0 }
  ] });
  const meta = fakeMeta();
  const notifications = [];
  const service = build({ db, meta: meta.client, notifications });
  const outcomes = await service.processDuePublications();
  assert.deepEqual(outcomes.map((outcome) => [outcome.id, outcome.status]), [['pub-instagram', 'PUBLISHED'], ['pub-facebook', 'PUBLISHED']], 'the later one waits');

  const claim = state.log.find(([kind]) => kind === 'updateMany');
  assert.deepEqual(claim[1], { id: 'pub-instagram', status: 'SCHEDULED', leaseToken: null }, 'compare-and-set on the row as it was read');
  assert.equal(claim[2].status, 'PUBLISHING');
  assert.equal(claim[2].leaseToken, 'lease-1');

  assert.deepEqual(meta.calls[0], ['instagram', { igUserId: '1789', token: 'token-ig', kind: 'IMAGE', caption: 'Hola', media: [{ url: 'https://signed.example/plans/x/post.jpg', isVideo: false }], coverUrl: null }]);
  assert.deepEqual(meta.calls[1], ['facebook', { pageId: '5555', token: 'token-fb', kind: 'IMAGE', caption: 'Hola', media: [{ url: 'https://signed.example/plans/x/post.jpg', isVideo: false }] }]);

  const ig = state.publications[0];
  assert.equal(ig.status, 'PUBLISHED');
  assert.equal(ig.permalink, 'https://www.instagram.com/p/1/');
  assert.equal(ig.externalMediaId, 'ig-1');
  assert.equal(ig.leaseToken, null, 'the lease is released');
  assert.equal(ig.publishedAt.toISOString(), NOW.toISOString());
  assert.equal(state.item.status, 'APROBADO', 'the piece is not PUBLICADO while one network is still pending');
  assert.equal(state.publications[1].status, 'PUBLISHED');
  // `pub-later` is still SCHEDULED, but it is a fake platform of this test; the rule counts SCHEDULED/PUBLISHING rows.
  assert.equal(state.item.status, 'APROBADO');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].userId, 'user-rodny');
  assert.equal(notifications[0].type, 'SOCIAL_PUBLICATION_PUBLISHED');
  assert.match(notifications[0].message, /Instagram/);
});

test('when the last pending network goes out, the piece becomes PUBLICADO', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 }
  ] });
  const service = build({ db });
  await service.processDuePublications();
  assert.equal(state.item.status, 'PUBLICADO');
});

test('a row another replica already claimed is skipped, not published twice', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 }
  ] });
  const original = db.socialPublication.updateMany;
  db.socialPublication.updateMany = async (args) => { state.publications[0].leaseToken = 'someone-else'; state.publications[0].status = 'PUBLISHING'; return original(args); };
  const meta = fakeMeta();
  const outcomes = await build({ db, meta: meta.client }).processDuePublications();
  assert.deepEqual(outcomes, [{ id: 'pub-instagram', status: 'SKIPPED' }]);
  assert.equal(meta.calls.length, 0);
});

test('a stale PUBLISHING row (lease older than ten minutes) is picked up again', async () => {
  const { db } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'PUBLISHING', leaseToken: 'dead', leaseAt: new Date(NOW.getTime() - 11 * 60 * 1000), scheduledAt: NOW, attempts: 0 }
  ] });
  const meta = fakeMeta();
  const outcomes = await build({ db, meta: meta.client }).processDuePublications();
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['PUBLISHED']);
  assert.equal(meta.calls.length, 1);
});

test('a transient Meta failure goes back to the queue with a growing wait; a permanent one fails and tells the requester', async () => {
  const transient = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0, requestedById: 'user-rodny' }
  ] });
  const notifications = [];
  await build({ db: transient.db, meta: fakeMeta({ instagram: Object.assign(new Error('Server error'), { status: 500 }) }).client, notifications }).processDuePublications();
  const row = transient.state.publications[0];
  assert.equal(row.status, 'SCHEDULED');
  assert.equal(row.attempts, 1);
  assert.equal(row.nextAttemptAt.toISOString(), new Date(NOW.getTime() + 2 * 60 * 1000).toISOString());
  assert.equal(row.error, 'Meta respondió: Server error');
  assert.equal(row.leaseToken, null);
  assert.equal(notifications.length, 0, 'a retry in two minutes is not news');

  const permanent = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0, requestedById: 'user-rodny' }
  ] });
  await build({ db: permanent.db, meta: fakeMeta({ instagram: Object.assign(new Error('Session has expired'), { status: 400, code: 190 }) }).client, notifications }).processDuePublications();
  const failed = permanent.state.publications[0];
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.attempts, 1);
  assert.match(failed.error, /volver a conectar/);
  assert.deepEqual(failed.diagnostics.slice(-1)[0].code, 190);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'SOCIAL_PUBLICATION_FAILED');
  assert.match(notifications[0].message, /volver a conectar/);
  const accountUpdate = permanent.state.log.find(([kind]) => kind === 'account.update');
  assert.deepEqual(accountUpdate[2].isActive, false, 'an expired token deactivates the connection so the client card asks to reconnect');
  assert.equal(permanent.state.item.status, 'APROBADO', 'a failed publication never marks the piece as published');
});

test('the third transient failure is final', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 2, requestedById: 'user-rodny' }
  ] });
  const notifications = [];
  await build({ db, meta: fakeMeta({ instagram: Object.assign(new Error('Busy'), { status: 503 }) }).client, notifications }).processDuePublications();
  assert.equal(state.publications[0].status, 'FAILED');
  assert.equal(state.publications[0].attempts, 3);
  assert.equal(notifications[0].type, 'SOCIAL_PUBLICATION_FAILED');
});

test('a piece that lost its approval or its final asset before the hour fails without calling Meta', async () => {
  const { db, state } = memoryDb({ item: { ...baseItem(), finalAssets: [] }, publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 }
  ] });
  const meta = fakeMeta();
  await build({ db, meta: meta.client }).processDuePublications();
  assert.equal(meta.calls.length, 0);
  assert.equal(state.publications[0].status, 'FAILED');
  assert.match(state.publications[0].error, /pieza final/);
});

test('changing the piece hour moves its scheduled rows; losing the hour cancels them with a reason', async () => {
  const { db, state } = memoryDb({ publications: [
    { id: 'pub-instagram', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 },
    { id: 'pub-facebook', contentItemId: 'item-1', socialAccountId: 'acc-fb', platform: 'FACEBOOK', status: 'PUBLISHED', scheduledAt: NOW, attempts: 1 }
  ] });
  const service = build({ db });
  state.item.publishTime = '18:45';
  await service.resyncItemPublications('item-1');
  assert.equal(state.publications[0].scheduledAt.toISOString(), '2036-10-03T23:45:00.000Z');
  assert.equal(state.publications[1].scheduledAt.toISOString(), NOW.toISOString(), 'a published row keeps its history');
  state.item.publishTime = null;
  await service.resyncItemPublications('item-1');
  assert.equal(state.publications[0].status, 'CANCELLED');
  assert.match(state.publications[0].error, /hora/);
});

test('the scheduler runs every minute, never overlaps itself and survives a failing cycle', async () => {
  const timers = [];
  let cycles = 0;
  const scheduler = initSocialPublishingScheduler({
    process: async () => { cycles += 1; if (cycles === 1) throw new Error('boom'); return [{ id: 'x', status: 'PUBLISHED' }]; },
    setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; },
    setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; },
    logger: { error() {}, info() {} }
  });
  assert.equal(SOCIAL_PUBLISHING_INTERVAL_MS, 60 * 1000);
  assert.deepEqual(timers.map(([kind]) => kind), ['timeout', 'interval']);
  assert.equal(timers[1][1], SOCIAL_PUBLISHING_INTERVAL_MS);
  assert.deepEqual(await scheduler.run(), { error: 'boom' });
  const [first, second] = await Promise.all([scheduler.run(), scheduler.run()]);
  assert.deepEqual([first, second].filter((result) => result?.skipped).length, 1, 'an overlapping tick is skipped');
});

test('the schema, the ensure script and the server wire the queue in', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  assert.match(schema, /model ClientSocialAccount \{/);
  assert.match(schema, /model SocialPublication \{/);
  assert.match(schema, /publishTime\s+String\?/);
  assert.match(schema, /@@unique\(\[contentItemId, platform\]\)/);
  const script = readFileSync('scripts/ensure-social-publishing-schema.js', 'utf8');
  assert.match(script, /ADD COLUMN IF NOT EXISTS "publishTime"/);
  assert.match(script, /CREATE TABLE IF NOT EXISTS "ClientSocialAccount"/);
  assert.match(script, /CREATE TABLE IF NOT EXISTS "SocialPublication"/);
  assert.match(readFileSync('package.json', 'utf8'), /ensure-social-publishing-schema\.js && /);
  assert.match(readFileSync('server.js', 'utf8'), /initSocialPublishingScheduler\(\)/);
});
