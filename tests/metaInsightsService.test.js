import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaInsightsService } from '../src/services/metaInsightsService.js';

// What is asked of Meta to fill a report, with a fake network. The shapes are the real ones
// (agency's own account, 2 October 2026). The key travels in a header, never in the address.

const NOW = new Date('2026-10-02T15:00:00.000Z');
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, error) => ({ ok: false, status, json: async () => ({ error }) });
const totalValue = (values) => ({ data: Object.entries(values).map(([name, value]) => ({ name, period: 'day', total_value: { value } })) });
const breakdown = (name, parts) => ({ data: [{ name, total_value: { breakdowns: [{ dimension_keys: ['x'], results: Object.entries(parts).map(([key, value]) => ({ dimension_values: [key], value })) }] } }] });

const fakeMeta = (handler) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname.replace(/^\/v[\d.]+\//, ''), query: Object.fromEntries(parsed.searchParams), headers: options.headers || {} });
    return handler(calls.at(-1));
  };
  return { calls, service: createMetaInsightsService({ fetchImpl, now: () => NOW }) };
};

const instagramHandler = ({ path, query }) => {
  if (path === 'ig-1') return ok({ followers_count: 2231 });
  if (path === 'ig-1/media') return ok({ data: [
    { id: 'm1', caption: 'Reel', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-29T15:00:00+0000', permalink: 'https://www.instagram.com/reel/1/' },
    { id: 'm2', caption: 'Post', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-09-22T15:00:00+0000', permalink: 'https://www.instagram.com/p/2/' }
  ] });
  if (path === 'm1/insights') return ok({ data: [{ name: 'reach', values: [{ value: 147 }] }, { name: 'views', values: [{ value: 292 }] }] });
  if (path === 'm2/insights') return fail(400, { code: 100, message: 'media posted before the account became professional' });
  if (path === 'ig-1/insights' && query.breakdown === 'follow_type') return ok(breakdown('follows_and_unfollows', { FOLLOWER: 11, NON_FOLLOWER: 12 }));
  if (path === 'ig-1/insights' && query.breakdown === 'media_product_type') return ok(breakdown(query.metric, { REEL: 100, POST: 50 }));
  if (path === 'ig-1/insights') {
    const metrics = query.metric.split(',');
    return ok(totalValue(Object.fromEntries(metrics.map((metric) => [metric, metric === 'reach' ? 886 : 10]))));
  }
  return fail(404, { code: 803, message: `unexpected ${path}` });
};

test('a 30-day month is asked for in one request, reach included, and the key never travels in the address', async () => {
  const { calls, service } = fakeMeta(instagramHandler);
  const report = await service.fetchInstagramReport({ igUserId: 'ig-1', username: 'brainstudioagencia', token: 'page-token', period: { start: '2026-09-01', end: '2026-09-30' } });
  assert.equal(report.reachIsExact, true);
  assert.equal(report.totals.reach, 886);
  assert.equal(report.totals.views, 10);
  assert.equal(report.followerTotal, 2231);
  assert.deepEqual(report.follows, { FOLLOWER: 11, NON_FOLLOWER: 12 });
  assert.deepEqual(report.formats.views, { REEL: 100, POST: 50 });
  assert.deepEqual(report.formats.reach, { REEL: 100, POST: 50 });
  assert.deepEqual(report.previousPeriod, { start: '2026-08-02', end: '2026-08-31' });
  assert.equal(report.previousTotals.views, 10);
  assert.equal(report.fetchedAt, NOW.toISOString());
  assert.equal(report.media.length, 2);
  assert.deepEqual(report.media[0].insights, { reach: 147, views: 292 });
  assert.equal(report.media[1].insights, null, 'a publication Meta gives no figures for stays without figures; the rest is not lost');
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer page-token');
    assert.equal('access_token' in call.query, false);
  }
  const totals = calls.find((call) => call.path === 'ig-1/insights' && !call.query.breakdown);
  assert.equal(totals.query.metric_type, 'total_value');
  assert.equal(totals.query.period, 'day');
  assert.ok(Number(totals.query.until) - Number(totals.query.since) <= 2592000);
});

test('a 31-day month is asked for in two windows: what adds up is added, and reach is not asked for at all', async () => {
  const { calls, service } = fakeMeta(instagramHandler);
  const report = await service.fetchInstagramReport({ igUserId: 'ig-1', username: 'x', token: 't', period: { start: '2026-10-01', end: '2026-10-31' } });
  assert.equal(report.reachIsExact, false);
  assert.equal(report.totals.views, 20, 'two windows of 10');
  assert.equal(report.totals.reach, undefined);
  assert.equal(report.totals.accounts_engaged, undefined);
  assert.deepEqual(report.follows, { FOLLOWER: 22, NON_FOLLOWER: 24 });
  assert.deepEqual(report.formats.views, { REEL: 200, POST: 100 });
  assert.equal(report.formats.reach, undefined);
  const asked = calls.filter((call) => call.path === 'ig-1/insights').map((call) => call.query.metric);
  assert.equal(asked.some((metric) => /(^|,)reach(,|$)/.test(metric) || /accounts_engaged/.test(metric)), false, 'never a number that would count the same person twice');
});

test('if Meta refuses the account figures, the report says why instead of arriving half empty', async () => {
  const { service } = fakeMeta(({ path }) => (path === 'ig-1/insights' ? fail(400, { code: 190, message: 'Error validating access token' }) : ok({ data: [] })));
  await assert.rejects(service.fetchInstagramReport({ igUserId: 'ig-1', username: 'x', token: 't', period: { start: '2026-09-01', end: '2026-09-30' } }), (error) => error.code === 190);
});

test('followers gained are not given for small accounts: the rest of the report still comes', async () => {
  const { service } = fakeMeta((call) => (call.query.breakdown === 'follow_type' ? fail(400, { code: 100, message: 'not available' }) : instagramHandler(call)));
  const report = await service.fetchInstagramReport({ igUserId: 'ig-1', username: 'x', token: 't', period: { start: '2026-09-01', end: '2026-09-30' } });
  assert.equal(report.follows, null);
  assert.equal(report.totals.views, 10);
});

// Facebook (2 October 2026). Daily values of a page come one per day, stamped with the END of the day.
const dailyValues = (first, days, value) => Array.from({ length: days }, (_, index) => ({ value: typeof value === 'function' ? value(index) : value, end_time: new Date(Date.parse(`${first}T07:00:00Z`) + (index + 1) * 86400000).toISOString().replace('.000Z', '+0000') }));
const facebookHandler = ({ path, query }) => {
  if (path === 'page-1' && query.fields === 'access_token') return ok({ access_token: 'fresh-page-token', id: 'page-1' });
  if (path === 'page-1/insights' && query.period === 'total_over_range') {
    // Seen on 2 October 2026: `until` is exclusive here, and the answer is one value stamped with the end.
    return ok({ data: [{ name: 'page_total_media_view_unique', period: 'total_over_range', values: [{ value: query.until === '2026-10-01' ? 642 : 500, end_time: `${query.until}T07:00:00+0000` }] }] });
  }
  if (path === 'page-1/insights') {
    // Meta answers with one more day than the period (the margin asked for): it must not be counted.
    const days = Math.round((Date.parse(query.until) - Date.parse(query.since)) / 86400000);
    return ok({ data: query.metric.split(',').map((name) => ({ name, period: 'day', values: dailyValues(query.since, days, name === 'page_follows' ? (index) => 300 + index : name === 'page_media_view' ? 10 : 1) })) });
  }
  if (path === 'page-1/published_posts') return ok({ data: [
    { id: 'page-1_2', message: 'Video', created_time: '2026-09-29T22:42:48+0000', permalink_url: 'https://www.facebook.com/p/2', status_type: 'added_video', reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } },
    { id: 'page-1_1', message: 'Foto', created_time: '2026-09-09T17:51:33+0000', permalink_url: 'https://www.facebook.com/p/1', status_type: 'added_photos', shares: { count: 3 }, reactions: { summary: { total_count: 4 } }, comments: { summary: { total_count: 2 } } }
  ] });
  // Seen on 2 October 2026: Meta returns `post_total_media_view_unique` twice, accumulated and by day with zeros.
  if (path === 'page-1_2/insights') return ok({ data: [{ name: 'post_media_view', period: 'lifetime', values: [{ value: 240 }] }, { name: 'post_total_media_view_unique', period: 'lifetime', values: [{ value: 180 }] }, { name: 'post_clicks', period: 'lifetime', values: [{ value: 0 }] }, { name: 'post_total_media_view_unique', period: 'day', values: [{ value: 0, end_time: '2026-09-29T07:00:00+0000' }, { value: 0, end_time: '2026-09-30T07:00:00+0000' }] }] });
  if (path === 'page-1_1/insights') return ok({ data: [] });
  return fail(404, { code: 803, message: `unexpected ${path}` });
};

