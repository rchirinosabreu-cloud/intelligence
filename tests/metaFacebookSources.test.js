import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { buildReportPresentation } from '../src/lib/reportPresentationModel.js';
import { FACEBOOK_VIEWERS_NOTE, META_PAGE_WINDOW_DAYS, buildFacebookSources, pageInsightWindows, pageTotalRange, pageValueDay } from '../src/lib/metaReportSources.js';

// Rodny, 2 October 2026: «ahora añadamos las cifras de Facebook». The page of a client enters the
// report as one more source of Meta. Metric names read in the Page Insights reference (v26): the page
// «impressions» are gone, what remains is `page_media_view`. The shape of a post is the one Meta
// returned for the agency's own page.

const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
const FETCHED_AT = '2026-10-02T15:00:00.000Z';

const page = {
  account: { id: '1709806785944931', name: 'Brain Studio' },
  period: PERIOD,
  fetchedAt: FETCHED_AT,
  totals: { page_media_view: 5120, page_post_engagements: 96, page_video_views: 410, page_views_total: 133, page_total_actions: 7, page_daily_follows_unique: 9, page_daily_unfollows_unique: 2 },
  previousTotals: { page_media_view: 4000, page_post_engagements: 0 },
  previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
  followerTotal: 363,
  followerDay: '2026-09-30',
  uniqueViewers: 642,
  previousUniqueViewers: 500,
  posts: [
    { id: 'p_2', message: 'Hay relaciones que empiezan con un proyecto.\nY siguen.', created_time: '2026-09-29T22:42:48+0000', permalink_url: 'https://www.facebook.com/p/2', status_type: 'added_video', reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } }, insights: { post_media_view: 240, post_total_media_view_unique: 180, post_clicks: 12 } },
    { id: 'p_1', message: 'Una marca puede estar presente en todas partes.', created_time: '2026-09-09T17:51:33+0000', permalink_url: 'https://www.facebook.com/p/1', status_type: 'added_photos', shares: { count: 3 }, reactions: { summary: { total_count: 4 } }, comments: { summary: { total_count: 2 } }, insights: null }
  ]
};

test('a page is asked for in stretches that fit in the 90 days Meta allows, with room for the last day', () => {
  assert.deepEqual(pageInsightWindows('2026-09-01', '2026-09-30'), [{ since: '2026-09-01', until: '2026-10-02', first: '2026-09-01', last: '2026-09-30' }]);
  // A quarter of 92 days does not fit in one request.
  const quarter = pageInsightWindows('2026-07-01', '2026-09-30');
  assert.equal(quarter.length, 2);
  assert.deepEqual(quarter.map((window) => [window.first, window.last]), [['2026-07-01', '2026-09-26'], ['2026-09-27', '2026-09-30']]);
  for (const window of quarter) assert.ok((Date.parse(window.until) - Date.parse(window.since)) / 86400000 <= 90);
  assert.equal(META_PAGE_WINDOW_DAYS, 88);
  assert.deepEqual(pageInsightWindows('2026-09-30', '2026-09-01'), []);
  assert.deepEqual(pageInsightWindows('ayer', 'hoy'), []);
});

test('a daily value of a page belongs to the day that ends at its end_time', () => {
  assert.equal(pageValueDay('2026-09-02T07:00:00+0000'), '2026-09-01');
  assert.equal(pageValueDay('2026-12-01T08:00:00+0000'), '2026-11-30', 'winter time on the Pacific');
  assert.equal(pageValueDay('nada'), null);
});

test('the figures of the page enter the report as Facebook sources, exact and with their origin', () => {
  const sources = buildFacebookSources(page);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map((source) => source.screenType), ['META_API_FACEBOOK_PAGE', 'META_API_FACEBOOK_CONTENT']);
  for (const source of sources) { assert.equal(source.origin, 'META_API'); assert.equal(source.platform, 'FACEBOOK'); assert.match(source.originalName, /Brain Studio/); }
  const evidence = buildEvidenceReport(sources, { reportPeriod: PERIOD, currency: 'COP' });
  assert.deepEqual(evidence.issues.filter((issue) => issue.blocking), []);
  const fact = (key, extra = {}) => evidence.facts.find((item) => item.key === key && Object.entries(extra).every(([field, value]) => item[field] === value));
  assert.equal(fact('views', { entityLevel: 'ACCOUNT' }).value, 5120);
  assert.equal(fact('views', { entityLevel: 'ACCOUNT' }).changePct, 28);
  assert.equal(fact('interactions', { entityLevel: 'ACCOUNT' }).changePct, null, 'from zero there is no percentage');
  assert.equal(fact('profileVisits').value, 133);
  assert.equal(fact('follows').value, 9);
  assert.equal(fact('unfollows').value, 2);
  assert.equal(fact('followerTotal').value, 363);
  assert.equal(fact('contentCount', { entityLevel: 'ACCOUNT' }).value, 2);
  for (const item of evidence.observations) { assert.equal(item.platform, 'FACEBOOK'); assert.equal(typeof item.evidence, 'string'); assert.match(item.evidence, /Meta/); }
  const followers = evidence.observations.find((item) => item.key === 'followerTotal');
  assert.match(followers.evidence, /al cierre del 30 de septiembre de 2026/, 'the followers of the last day of the period, not today\'s');
  assert.match(evidence.observations.find((item) => item.key === 'interactions' && item.entityLevel === 'ACCOUNT').evidence, /reels/, 'what Meta leaves out is said');
});

