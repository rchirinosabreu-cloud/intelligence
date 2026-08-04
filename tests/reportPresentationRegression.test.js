import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  filterCanonicalMetrics,
  filterTopContentRows,
  isDemographicDataset,
  splitAchievement,
  safeClassName,
  buildReportFileName,
  getReviewMetricEntries,
  getOrganicPlatformLabel
} from '../src/lib/reportPresentation.js';

test('report presentation regressions', async (t) => {
  await t.test('general results contain canonical metrics only', () => {
    assert.deepEqual(Object.keys(filterCanonicalMetrics({
      spend: { value: 1 }, warnings: ['x'], processingSummary: {}, demographics: {}
    })), ['spend']);
  });

  await t.test('metric review omits missing placeholder cards', () => {
    assert.deepEqual(getReviewMetricEntries({
      spend: { value: 232826 }, clicks: { value: null }, ctr: { value: null }, results: { value: 52 }
    }).map(([key]) => key), ['spend', 'results']);
  });

  await t.test('metric audit presents one organic group before paid fields', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const organicReview = component.indexOf('Resumen orgánico detectado');
    const paidReview = component.indexOf('Métricas de pauta detectadas');
    assert.ok(organicReview > -1);
    assert.ok(paidReview > organicReview);
  });

  await t.test('demographic points are recognized without a generic value key', () => {
    assert.equal(isDemographicDataset([{ label: '25-34', hombres: 40, mujeres: 60 }]), true);
  });

  await t.test('ambiguous organic sources use a neutral label instead of unknown or cross platform', () => {
    assert.equal(getOrganicPlatformLabel('FACEBOOK'), 'Facebook');
    assert.equal(getOrganicPlatformLabel('INSTAGRAM'), 'Instagram');
    assert.equal(getOrganicPlatformLabel('UNKNOWN'), 'Orgánico');
    assert.equal(getOrganicPlatformLabel('CROSS_PLATFORM'), 'Orgánico');
  });

  await t.test('format distribution labels are excluded from ad publications', () => {
    const rows = filterTopContentRows([
      { title: 'REEL - ELEGIR COLEGIO', results: 3, impressions: 1105, reach: 869 },
      { title: 'Reels', results: 36 },
      { title: 'Enlaces', results: 10 },
      { title: 'Historias', results: 6 },
      { title: 'Foto', results: 3 },
      { title: 'Varias fotos', results: 1 },
      { title: 'Otros', results: 1 }
    ]);
    assert.deepEqual(rows.map(row => row.title), ['REEL - ELEGIR COLEGIO']);
  });

  await t.test('achievement markdown becomes a title and supporting copy', () => {
    assert.deepEqual(splitAchievement('**Alcance total robusto:** Se alcanzaron 8.978 usuarios.'), {
      title: 'Alcance total robusto',
      description: 'Se alcanzaron 8.978 usuarios.'
    });
  });

  await t.test('HTML export safely reads SVG className objects and absent titles', () => {
    assert.equal(safeClassName({ baseVal: 'recharts-layer' }), 'recharts-layer');
    assert.equal(safeClassName(undefined), '');
    assert.equal(buildReportFileName(undefined), 'reporte_de_desempeno_digital.html');
  });

  await t.test('report presents scoped organic results before paid results', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const organicHeading = component.indexOf('Resultados generales — Desempeño orgánico');
    const adsHeading = component.indexOf('Resultados generales — Desempeño de pauta');
    assert.ok(organicHeading > -1, 'missing organic summary heading');
    assert.ok(adsHeading > organicHeading, 'paid summary must appear after organic summary');
    assert.match(component, /report\.normalizedMetrics\?\.organicSummary/);
    assert.match(component, /report\.normalizedMetrics\?\.adsSummary/);
  });

  await t.test('report sections expose their source id for chart traceability', async () => {
    const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
    assert.match(route, /sourceId:\s*res\.sourceId/);
    assert.match(route, /buildScopedReportData/);
  });

  await t.test('fallback narratives are visibly marked for human review', async () => {
    const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(route, /generationMode:\s*narrativeGenerationMode/);
    assert.match(component, /Narrativa de contingencia/);
  });

  await t.test('vision prompt does not restrict organic metrics to paid keys', async () => {
    const service = await fs.readFile('src/services/reportVisionService.js', 'utf8');
    assert.doesNotMatch(service, /key name \(strictly: "spend"/);
    assert.match(service, /organic semantic keys listed above/);
  });

});
