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
  assert.equal(scoped.organicSummary.FACEBOOK.impressions.value, 15525);
  assert.equal(scoped.organicSummary.INSTAGRAM.impressions.value, 39609);
  assert.equal(scoped.organicSummary.COMBINED, undefined);
  assert.equal(scoped.ads.length, 0);
});

test('organic summary reconciles complementary screenshots without adding repeated totals', () => {
  const scoped = buildScopedReportData([
    { sourceId: 'summary', sectionCategory: 'ORGANIC', platform: 'FACEBOOK', screenType: 'CONTENT_SUMMARY', metrics: { views: metric(15525, 'Visualizaciones') } },
    { sourceId: 'trends', sectionCategory: 'ORGANIC', platform: 'FACEBOOK', screenType: 'METRIC_TRENDS', metrics: { views: metric(15525, 'Visualizaciones'), profileVisits: metric(424, 'Visitas') } },
  ]);
  assert.equal(scoped.organicSummary.FACEBOOK.views.value, 15525);
  assert.equal(scoped.organicSummary.FACEBOOK.profileVisits.value, 424);
});

test('deduplicates matching ad-set and ad-table totals without summing reach or spend', () => {
  const sharedMetrics = {
    spend: { value: 232826, label: 'Importe gastado', unit: 'COP' },
    impressions: metric(23568, 'Impresiones'),
    reach: metric(8978, 'Alcance'),
    results: metric(52, 'Conversaciones'),
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
