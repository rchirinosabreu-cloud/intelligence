import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pieceAccountLabel, pieceSocialPageIds, pieceTargetAccounts, schedulingProblems, socialPagesOf
} from '../src/lib/socialPublishing.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// Rodny, 2 October 2026: «tengo una parrilla pero se maneja y publica en diferentes cuentas… hay post
// de esa parrilla que son para PromoGroup y otros para Endova». One client, several accounts; each
// piece says where it goes. It may go to several; only the first one connected comes ticked.

const NOW = new Date('2036-10-03T15:31:00.000Z'); // 10:31 in Bogotá
const account = (id, platform, pageId, displayName, extra = {}) => ({ id, clientId: 'client-1', platform, externalId: `${platform === 'INSTAGRAM' ? 'ig' : ''}${pageId}`, displayName, pageId, encryptedToken: `enc:${id}`, isActive: true, isPrimary: false, ...extra });
const promoFb = account('promo-fb', 'FACEBOOK', '100', 'PromoGroup IPS', { isPrimary: true });
const promoIg = account('promo-ig', 'INSTAGRAM', '100', '@promogroup.ips', { isPrimary: true });
const endovaFb = account('endova-fb', 'FACEBOOK', '200', 'Endova');
const endovaIg = account('endova-ig', 'INSTAGRAM', '200', '@endova.salud');
const barraFb = account('barra-fb', 'FACEBOOK', '300', 'Barra Lima');
const ALL = [endovaIg, promoFb, barraFb, endovaFb, promoIg];

test('the accounts of a client are read as pages: the default one first, the rest by name, each with its networks', () => {
  const pages = socialPagesOf(ALL);
  assert.deepEqual(pages.map((page) => [page.pageId, page.name, page.isPrimary, page.accounts.map((row) => row.id)]), [
    ['100', 'PromoGroup IPS', true, ['promo-fb', 'promo-ig']],
    ['300', 'Barra Lima', false, ['barra-fb']],
    ['200', 'Endova', false, ['endova-fb', 'endova-ig']]
  ]);
  assert.deepEqual(socialPagesOf([]), []);
  // Nobody flagged yet (rows from before): the first page by name is the default, and only one.
  assert.deepEqual(socialPagesOf([endovaFb, barraFb]).map((page) => [page.name, page.isPrimary]), [['Barra Lima', true], ['Endova', false]]);
  // The flagged page was disconnected: the default moves to one that can still publish.
  const dead = [{ ...promoFb, isActive: false }, { ...promoIg, isActive: false }, endovaFb];
  assert.deepEqual(socialPagesOf(dead).map((page) => [page.name, page.isPrimary, page.isActive]), [['Endova', true, true], ['PromoGroup IPS', false, false]]);
  // Rows from before pages were recorded stay together instead of becoming two «pages».
  assert.equal(socialPagesOf([{ ...promoFb, pageId: null }, { ...promoIg, pageId: null }]).length, 1);
});

test('a piece goes to the accounts it names; one that names none goes to the default account only', () => {
  assert.deepEqual(pieceSocialPageIds({ socialPageIds: [] }, ALL), ['100']);
  assert.deepEqual(pieceSocialPageIds({}, ALL), ['100']);
  assert.deepEqual(pieceSocialPageIds({ socialPageIds: ['200'] }, ALL), ['200']);
  assert.deepEqual(pieceSocialPageIds({ socialPageIds: ['200', '100', '200'] }, ALL), ['100', '200'], 'several, once each, in the order of the pages');
  assert.deepEqual(pieceSocialPageIds({ socialPageIds: ['999'] }, ALL), ['100'], 'an account that is no longer connected never leaves the piece without destination');
  assert.deepEqual(pieceSocialPageIds({ socialPageIds: ['200'] }, []), []);
  assert.deepEqual(pieceTargetAccounts({ socialPageIds: ['200'] }, ALL).map((row) => row.id), ['endova-fb', 'endova-ig']);
  assert.deepEqual(pieceTargetAccounts({}, ALL).map((row) => row.id), ['promo-fb', 'promo-ig']);
});

test('the label of a piece names its accounts only when the client has more than one', () => {
  assert.equal(pieceAccountLabel({ socialPageIds: ['200'] }, ALL), 'Endova');
  assert.equal(pieceAccountLabel({}, ALL), 'PromoGroup IPS');
  assert.equal(pieceAccountLabel({ socialPageIds: ['100', '200'] }, ALL), 'PromoGroup IPS + Endova');
  assert.equal(pieceAccountLabel({}, [promoFb, promoIg]), null, 'one account: nothing to tell apart');
  assert.equal(pieceAccountLabel({}, []), null);
});

const image = { id: 'a1', name: 'post.jpg', mimeType: 'image/jpeg', size: 1024, storageKey: 'plans/x/post.jpg', externalProvider: null, externalFileId: null };
const baseItem = (extra = {}) => ({
  id: 'item-1', planId: 'plan-1', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '11:00',
  deletedAt: null, socialPageIds: [], finalAssets: [image],
  plan: { id: 'plan-1', clientId: 'client-1', deletedAt: null, client: { id: 'client-1', socialAccounts: ALL } }, ...extra
});

