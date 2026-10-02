import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaReportService } from '../src/services/metaReportService.js';
import { MetaGraphError } from '../src/services/metaGraphService.js';

// From where the figures of a client's report are brought (Rodny, 2 October 2026): the Instagram
// account the client already has connected for publishing, and an ad account chosen once per client.
// A fake database and a fake Meta; the keys never leave the server.

const NOW = new Date('2026-10-02T15:00:00.000Z');
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const fakeDb = (seed = {}) => {
  const state = {
    clients: seed.clients || [{ id: 'c1', name: 'Titanes' }, { id: 'c2', name: 'Otro' }],
    social: seed.social || [
      { id: 's-fb', clientId: 'c1', platform: 'FACEBOOK', externalId: 'p1', displayName: 'Titanes', pageId: 'p1', encryptedToken: 'enc:page-token', isActive: true, connectedAt: new Date('2026-10-01') },
      { id: 's-ig', clientId: 'c1', platform: 'INSTAGRAM', externalId: 'ig-1', displayName: '@titanes', pageId: 'p1', encryptedToken: 'enc:page-token', isActive: true, connectedAt: new Date('2026-10-01') },
      { id: 's-off', clientId: 'c1', platform: 'INSTAGRAM', externalId: 'ig-2', displayName: '@vieja', pageId: 'p2', encryptedToken: 'enc:old', isActive: false, connectedAt: new Date('2026-10-02') },
      { id: 's-other', clientId: 'c2', platform: 'INSTAGRAM', externalId: 'ig-9', displayName: '@otro', pageId: 'p9', encryptedToken: 'enc:other', isActive: true, connectedAt: new Date('2026-10-01') }
    ],
    ads: seed.ads || []
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  let counter = 0;
  return {
    state,
    client: { findUnique: async ({ where }) => state.clients.find((row) => row.id === where.id) || null },
    clientSocialAccount: {
      findMany: async ({ where }) => state.social.filter((row) => matches(row, where)),
      findUnique: async ({ where }) => state.social.find((row) => row.id === where.id) || null
    },
    clientAdAccount: {
      findMany: async ({ where }) => state.ads.filter((row) => matches(row, where)),
      findUnique: async ({ where }) => state.ads.find((row) => row.id === where.id) || null,
      findFirst: async ({ where }) => state.ads.find((row) => matches(row, where)) || null,
      create: async ({ data }) => { const row = { id: `ad-${++counter}`, isActive: true, ...data }; state.ads.push(row); return row; },
      update: async ({ where, data }) => { const row = state.ads.find((item) => item.id === where.id); Object.assign(row, data); return row; }
    }
  };
};

const fakeInsights = (overrides = {}) => {
  const calls = [];
  return {
    calls,
    listAdAccounts: async (token) => { calls.push(['listAdAccounts', token]); return [{ id: '123', name: 'Francisco Villa', currency: 'COP', isActive: true }, { id: '9', name: 'Vieja', currency: 'USD', isActive: false }]; },
    fetchInstagramReport: overrides.fetchInstagramReport || (async (input) => {
      calls.push(['instagram', input]);
      return { account: { id: input.igUserId, username: input.username }, period: input.period, fetchedAt: NOW.toISOString(), reachIsExact: true, totals: { views: 4489, reach: 886 }, previousTotals: null, previousPeriod: null, follows: null, followerTotal: 2231, formats: {}, media: [{ id: 'm1', caption: 'Reel', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-29T15:00:00+0000', insights: { views: 292, reach: 147 } }] };
    }),
    fetchAdsReport: overrides.fetchAdsReport || (async (input) => {
      calls.push(['ads', input]);
      return { account: { id: '123', name: 'Francisco Villa', currency: 'COP' }, campaignFilter: input.campaignFilter || null, period: input.period, fetchedAt: NOW.toISOString(), totals: { spend: '377045', impressions: '114028', reach: '57460' }, previousTotals: null, previousPeriod: null, campaigns: [{ campaign_id: 'c1', campaign_name: 'TITANES', spend: '377045', impressions: '114028' }], ads: [] };
    })
  };
};

const build = (seed, overrides) => {
  const db = fakeDb(seed);
  const insights = fakeInsights(overrides);
  let id = 0;
  const service = createMetaReportService({ db, insights, decrypt: (value) => value.replace(/^enc:/, ''), systemToken: () => 'user-token', now: () => NOW, newId: () => `id-${++id}` });
  return { db, insights, service };
};

test('what a client can bring from Meta: its live Instagram accounts and its ad accounts, without any key', async () => {
  const { service } = build({ ads: [{ id: 'ad-1', clientId: 'c1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: 'Titanes', isActive: true }, { id: 'ad-0', clientId: 'c1', adAccountId: '9', name: 'Vieja', currency: 'USD', campaignFilter: null, isActive: false }] });
  const sources = await service.listClientSources('c1');
  assert.equal(sources.configured, true);
  assert.deepEqual(sources.instagram, [{ id: 's-ig', displayName: '@titanes', pageId: 'p1' }], 'only Instagram, only what is connected, only of this client');
  assert.deepEqual(sources.adAccounts, [{ id: 'ad-1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: 'Titanes' }]);
  assert.equal(JSON.stringify(sources).includes('token'), false);
});

test('an ad account is linked once per client, with the words that tell its campaigns apart', async () => {
  const { db, service } = build();
  const linked = await service.linkAdAccount({ clientId: 'c1', adAccountId: 'act_123', campaignFilter: '  Titanes ', actorUserId: 'u1' });
  assert.deepEqual(linked, { id: 'ad-1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: 'Titanes' });
  assert.equal(db.state.ads[0].connectedById, 'u1');
  // Linking it again changes the filter; it does not add a second row.
  const again = await service.linkAdAccount({ clientId: 'c1', adAccountId: '123', campaignFilter: '', actorUserId: 'u1' });
  assert.equal(again.campaignFilter, null);
  assert.equal(db.state.ads.length, 1);
  await assert.rejects(service.linkAdAccount({ clientId: 'c1', adAccountId: '555', actorUserId: 'u1' }), (error) => error.status === 404 && /no ve esa cuenta publicitaria/.test(error.message));
  await assert.rejects(service.linkAdAccount({ clientId: 'nope', adAccountId: '123', actorUserId: 'u1' }), (error) => error.status === 404);
  await assert.rejects(service.linkAdAccount({ clientId: 'c1', adAccountId: '123', campaignFilter: 'x'.repeat(81), actorUserId: 'u1' }), (error) => error.status === 422);
  // Unlinking turns it off; nothing is deleted.
  await service.unlinkAdAccount({ id: 'ad-1' });
  assert.equal(db.state.ads[0].isActive, false);
  assert.deepEqual((await service.listClientSources('c1')).adAccounts, []);
  // And linking it back revives the same row.
  await service.linkAdAccount({ clientId: 'c1', adAccountId: '123', campaignFilter: 'Titanes', actorUserId: 'u2' });
  assert.equal(db.state.ads.length, 1);
  assert.equal(db.state.ads[0].isActive, true);
});

test('the figures come as report sources, each with the answer of Meta kept as its receipt', async () => {
  const { insights, service } = build({ ads: [{ id: 'ad-1', clientId: 'c1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: 'Titanes', isActive: true }] });
  const results = await service.fetchSources({ clientId: 'c1', period: PERIOD, instagramAccountId: 's-ig', adAccountLinkId: 'ad-1' });
  assert.equal(results.length, 2);
  const [instagram, ads] = results;
  assert.equal(instagram.kind, 'INSTAGRAM');
  assert.equal(instagram.label, 'Instagram @titanes · cifras de Meta');
  assert.deepEqual(instagram.sources.map((source) => source.screenType), ['META_API_INSTAGRAM_ACCOUNT', 'META_API_INSTAGRAM_CONTENT']);
  assert.equal(new Set(instagram.sources.map((source) => source.sourceId)).size, 2, 'each source has its own identity');
  assert.equal(instagram.raw.provider, 'META_GRAPH_API');
  assert.equal(instagram.raw.response.totals.views, 4489);
  assert.equal(ads.kind, 'ADS');
  assert.equal(ads.sources.length, 1);
  assert.equal(ads.sources[0].campaignFilter, 'Titanes');
  // Instagram is read with the page's own key; the ad account with the agency's.
  const call = (name) => insights.calls.find(([kind]) => kind === name)[1];
  assert.deepEqual({ igUserId: call('instagram').igUserId, username: call('instagram').username, token: call('instagram').token }, { igUserId: 'ig-1', username: 'titanes', token: 'page-token' });
  assert.deepEqual({ adAccountId: call('ads').adAccountId, token: call('ads').token, campaignFilter: call('ads').campaignFilter }, { adAccountId: '123', token: 'user-token', campaignFilter: 'Titanes' });
  // No key in what is kept.
  assert.equal(/page-token|user-token|enc:/.test(JSON.stringify(results)), false);
});

test('an account of another client is never read, and a disconnected one says so', async () => {
  const { insights, service } = build({ ads: [{ id: 'ad-9', clientId: 'c2', adAccountId: '123', name: 'X', currency: 'COP', campaignFilter: null, isActive: true }] });
  await assert.rejects(service.fetchSources({ clientId: 'c1', period: PERIOD, instagramAccountId: 's-other' }), (error) => error.status === 422);
  await assert.rejects(service.fetchSources({ clientId: 'c1', period: PERIOD, adAccountLinkId: 'ad-9' }), (error) => error.status === 422);
  await assert.rejects(service.fetchSources({ clientId: 'c1', period: PERIOD, instagramAccountId: 's-fb' }), (error) => error.status === 422, 'a Facebook page is not an Instagram account');
  assert.equal(insights.calls.length, 0);
  const [off] = await service.fetchSources({ clientId: 'c1', period: PERIOD, instagramAccountId: 's-off' });
  assert.match(off.error, /desconectada/);
  assert.equal(insights.calls.length, 0);
});

test('when Meta refuses, the reason is said in plain words and the other source still comes', async () => {
  const { service } = build({ ads: [{ id: 'ad-1', clientId: 'c1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: null, isActive: true }] }, {
    fetchInstagramReport: async () => { throw new MetaGraphError('Error validating access token', { status: 400, code: 190 }); }
  });
  const [instagram, ads] = await service.fetchSources({ clientId: 'c1', period: PERIOD, instagramAccountId: 's-ig', adAccountLinkId: 'ad-1' });
  assert.match(instagram.error, /venció/);
  assert.equal(instagram.sources, undefined);
  assert.equal(ads.sources.length, 1);
});

test('an ad account that did not invest in the period is a note, not a failure and not a row of zeros', async () => {
  const { service } = build({ ads: [{ id: 'ad-1', clientId: 'c1', adAccountId: '123', name: 'Francisco Villa', currency: 'COP', campaignFilter: 'Endova', isActive: true }] }, {
    fetchAdsReport: async (input) => ({ account: { id: '123', name: 'Francisco Villa', currency: 'COP' }, campaignFilter: 'Endova', period: input.period, fetchedAt: NOW.toISOString(), totals: null, previousTotals: null, previousPeriod: null, campaigns: [], ads: [] })
  });
  const [ads] = await service.fetchSources({ clientId: 'c1', period: PERIOD, adAccountLinkId: 'ad-1' });
  assert.equal(ads.sources, undefined);
  assert.equal(ads.error, undefined);
  assert.match(ads.note, /«Francisco Villa»/);
  assert.match(ads.note, /«Endova»/);
});

test('without the key of the agency nothing is asked of Meta and the reason is said', async () => {
  const db = fakeDb();
  const service = createMetaReportService({ db, insights: fakeInsights(), decrypt: (value) => value, systemToken: () => '', now: () => NOW });
  assert.equal((await service.listClientSources('c1')).configured, false);
  await assert.rejects(service.listAvailableAdAccounts(), (error) => error.status === 503 && error.code === 'META_NOT_CONFIGURED');
});