test('the people who saw the page come for the exact period; if Meta does not give them, it is said, never added up', () => {
  const [account] = buildFacebookSources(page);
  assert.deepEqual(account.warnings, []);
  const viewers = account.observations.find((item) => item.key === 'viewers');
  assert.equal(viewers.value, 642);
  assert.equal(viewers.changePct, 28.4);
  assert.match(viewers.evidence, /personas distintas/);
  const [without] = buildFacebookSources({ ...page, uniqueViewers: null });
  assert.deepEqual(without.warnings, [FACEBOOK_VIEWERS_NOTE]);
  assert.equal(without.observations.some((item) => ['viewers', 'reach'].includes(item.key)), false);
  assert.deepEqual(pageTotalRange('2026-09-01', '2026-09-30'), { since: '2026-09-01', until: '2026-10-01' });
  assert.equal(pageTotalRange('2026-09-30', '2026-09-01'), null);
});

test('each post brings what the post itself says, and its statistics only if Meta gives them', () => {
  const evidence = buildEvidenceReport(buildFacebookSources(page), { reportPeriod: PERIOD, currency: 'COP' });
  const of = (id, key) => evidence.facts.find((item) => item.entityId === id && item.key === key)?.value;
  assert.deepEqual([of('p_2', 'views'), of('p_2', 'viewers'), of('p_2', 'reactions'), of('p_2', 'comments'), of('p_2', 'shares'), of('p_2', 'clicks')], [240, 180, 1, 0, 0, 12]);
  // Without statistics the post keeps its reactions, comments and shares; no view is invented.
  assert.deepEqual([of('p_1', 'views'), of('p_1', 'viewers'), of('p_1', 'reactions'), of('p_1', 'comments'), of('p_1', 'shares')], [undefined, undefined, 4, 2, 3]);
  const { sections } = buildReportPresentation({ normalizedMetrics: evidence });
  const titles = sections.map((section) => section.title);
  assert.ok(titles.includes('Resumen de Facebook'));
  const posts = sections.find((section) => section.title === 'Publicaciones del período · Facebook');
  assert.deepEqual(posts.rows.map((row) => row.label), ['9 sept · Foto · Una marca puede estar presente en todas partes.', '29 sept · Video · Hay relaciones que empiezan con un proyecto.']);
  assert.deepEqual(posts.columns.map((column) => column.label), ['Visualizaciones', 'Espectadores', 'Reacciones', 'Comentarios', 'Clics', 'Compartidos']);
  const summary = sections.find((section) => section.title === 'Resumen de Facebook');
  for (const row of summary.rows) assert.doesNotMatch(row.label, /^[a-z]+[A-Z]/, row.label);
});

test('Instagram and Facebook travel together without stepping on each other', async () => {
  const { buildInstagramSources } = await import('../src/lib/metaReportSources.js');
  const instagram = buildInstagramSources({ account: { id: 'ig', username: 'brainstudioagencia' }, period: PERIOD, fetchedAt: FETCHED_AT, totals: { views: 4489 }, media: [] });
  const evidence = buildEvidenceReport([...instagram, ...buildFacebookSources(page)], { reportPeriod: PERIOD, currency: 'COP' });
  assert.equal(evidence.facts.filter((item) => item.status === 'CONFLICT').length, 0);
  assert.deepEqual(evidence.facts.filter((item) => item.key === 'views' && item.entityLevel === 'ACCOUNT').map((item) => `${item.platform}:${item.value}`).sort(), ['FACEBOOK:5120', 'INSTAGRAM:4489']);
});

test('a page without any post yields only the page source', () => {
  assert.equal(buildFacebookSources({ ...page, posts: [] }).length, 1);
});