test('what stops a piece is said about the accounts chosen, by name', () => {
  const item = baseItem();
  assert.deepEqual(schedulingProblems({ item, assets: [image], targets: [endovaFb, endovaIg], now: NOW }), []);
  assert.match(schedulingProblems({ item, assets: [image], targets: [], now: NOW })[0], /al menos una cuenta/);
  const off = schedulingProblems({ item, assets: [image], targets: [{ ...endovaIg, isActive: false }], now: NOW });
  assert.match(off[0], /@endova\.salud/);
  assert.match(off[0], /desconectada/);
  // A story never goes to Facebook, whichever account it is.
  assert.match(schedulingProblems({ item: baseItem({ format: 'Historia' }), assets: [image], targets: [endovaFb], now: NOW })[0], /historia/i);
});

/** A tiny in-memory Prisma, as in the queue tests. */
const memoryDb = ({ item = baseItem(), publications = [] } = {}) => {
  const state = { item, publications: publications.map((row) => ({ ...row })) };
  const db = {
    contentItem: {
      findUnique: async ({ where }) => (where.id === state.item.id ? { ...state.item, publications: state.publications.filter((row) => row.contentItemId === state.item.id) } : null),
      update: async ({ data }) => { Object.assign(state.item, data); return state.item; }
    },
    socialPublication: {
      upsert: async ({ where, create, update }) => {
        const { contentItemId, socialAccountId } = where.contentItemId_socialAccountId;
        const existing = state.publications.find((row) => row.contentItemId === contentItemId && row.socialAccountId === socialAccountId);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `pub-${socialAccountId}`, attempts: 0, ...create };
        state.publications.push(row);
        return row;
      },
      update: async ({ where, data }) => { const row = state.publications.find((candidate) => candidate.id === where.id); Object.assign(row, data); return row; }
    }
  };
  return { db, state };
};
const build = (db) => createSocialPublishingService({ db, meta: {}, now: () => NOW, decrypt: (value) => value, mediaUrlFor: async () => 'https://signed.example/x', notify: async () => {}, randomId: () => 'lease', logger: { error() {}, warn() {}, info() {} } });

test('scheduling creates a row per account chosen, and only for accounts the piece goes to', async () => {
  const { db, state } = memoryDb({ item: baseItem({ socialPageIds: ['200'] }) });
  const service = build(db);
  const rows = await service.schedulePublications({ itemId: 'item-1', accountIds: ['endova-ig', 'endova-fb'], actorUserId: 'user-rodny' });
  assert.deepEqual(rows.map((row) => [row.socialAccountId, row.platform, row.status]).sort(), [['endova-fb', 'FACEBOOK', 'SCHEDULED'], ['endova-ig', 'INSTAGRAM', 'SCHEDULED']]);
  assert.equal(state.publications.length, 2);

  // PromoGroup is connected to the client but is not where this piece goes: refused, nothing created.
  await assert.rejects(service.schedulePublications({ itemId: 'item-1', accountIds: ['promo-ig'], actorUserId: 'u' }), (error) => (
    error.status === 422 && /no es de esta pieza/.test(error.problems[0])
  ));
  assert.equal(state.publications.length, 2);
});

test('the same piece can go out on two accounts of the client: one row for each, never mixed up', async () => {
  const { db, state } = memoryDb({ item: baseItem({ socialPageIds: ['100', '200'] }) });
  const rows = await build(db).schedulePublications({ itemId: 'item-1', accountIds: ['promo-ig', 'endova-ig'], actorUserId: 'u' });
  assert.deepEqual(rows.map((row) => row.socialAccountId), ['promo-ig', 'endova-ig'], 'two Instagram accounts: two rows');
  assert.deepEqual(state.publications.map((row) => row.platform), ['INSTAGRAM', 'INSTAGRAM']);
});

test('a piece that names no account is scheduled on the default one, as every client with a single account', async () => {
  const { db } = memoryDb();
  const rows = await build(db).schedulePublications({ itemId: 'item-1', platforms: ['INSTAGRAM', 'FACEBOOK'], actorUserId: 'u' });
  assert.deepEqual(rows.map((row) => row.socialAccountId), ['promo-ig', 'promo-fb']);
});

