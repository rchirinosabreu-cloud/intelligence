import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScopedReportData,
  normalizeAdsTableRows,
  orderReportSections,
} from '../src/lib/reportStructure.js';

const metric = (value, label) => ({ value, label, unit: 'count' });

test('keeps organic source metrics isolated by platform and source id', () => {
  const scoped = buildScopedReportData([
    {
      sourceId: 'facebook-summary',
      sectionCategory: 'ORGANIC',
      platform: 'FACEBOOK',
      screenType: 'CONTENT_SUMMARY',
      metrics: { impressions: metric(15525, 'Visualizaciones'), results: metric(57, 'Interacciones') },
    },
    {
      sourceId: 'instagram-summary',
      sectionCategory: 'ORGANIC',
      platform: 'INSTAGRAM',
      screenType: 'CONTENT_SUMMARY',
      metrics: { impressions: metric(39609, 'Visualizaciones'), results: metric(844, 'Interacciones') },
    },
  ]);

  assert.deepEqual(scoped.organic.map((source) => source.sourceId), ['facebook-summary', 'instagram-summary']);
  assert.equal(scoped.organicSummary.impressions, undefined);
  assert.equal(scoped.organicSummary.results, undefined);
  assert.equal(scoped.ads.length, 0);
});

test('organic summary contains only the six approved general performance metrics', () => {
  const scoped = buildScopedReportData([
    { sourceId: 'unknown', sectionCategory: 'ORGANIC', platform: 'UNKNOWN', screenType: 'AUDIENCE_DEMOGRAPHICS', metrics: { spend: metric(0, 'Inversión'), follows: metric(1209, 'Seguidores totales') } },
    { sourceId: 'facebook', sectionCategory: 'ORGANIC', platform: 'FACEBOOK', screenType: 'CONTENT_SUMMARY', metrics: { views: { ...metric(15525, 'Visualizaciones'), scope: 'MIXED' }, videoViews: metric(965, 'Reproducciones'), reachPaid: metric(12155, 'De anuncios') } },
    { sourceId: 'instagram', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM', screenType: 'CONTENT_SUMMARY', metrics: { viewsOrganic: metric(27064, 'Visualizaciones orgánicas'), interactions: metric(844, 'Interacciones'), viewers: metric(6700, 'Espectadores') } },
    { sourceId: 'cross', sectionCategory: 'ORGANIC', platform: 'CROSS_PLATFORM', screenType: 'METRIC_TRENDS', metrics: { linkClicks: metric(64, 'Clics'), profileVisits: metric(825, 'Visitas'), follows: metric(51, 'Nuevos seguidores'), reachOrganic: metric(6700, 'Alcance orgánico'), videoViews: metric(965, 'Reproducciones') } },
  ]);
  assert.deepEqual(Object.keys(scoped.organicSummary), ['views', 'viewers', 'follows', 'profileVisits', 'linkClicks', 'reachOrganic']);
  assert.equal(scoped.organicSummary.views.value, 27064);
  assert.equal(scoped.organicSummary.interactions, undefined);
  assert.equal(scoped.organicSummary.videoViews, undefined);
  assert.equal(scoped.organicSummary.spend, undefined);
  assert.equal(scoped.organicSummary.reachPaid, undefined);
});

test('deduplicates matching ad-set and ad-table totals without summing reach or spend', () => {
  const sharedMetrics = {
    spend: { value: 232826, label: 'Importe gastado', unit: 'COP' },
    impressions: metric(23568, 'Impresiones'),
    reach: metric(8978, 'Alcance'),
    results: metric(52, 'Conversaciones'),
    clicks: { value: null, label: 'Clics' },
  };
  const scoped = buildScopedReportData([
    { sourceId: 'ad-set', sectionCategory: 'ADS', platform: 'META_ADS', entityLevel: 'AD_SET', metrics: sharedMetrics },
    { sourceId: 'ad-table', sectionCategory: 'ADS', platform: 'META_ADS', entityLevel: 'AD', metrics: sharedMetrics },
  ]);

  assert.equal(scoped.ads.length, 2);
  assert.equal(scoped.adsSummary.spend.value, 232826);
  assert.equal(scoped.adsSummary.impressions.value, 23568);
  assert.equal(scoped.adsSummary.reach.value, 8978);
  assert.equal(scoped.adsSummary.results.value, 52);
  assert.equal(scoped.adsSummary.clicks, undefined);
  assert.equal(scoped.adsSummary.ctr, undefined);
});

test('excludes totals from ad rows and preserves zero separately from missing values', () => {
  const rows = normalizeAdsTableRows([
    { title: 'POST - INSCRIPCIÓN PABLO', results: 16, spend: 54993 },
    { title: 'POST - SIN RESULTADOS', results: 0, spend: 1796 },
    { title: 'REEL - DATO AUSENTE', results: null, spend: 421 },
    { title: 'Resultados de 3 anuncios', results: 16, spend: 57210 },
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.rowType), ['ENTITY', 'ENTITY', 'ENTITY']);
  assert.equal(rows[1].results, 0);
  assert.equal(rows[2].results, null);
});

test('orders organic sources before ads while retaining source order inside each scope', () => {
  const ordered = orderReportSections([
    { sectionId: 'ad-one', sectionCategory: 'ADS' },
    { sectionId: 'ig-one', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM' },
    { sectionId: 'fb-one', sectionCategory: 'ORGANIC', platform: 'FACEBOOK' },
  ]);

  assert.deepEqual(ordered.map((section) => section.sectionId), ['ig-one', 'fb-one', 'ad-one']);
});