test('a page is asked day by day and only the days of the period count; followers are those of its last day', async () => {
  const { calls, service } = fakeMeta(facebookHandler);
  const report = await service.fetchFacebookPageReport({ pageId: 'page-1', pageName: 'Brain Studio', token: 'page-token', period: { start: '2026-09-01', end: '2026-09-30' } });
  assert.deepEqual(report.account, { id: 'page-1', name: 'Brain Studio' });
  assert.equal(report.totals.page_media_view, 300, '30 days of 10, not the 31 Meta sent');
  assert.equal(report.totals.page_post_engagements, 30);
  assert.equal(report.totals.page_follows, undefined, 'a running total is never added up');
  assert.equal(report.followerTotal, 329);
  assert.equal(report.followerDay, '2026-09-30');
  assert.deepEqual(report.previousPeriod, { start: '2026-08-02', end: '2026-08-31' });
  assert.equal(report.previousTotals.page_media_view, 300);
  assert.equal(report.posts.length, 2);
  assert.deepEqual(report.posts[0].insights, { post_media_view: 240, post_total_media_view_unique: 180, post_clicks: 0 }, 'the accumulated figure, never the daily zero that came after it');
  assert.equal(report.uniqueViewers, 642, 'people, for the exact period');
  assert.equal(report.previousUniqueViewers, 500);
  const viewers = calls.find((call) => call.path === 'page-1/insights' && call.query.period === 'total_over_range');
  assert.deepEqual({ since: viewers.query.since, until: viewers.query.until }, { since: '2026-09-01', until: '2026-10-01' }, 'until is exclusive: the day after the last one');
  assert.equal(report.posts[1].insights, null);
  assert.equal(report.posts[1].shares.count, 3);
  const page = calls.find((call) => call.path === 'page-1/insights');
  assert.deepEqual({ period: page.query.period, since: page.query.since, until: page.query.until }, { period: 'day', since: '2026-09-01', until: '2026-10-02' });
  assert.doesNotMatch(page.query.metric, /impressions|page_fans/, 'the metrics Meta retired are not asked for');
  for (const call of calls) { assert.equal(call.headers.Authorization, 'Bearer page-token'); assert.equal('access_token' in call.query, false); }
});