test('changing where a piece goes cancels what was scheduled on the accounts it left, saying why', async () => {
  const scheduledAt = new Date('2036-10-03T16:00:00.000Z');
  const { db, state } = memoryDb({ publications: [
    { id: 'p-promo-ig', contentItemId: 'item-1', socialAccountId: 'promo-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt },
    { id: 'p-promo-fb', contentItemId: 'item-1', socialAccountId: 'promo-fb', platform: 'FACEBOOK', status: 'PUBLISHED', scheduledAt, publishedAt: scheduledAt, permalink: 'https://www.facebook.com/1' }
  ] });
  const service = build(db);
  const result = await service.setItemSocialPages({ itemId: 'item-1', pageIds: ['200'], actorUserId: 'user-rodny' });
  assert.deepEqual(result.socialPageIds, ['200']);
  assert.deepEqual(state.item.socialPageIds, ['200']);
  assert.equal(state.publications[0].status, 'CANCELLED', 'nothing goes out on the account the piece left');
  assert.match(state.publications[0].error, /ya no va a esta cuenta/);
  assert.equal(state.publications[1].status, 'PUBLISHED', 'what already went out is history, not undone');

  await assert.rejects(service.setItemSocialPages({ itemId: 'item-1', pageIds: [], actorUserId: 'u' }), (error) => error.status === 422 && /al menos a una cuenta/.test(error.message));
  await assert.rejects(service.setItemSocialPages({ itemId: 'item-1', pageIds: ['999'], actorUserId: 'u' }), (error) => error.status === 422 && /no está conectada/.test(error.message));
  assert.deepEqual(state.item.socialPageIds, ['200'], 'a refused change changes nothing');
});

test('the schema, the start script and the routes carry several accounts per client', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  assert.match(schema, /socialPageIds\s+String\[\]/);
  assert.match(schema, /isPrimary\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /@@unique\(\[clientId, platform, externalId\]\)/);
  assert.match(schema, /@@unique\(\[contentItemId, socialAccountId\]\)/);
  assert.doesNotMatch(schema, /@@unique\(\[clientId, platform\]\)/);
  assert.doesNotMatch(schema, /@@unique\(\[contentItemId, platform\]\)/);

  const ensure = readFileSync('scripts/ensure-social-publishing-schema.js', 'utf8');
  // The old indexes allowed one account per network: they go, and must not be recreated on every start.
  assert.match(ensure, /DROP INDEX IF EXISTS "ClientSocialAccount_clientId_platform_key"/);
  assert.match(ensure, /DROP INDEX IF EXISTS "SocialPublication_contentItemId_platform_key"/);
  assert.doesNotMatch(ensure, /CREATE UNIQUE INDEX IF NOT EXISTS "ClientSocialAccount_clientId_platform_key"/);
  assert.doesNotMatch(ensure, /CREATE UNIQUE INDEX IF NOT EXISTS "SocialPublication_contentItemId_platform_key"/);
  assert.match(ensure, /"ClientSocialAccount_clientId_platform_externalId_key"/);
  assert.match(ensure, /"SocialPublication_contentItemId_socialAccountId_key"/);
  assert.match(ensure, /ADD COLUMN IF NOT EXISTS "socialPageIds" TEXT\[\]/);
  assert.match(ensure, /ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN/);
  // Purely additive: nothing in this script deletes a row.
  assert.doesNotMatch(ensure, /DELETE FROM|DROP TABLE|DROP COLUMN|TRUNCATE/i);

  const routes = readFileSync('src/routes/api/socialPublishing.js', 'utf8');
  assert.match(routes, /router\.put\('\/items\/:itemId\/pages'/);
  assert.match(routes, /accountIds/);
  const content = readFileSync('src/services/contentService.js', 'utf8');
  assert.match(content, /socialPageIds: true/);
  assert.match(content, /socialAccountId: true/);
  assert.match(content, /isPrimary: true/);
});

test('the band lets the person choose the accounts of the piece, and the month shows where each piece goes', () => {
  const panel = readFileSync('src/components/modules/ContentPlan/SocialPublishingPanel.jsx', 'utf8');
  assert.match(panel, /socialPagesOf\(/);
  assert.match(panel, /pieceSocialPageIds\(/);
  assert.match(panel, /data-social-page-choice/);
  assert.match(panel, /type="checkbox"/, 'several accounts: a real multiple choice, not a single select');
  assert.match(panel, /onChangePages\(/);
  assert.match(panel, /row\.socialAccountId === account\.id/, 'a row belongs to an account, not to a network');
  const card = readFileSync('src/components/modules/ContentPlanDetail.jsx', 'utf8');
  assert.match(card, /api\/social\/items\/\$\{itemId\}\/pages/);
  assert.match(card, /accountIds/);
  assert.match(card, /pieceAccountLabel\(/);
  assert.match(card, /data-piece-account/);
  const widget = readFileSync('src/components/modules/SocialAccountsWidget.jsx', 'utf8');
  assert.match(widget, /socialPagesOf\(/);
  assert.match(widget, /Conectar otra página/);
  // Rodny, 2 October 2026: «ese botón está muy largo… solo deja el icono de +». With accounts already
  // connected the button is the plus alone; what it does is said to a screen reader and on hover.
  assert.match(widget, /aria-label=\{connectLabel\}/);
  assert.match(widget, /title=\{connectLabel\}/);
  assert.match(widget, /\{!accounts\.length && <span>Conectar página<\/span>\}/);
});
