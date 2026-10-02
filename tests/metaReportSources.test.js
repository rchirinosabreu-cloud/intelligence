import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { buildReportPresentation } from '../src/lib/reportPresentationModel.js';
import {
  META_INSIGHTS_MAX_WINDOW_SECONDS, buildInstagramSources, buildMetaAdsSource, changePct, insightWindows, previousPeriod
} from '../src/lib/metaReportSources.js';

// Rodny, 2 October 2026: the report module read its figures from screenshots with AI vision, and a
// person had to check every number. «¿No podríamos hacer eso consultando directamente el Meta
// Business del cliente y obteniendo de allí las cifras?» Yes for Instagram and for ads, which the
// agency's key already reads. The figures enter the report as one more source, exact and with their
// origin, and follow the same path as before; uploading screenshots stays.
//
// The shapes below are the ones Meta returned for the agency's own account in September 2026.

const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
const FETCHED_AT = '2026-10-02T15:00:00.000Z';
const account = { id: 'ig-1', username: 'brainstudioagencia' };

const instagram = {
  account,
  period: PERIOD,
  fetchedAt: FETCHED_AT,
  reachIsExact: true,
  totals: { views: 4489, reach: 886, accounts_engaged: 93, total_interactions: 222, likes: 186, comments: 4, shares: 10, saves: 3, profile_views: 144, website_clicks: 4 },
  previousTotals: { views: 3000, reach: 800, total_interactions: 0 },
  previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
  follows: { FOLLOWER: 11, NON_FOLLOWER: 12 },
  followerTotal: 2231,
  formats: {
    views: { AD: 1, IGTV: 3, STORY: 836, CAROUSEL_CONTAINER: 2009, REEL: 1343, POST: 297 },
    reach: { STORY: 231, POST: 175, CAROUSEL_CONTAINER: 470, REEL: 485 },
    total_interactions: { STORY: 9, POST: 144, REEL: 69 }
  },
  media: [
    { id: 'm1', caption: 'El problema no siempre es tu logo.\nSegunda línea', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-29T15:00:00+0000', permalink: 'https://www.instagram.com/reel/1/', insights: { reach: 147, views: 292, saved: 0, shares: 1, total_interactions: 25 } },
    { id: 'm2', caption: '', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-09-22T15:00:00+0000', permalink: 'https://www.instagram.com/p/2/', insights: { reach: 63, views: 131, saved: 0, shares: 1, total_interactions: 13 } },
    { id: 'm3', caption: 'Workshop Brain', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', timestamp: '2026-09-09T15:00:00+0000', permalink: 'https://www.instagram.com/p/3/', insights: null }
  ]
};

test('Meta answers at most 30 days per request: longer periods are cut into consecutive windows', () => {
  assert.equal(META_INSIGHTS_MAX_WINDOW_SECONDS, 2592000);
  const september = insightWindows('2026-09-01', '2026-09-30');
  assert.equal(september.length, 1, 'a 30-day month fits in one request');
  assert.equal(new Date(september[0].since * 1000).toISOString(), '2026-09-01T05:00:00.000Z', 'the day starts at midnight in Bogotá');
  const october = insightWindows('2026-10-01', '2026-10-31');
  assert.equal(october.length, 2, 'a 31-day month does not: Meta refuses 31 days');
  const quarter = insightWindows('2026-07-01', '2026-09-30');
  assert.equal(quarter.length, 4);
  for (const windows of [september, october, quarter]) {
    for (const [index, window] of windows.entries()) {
      assert.ok(window.until - window.since <= META_INSIGHTS_MAX_WINDOW_SECONDS);
      if (index) assert.equal(window.since, windows[index - 1].until + 1, 'no day is skipped and none is counted twice');
    }
  }
  assert.deepEqual(insightWindows('2026-09-30', '2026-09-01'), []);
});

test('the period before is the same number of days, right before', () => {
  assert.deepEqual(previousPeriod(PERIOD), { start: '2026-08-02', end: '2026-08-31' });
  assert.deepEqual(previousPeriod({ start: '2026-10-01', end: '2026-10-31' }), { start: '2026-08-31', end: '2026-09-30' });
  assert.equal(changePct(4489, 3000), 49.6);
  assert.equal(changePct(90, 100), -10);
  assert.equal(changePct(10, 0), null, 'no growth figure out of a zero');
  assert.equal(changePct(10, undefined), null);
});

test('the figures of Instagram enter the report as sources: exact, with their period and their origin', () => {
  const sources = buildInstagramSources(instagram);
  assert.equal(sources.length, 2, 'the account and its publications');
  for (const source of sources) {
    assert.equal(source.origin, 'META_API');
    assert.equal(source.platform, 'INSTAGRAM');
    assert.equal(source.confidence, 1);
    assert.match(source.originalName, /@brainstudioagencia/);
  }
  const evidence = buildEvidenceReport(sources, { reportPeriod: PERIOD, currency: 'COP' });
  assert.deepEqual(evidence.issues.filter((issue) => issue.blocking), [], 'nothing for a person to untangle');
  assert.equal(evidence.readyForNarrative, true);
  const fact = (key, extra = {}) => evidence.facts.find((item) => item.key === key && Object.entries(extra).every(([field, value]) => item[field] === value));
  assert.equal(fact('views', { entityLevel: 'ACCOUNT' }).value, 4489);
  assert.equal(fact('views', { entityLevel: 'ACCOUNT' }).changePct, 49.6);
  assert.equal(fact('reach', { entityLevel: 'ACCOUNT' }).value, 886);
  assert.equal(fact('interactions', { entityLevel: 'ACCOUNT' }).value, 222);
  assert.equal(fact('interactions', { entityLevel: 'ACCOUNT' }).changePct, null, 'the month before had none: no percentage is invented');
  assert.equal(fact('profileVisits').value, 144);
  assert.equal(fact('follows').value, 11);
  assert.equal(fact('followerTotal').value, 2231);
  assert.equal(fact('contentCount', { entityLevel: 'ACCOUNT' }).value, 3);
  assert.equal(fact('views', { entityLevel: 'FORMAT', entityName: 'Carruseles' }).value, 2009);
  assert.equal(fact('contentCount', { entityLevel: 'FORMAT', entityName: 'Reels' }).value, 1);
  assert.equal(fact('views', { entityLevel: 'CONTENT', entityId: 'm1' }).value, 292);
  assert.equal(evidence.facts.some((item) => item.entityId === 'm3' && item.key === 'views'), false, 'a publication without figures gets none invented');
  for (const item of evidence.observations) {
    assert.equal(item.precision, 'EXACT');
    assert.deepEqual(item.period, PERIOD);
    assert.match(item.evidence, /Meta/);
  }
  // Every figure says where it came from and when it was asked for.
  assert.match(evidence.observations[0].evidence, /2 de octubre de 2026/);
  const followers = evidence.observations.find((item) => item.key === 'followerTotal');
  assert.match(followers.evidence, /al momento de la consulta/, 'the follower count is today\'s, not the period\'s');
});

test('reach is a count of different people: over more than 30 days Meta cannot give it, and it is left out saying so', () => {
  const sources = buildInstagramSources({ ...instagram, period: { start: '2026-10-01', end: '2026-10-31' }, reachIsExact: false, totals: { ...instagram.totals, reach: undefined, accounts_engaged: undefined }, formats: { views: instagram.formats.views }, media: [] });
  const evidence = buildEvidenceReport(sources, { reportPeriod: { start: '2026-10-01', end: '2026-10-31' }, currency: 'COP' });
  assert.equal(evidence.facts.some((item) => item.key === 'reach'), false, 'never a sum of two windows passed off as reach');
  assert.equal(evidence.facts.find((item) => item.key === 'views' && item.entityLevel === 'ACCOUNT').value, 4489);
  assert.ok(sources[0].warnings.some((warning) => /alcance/i.test(warning) && /30 días/.test(warning)));
});

test('the presentation shows the summary, the formats and the publications of Instagram', () => {
  const evidence = buildEvidenceReport(buildInstagramSources(instagram), { reportPeriod: PERIOD, currency: 'COP' });
  const { sections } = buildReportPresentation({ normalizedMetrics: evidence });
  const titles = sections.map((section) => section.title);
  assert.ok(titles.includes('Resumen de Instagram'));
  assert.ok(titles.includes('Rendimiento por formato · Instagram'));
  assert.ok(titles.includes('Volumen publicado · Instagram'));
  assert.ok(titles.includes('Publicaciones del período · Instagram'));
  const posts = sections.find((section) => section.title === 'Publicaciones del período · Instagram');
  assert.equal(posts.rows.length, 2);
  assert.match(posts.rows.map((row) => row.label).join(' | '), /29 sept · Reel · El problema no siempre es tu logo\./);
});

// Seen with the agency's real figures: «15 sept» sorted before «8 sept», the format table carried rows
// of «AD: 1» and «IGTV», and two columns were headed `saves` and `shares`.
test('what a person reads: publications by date, no leftover surfaces, no technical names', () => {
  const post = (id, day) => ({ id, caption: `Pieza ${id}`, media_type: 'IMAGE', media_product_type: 'FEED', timestamp: `2026-09-${day}T15:00:00+0000`, insights: { views: 10, reach: 5, saved: 1, shares: 2 } });
  const sources = buildInstagramSources({ ...instagram, formats: { views: { REEL: 100, AD: 1, IGTV: 3 } }, media: [post('a', '15'), post('b', '08'), post('c', '29')] });
  const evidence = buildEvidenceReport(sources, { reportPeriod: PERIOD, currency: 'COP' });
  const { sections } = buildReportPresentation({ normalizedMetrics: evidence });
  const posts = sections.find((section) => section.entityLevel === 'CONTENT');
  assert.deepEqual(posts.rows.map((row) => row.label.split(' · ')[0]), ['8 sept', '15 sept', '29 sept']);
  assert.deepEqual(posts.columns.map((column) => column.label), ['Visualizaciones', 'Alcance', 'Guardados', 'Compartidos']);
  const formats = sections.find((section) => section.title === 'Rendimiento por formato · Instagram');
  assert.deepEqual(formats.rows.map((row) => row.label), ['Reels']);
  const summary = sections.find((section) => section.title === 'Resumen de Instagram');
  for (const row of summary.rows) assert.doesNotMatch(row.label, /^[a-z]+[A-Z]|^(saves|shares|likes|comments)\b/, row.label);
});

test('the advertising summary opens with what was invested, not with «CPC»', () => {
  const evidence = buildEvidenceReport([buildMetaAdsSource(ads)], { reportPeriod: PERIOD, currency: 'COP' });
  const summary = buildReportPresentation({ normalizedMetrics: evidence }).sections.find((section) => section.kind === 'metrics' && section.platform === 'META_ADS');
  assert.deepEqual(summary.rows.map((row) => row.metricKey), ['spend', 'impressions', 'reach', 'clicks', 'linkClicks', 'ctr', 'cpc', 'cpm']);
});

const ads = {
  account: { id: '123', name: 'Brain Studio Agencia', currency: 'COP' },
  period: PERIOD,
  fetchedAt: FETCHED_AT,
  totals: { spend: '703850', impressions: '140030', reach: '66982', clicks: '4221', inline_link_clicks: '1321', ctr: '3.014354', cpc: '166.749585', cpm: '5026.422909' },
  previousTotals: { spend: '500000', impressions: '100000' },
  previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
  campaigns: [
    { campaign_id: 'c1', campaign_name: 'Ventas septiembre', spend: '350000', impressions: '90000', reach: '50305', clicks: '2000' },
    { campaign_id: 'c2', campaign_name: 'Sin inversión', spend: '0', impressions: '0', reach: '0', clicks: '0' }
  ],
  ads: [
    { ad_id: 'a1', ad_name: 'Reel workshop', spend: '26722', impressions: '14093', reach: '12445', clicks: '300' },
    { ad_id: 'a2', ad_name: 'Reel workshop', spend: '1000', impressions: '500', reach: '400', clicks: '10' }
  ]
};

test('the figures of the ad account enter as paid results in the account\'s own currency', () => {
  const source = buildMetaAdsSource(ads);
  assert.equal(source.platform, 'META_ADS');
  assert.equal(source.origin, 'META_API');
  const evidence = buildEvidenceReport([source], { reportPeriod: PERIOD, currency: 'COP' });
  assert.deepEqual(evidence.issues.filter((issue) => issue.blocking), []);
  const fact = (key, level = 'ACCOUNT', extra = {}) => evidence.facts.find((item) => item.key === key && item.entityLevel === level && Object.entries(extra).every(([field, value]) => item[field] === value));
  assert.equal(fact('spend').value, 703850);
  assert.equal(fact('spend').unit, 'COP');
  assert.equal(fact('spend').changePct, 40.8);
  assert.equal(fact('spend').scope, 'PAID');
  assert.equal(fact('impressions').value, 140030);
  assert.equal(fact('reach').value, 66982);
  assert.equal(fact('clicks').value, 4221);
  assert.equal(fact('linkClicks').value, 1321);
  assert.equal(fact('ctr').unit, '%');
  assert.equal(fact('ctr').value, 3.01);
  assert.equal(fact('cpc').value, 166.75);
  assert.equal(fact('spend', 'CAMPAIGN', { entityId: 'c1' }).value, 350000);
  assert.equal(evidence.facts.some((item) => item.entityId === 'c2'), false, 'a campaign that spent nothing and showed nothing is not a row');
  // Two ads with the same name are two ads: the identity is the id, never the name.
  assert.equal(fact('spend', 'AD', { entityId: 'a1' }).value, 26722);
  assert.equal(fact('spend', 'AD', { entityId: 'a2' }).value, 1000);

  // A dollar account in a peso report keeps its dollars: nothing is converted or relabelled.
  const usd = buildEvidenceReport([buildMetaAdsSource({ ...ads, account: { ...ads.account, currency: 'USD' } })], { reportPeriod: PERIOD, currency: 'COP' });
  assert.equal(usd.facts.find((item) => item.key === 'spend' && item.entityLevel === 'ACCOUNT').unit, 'USD');
  assert.deepEqual(usd.issues.filter((issue) => issue.blocking), []);
});

test('an account that did not advertise in the period yields no source instead of a row of zeros', () => {
  assert.equal(buildMetaAdsSource({ ...ads, totals: null, campaigns: [], ads: [] }), null);
});