test('a quarter of 92 days is asked in two stretches and added up', async () => {
  const { calls, service } = fakeMeta(facebookHandler);
  const report = await service.fetchFacebookPageReport({ pageId: 'page-1', pageName: 'x', token: 't', period: { start: '2026-07-01', end: '2026-09-30' } });
  assert.equal(report.totals.page_media_view, 920);
  assert.equal(calls.filter((call) => call.path === 'page-1/insights' && call.query.period === 'day' && call.query.since >= '2026-07-01').length, 2);
});

test('a page that gives no figure at all says why instead of a report of zeros', async () => {
  const { service } = fakeMeta((call) => (call.path === 'page-1/insights' ? ok({ data: [] }) : facebookHandler(call)));
  await assert.rejects(service.fetchFacebookPageReport({ pageId: 'page-1', pageName: 'x', token: 't', period: { start: '2026-09-01', end: '2026-09-30' } }),
    (error) => error.code === 'META_PAGE_INSIGHTS_EMPTY' && /read_insights/.test(error.message) && /100/.test(error.message));
});

test('the key of the page is asked of Meta fresh, so it carries the permissions the agency key has today', async () => {
  const { calls, service } = fakeMeta(facebookHandler);
  assert.equal(await service.getPageToken({ pageId: 'page-1', token: 'user-token' }), 'fresh-page-token');
  assert.equal(calls[0].headers.Authorization, 'Bearer user-token');
  const { service: none } = fakeMeta(() => ok({ id: 'page-1' }));
  await assert.rejects(none.getPageToken({ pageId: 'page-1', token: 'user-token' }), (error) => error.status === 422);
});

const adsHandler = ({ path, query }) => {
  if (path === 'act_123') return ok({ name: 'Brain Studio Agencia', account_id: '123', currency: 'COP' });
  if (path === 'act_123/insights') {
    const range = JSON.parse(query.time_range);
    if (query.filtering && query.level === 'account') return ok({ data: [{ spend: '377045', impressions: '114028', reach: '57460', clicks: '3105' }] });
    if (query.level === 'account') return ok({ data: range.since === '2026-09-01' ? [{ spend: '703850', impressions: '140030', reach: '66982', clicks: '4221' }] : [] });
    if (query.level === 'campaign') return ok({ data: range.since === '2026-09-01' ? [
      { campaign_id: 'c1', campaign_name: 'TITANES - SEPTIEMBRE 2026', spend: '350000', impressions: '99852', reach: '50305' },
      { campaign_id: 'c2', campaign_name: 'Pauta Titánes interacción', spend: '27045', impressions: '14176', reach: '12485' },
      { campaign_id: 'c3', campaign_name: 'NEW PUEBLITO SEPTIEMBRE 2026', spend: '249962', impressions: '20164', reach: '8352' }
    ] : [] });
    if (query.level === 'ad') return ok({ data: [{ ad_id: 'a1', ad_name: 'Reel', spend: '26722', impressions: '14093' }] });
  }
  if (path === 'me/adaccounts') return ok({ data: [{ name: 'Brain Studio Agencia', account_id: '123', currency: 'COP', account_status: 1 }, { name: 'Vieja', account_id: '9', currency: 'USD', account_status: 101 }] });
  return fail(404, { code: 803, message: `unexpected ${path}` });
};

test('the ad account is asked for its totals, its campaigns and its ads for the exact days of the period', async () => {
  const { calls, service } = fakeMeta(adsHandler);
  const report = await service.fetchAdsReport({ adAccountId: '123', token: 'user-token', period: { start: '2026-09-01', end: '2026-09-30' } });
  assert.deepEqual(report.account, { id: '123', name: 'Brain Studio Agencia', currency: 'COP' });
  assert.equal(report.totals.spend, '703850');
  assert.equal(report.previousTotals, null, 'no investment the month before: no comparison');
  assert.equal(report.campaigns.length, 3);
  assert.equal(report.campaignFilter, null);
  assert.equal(report.ads.length, 1);
  const account = calls.find((call) => call.path === 'act_123/insights' && call.query.level === 'account');
  assert.deepEqual(JSON.parse(account.query.time_range), { since: '2026-09-01', until: '2026-09-30' });
  assert.match(account.query.fields, /spend/);
  for (const call of calls) assert.equal(call.headers.Authorization, 'Bearer user-token');
  // `act_123` and `123` are the same account.
  const again = await service.fetchAdsReport({ adAccountId: 'act_123', token: 'user-token', period: { start: '2026-09-01', end: '2026-09-30' } });
  assert.equal(again.account.id, '123');
});

// Seen on the agency's own ad account, September 2026: campaigns of Titanes, New Pueblito and Pablo
// Hoff side by side. An ad account is not a client.
test('one ad account carries several clients: only the campaigns named for this client count, and Meta does the adding', async () => {
  const { calls, service } = fakeMeta(adsHandler);
  const report = await service.fetchAdsReport({ adAccountId: '123', token: 'user-token', period: { start: '2026-09-01', end: '2026-09-30' }, campaignFilter: ' titanes ' });
  assert.deepEqual(report.campaigns.map((row) => row.campaign_id), ['c1', 'c2'], 'accents and capitals do not matter');
  assert.equal(report.campaignFilter, 'titanes');
  assert.equal(report.totals.spend, '377045');
  assert.equal(report.totals.reach, '57460', 'the reach Meta computed for those campaigns, not 50305 + 12485');
  const total = calls.find((call) => call.path === 'act_123/insights' && call.query.level === 'account' && JSON.parse(call.query.time_range).since === '2026-09-01');
  assert.deepEqual(JSON.parse(total.query.filtering), [{ field: 'campaign.id', operator: 'IN', value: ['c1', 'c2'] }]);
  const ads = calls.find((call) => call.path === 'act_123/insights' && call.query.level === 'ad');
  assert.deepEqual(JSON.parse(ads.query.filtering)[0].value, ['c1', 'c2'], 'and only their ads');
  assert.equal(report.previousTotals, null, 'no campaign of this client the month before: nothing to compare with');

  // No campaign carries that name: there is no investment of this client, not the whole account's.
  const none = await service.fetchAdsReport({ adAccountId: '123', token: 'user-token', period: { start: '2026-09-01', end: '2026-09-30' }, campaignFilter: 'Endova' });
  assert.equal(none.totals, null);
  assert.deepEqual(none.campaigns, []);
  assert.deepEqual(none.ads, []);
});

test('the ad accounts the key can see are listed without anything that is not needed', async () => {
  const { service } = fakeMeta(adsHandler);
  assert.deepEqual(await service.listAdAccounts('user-token'), [
    { id: '123', name: 'Brain Studio Agencia', currency: 'COP', isActive: true },
    { id: '9', name: 'Vieja', currency: 'USD', isActive: false }
  ]);
});
