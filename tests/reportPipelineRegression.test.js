import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from '../src/services/aiService.js';
import {
  validateAndCleanSourceExtraction,
  visionExtractionSchema,
  mergeSourceMetricsIntoAccumulator,
  finalizeNormalizedMetrics,
  preserveApprovedReportData,
  reconcileNarrativeSections
} from '../src/services/reportVisionService.js';
import { adaptDatasetForChart, hasReadableChartData } from '../src/lib/reportChartData.js';

test('report pipeline regressions', async (t) => {
  await t.test('parses JSON wrapped in Markdown', () => {
    assert.deepEqual(parseJsonResponse('```json\n{"spend":2500}\n```'), { spend: 2500 });
  });

  await t.test('repairs an otherwise complete response truncated inside an excessive decimal', () => {
    const raw = '```json\n{"metrics":{"spend":{"value":2500.000000000000000000000000';
    assert.deepEqual(parseJsonResponse(raw), { metrics: { spend: { value: 2500 } } });
  });

  await t.test('rounds readable dataset values and rejects unsafe precision', () => {
    const cleaned = validateAndCleanSourceExtraction({
      dataset: [
        { label: 'Día 1', value: 2500.0000000000004 },
        { label: 'Día 2', value: '1.234,56789' },
        { label: 'Inválido', value: '9'.repeat(40) }
      ]
    });
    assert.deepEqual(cleaned.dataset, [
      { label: 'Día 1', value: 2500 },
      { label: 'Día 2', value: 1234.5679 }
    ]);
  });

  await t.test('exposes partial-source failures as persisted warnings', () => {
    const report = preserveApprovedReportData({
      spend: { value: 1000 },
      processingSummary: { totalFiles: 2, successfulFiles: 1, failedFiles: 1 },
      warnings: ['Fallo en lectura (captura-2.png): respuesta truncada'],
      demographics: { ageGender: [], cities: [], countries: [] }
    }, { spend: { value: 1200 } });
    assert.equal(report.processingSummary.failedFiles, 1);
    assert.match(report.warnings[0], /captura-2\.png/);
  });

  await t.test('persists chartType and dataset through validation and narrative reconciliation', () => {
    const source = validateAndCleanSourceExtraction({
      chartType: 'LINE_CHART', title: 'Tendencia', sectionCategory: 'ADS', platform: 'PAID_ADS',
      dataset: [{ label: 'Lun', value: 10 }]
    });
    assert.equal(source.chartType, 'LINE_CHART');
    const original = [{ sectionId: 'one', chartType: source.chartType, dataset: source.dataset }];
    const reconciled = reconcileNarrativeSections(original, [{ sectionId: 'one', narrativeComment: 'Lectura.' }]);
    assert.equal(reconciled[0].chartType, 'LINE_CHART');
    assert.deepEqual(reconciled[0].dataset, [{ label: 'Lun', value: 10 }]);
  });

  await t.test('adapts alternate numeric keys to Recharts without inventing points', () => {
    assert.deepEqual(adaptDatasetForChart([
      { label: 'A', impressions: '1.200' },
      { label: 'B', results: 12 },
      { label: 'C', value: null }
    ], 'LINE_CHART'), [
      { label: 'A', value: 1200 },
      { label: 'B', value: 12 }
    ]);
    assert.equal(hasReadableChartData([{ label: 'C', value: null }]), false);
    assert.deepEqual(adaptDatasetForChart([
      { label: 'Reel', results: '12', impressions: '1.200', reach: 900 }
    ], 'RANKING_TABLE'), [
      { label: 'Reel', value: 12, results: 12, impressions: 1200, reach: 900 }
    ]);
  });

  await t.test('preserves COP end to end when approving metrics', () => {
    const source = validateAndCleanSourceExtraction({ metrics: { spend: { value: '$ 2.500 COP', unit: 'COP' } } });
    let accumulator = mergeSourceMetricsIntoAccumulator(null, source);
    const normalized = finalizeNormalizedMetrics(accumulator);
    const approved = preserveApprovedReportData(normalized, { spend: { ...normalized.spend, value: 2600 } });
    assert.equal(approved.spend.value, 2600);
    assert.equal(approved.spend.unit, 'COP');
  });

  await t.test('deduplicates repeated summary totals while keeping distinct detail totals', () => {
    const summary = validateAndCleanSourceExtraction({ screenType: 'Rendimiento Macro', metrics: { spend: { value: 2500 }, impressions: { value: 10000 } } });
    const duplicate = validateAndCleanSourceExtraction({ screenType: 'Tabla General', metrics: { spend: { value: 2500 }, impressions: { value: 10000 } } });
    let accumulator = mergeSourceMetricsIntoAccumulator(null, summary);
    accumulator = mergeSourceMetricsIntoAccumulator(accumulator, duplicate);
    const final = finalizeNormalizedMetrics(accumulator);
    assert.equal(final.spend.value, 2500);
    assert.equal(final.impressions.value, 10000);
  });

  await t.test('keeps an organic-only report usable with its visual detail', () => {
    const organic = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC', platform: 'ORGANIC_RRSS', chartType: 'BAR_CHART',
      dataset: [{ label: 'Publicaciones', value: 18 }],
      demographics: { ageGender: [{ label: '25-34', hombres: 40, mujeres: 60 }], cities: [], countries: [] },
      topContent: [{ title: 'Reel uno', results: 42 }]
    });
    assert.equal(organic.usable, true);
    assert.equal(organic.sectionCategory, 'ORGANIC');
    assert.equal(organic.dataset.length, 1);
    assert.equal(organic.demographics.ageGender.length, 1);
    assert.equal(organic.topContent.length, 1);
  });

  await t.test('preserves platform, screen type, entity level and result semantics per screenshot', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ADS', platform: 'META_ADS', screenType: 'AD_TABLE', entityLevel: 'AD',
      resultType: 'CONVERSATIONS', period: { start: '2026-06-25', end: '2026-07-30' },
      metrics: { results: { value: 52, label: 'Conversaciones' } }
    });
    assert.equal(source.platform, 'META_ADS');
    assert.equal(source.screenType, 'AD_TABLE');
    assert.equal(source.entityLevel, 'AD');
    assert.equal(source.resultType, 'CONVERSATIONS');
    assert.deepEqual(source.period, { start: '2026-06-25', end: '2026-07-30' });
  });

  await t.test('preserves organic metric names instead of coercing them into paid canonical keys', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC', platform: 'FACEBOOK', screenType: 'METRIC_TRENDS',
      metrics: {
        views: { value: 15500, label: 'Visualizaciones', changePct: -17.6 },
        viewers: { value: 7200, label: 'Espectadores', changePct: -26.2 },
        interactions: { value: 57, label: 'Interacciones', changePct: -67.4 },
        profileVisits: { value: 424, label: 'Visitas', changePct: 2.7 },
        follows: { value: 7, label: 'Seguidores', changePct: -46.2 }
      }
    });
    assert.equal(source.metrics.views.value, 15500);
    assert.equal(source.metrics.views.changePct, -17.6);
    assert.equal(source.metrics.profileVisits.value, 424);
    assert.equal(source.metrics.spend.value, null);
  });

  await t.test('vision schema requests only visible metrics as array items', () => {
    assert.equal(visionExtractionSchema.properties.metrics.type, 'array');
    assert.deepEqual(visionExtractionSchema.properties.metrics.items.required, [
      'key', 'label', 'value', 'unit', 'scope', 'changePct', 'confidence', 'evidence'
    ]);
  });

  await t.test('preserves whether an extracted metric is organic, paid or mixed', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC', platform: 'FACEBOOK',
      metrics: [{ key: 'views', label: 'Visualizaciones', value: 15525, unit: 'count', scope: 'MIXED' }]
    });
    assert.equal(source.metrics.views.scope, 'MIXED');
  });

  await t.test('fallback narrative explains a chart without calling every value an interaction', async () => {
    const { generateFallbackNarrative } = await import('../src/services/reportVisionService.js');
    const narrative = generateFallbackNarrative({
      spend: { value: null }, reach: { value: 1300 }, impressions: { value: 4899 },
      clicks: { value: 64 }, ctr: { value: null }, results: { value: 241 }
    }, [{
      sectionId: 'instagram-summary', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM',
      screenType: 'CONTENT_SUMMARY', title: 'Resumen de contenido', metricLabel: 'Visualizaciones',
      dataset: [{ label: 'Total', value: 4899 }]
    }, {
      sectionId: 'instagram-formats', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM',
      screenType: 'CONTENT_FORMATS', title: 'Formatos de contenido', metricLabel: 'Contenidos publicados',
      dataset: [{ label: 'Historias', value: 22 }, { label: 'Publicaciones', value: 13 }]
    }]);
    const comment = narrative.sections[0].narrativeComment;
    assert.equal(comment.split('\n\n').length, 2);
    assert.match(comment, /^Instagram:/);
    assert.doesNotMatch(comment, /interacciones directas/i);
    assert.doesNotMatch(comment, /valida de forma concluyente/i);
    assert.doesNotMatch(narrative.headline, /pauta/i);
    assert.doesNotMatch(narrative.summaryPoints.join(' '), /inversión/i);
    assert.notEqual(narrative.sections[0].narrativeComment, narrative.sections[1].narrativeComment);
    assert.equal(Array.isArray(narrative.oportunidadesYAprendizajes), true);
    assert.deepEqual(Object.keys(narrative.oportunidadesYAprendizajes[0]), ['title', 'evidence', 'learning', 'application']);
    assert.equal(Array.isArray(narrative.recomendacionesEstrategicas), true);
    assert.deepEqual(Object.keys(narrative.recomendacionesEstrategicas[0]), ['priority', 'action', 'rationale', 'kpi']);
  });

  await t.test('fallback narratives name the client and vary interpretation by chart type', async () => {
    const { generateFallbackNarrative } = await import('../src/services/reportVisionService.js');
    const sections = [
      { sectionId: 'formats', title: 'Formatos', screenType: 'CONTENT_FORMATS', sectionCategory: 'ORGANIC', platform: 'FACEBOOK', dataset: [{ label: 'Reels', value: 20 }, { label: 'Fotos', value: 5 }] },
      { sectionId: 'trend', title: 'Tendencia', screenType: 'METRIC_TRENDS', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM', dataset: [{ label: '1 jul', value: 100 }, { label: '2 jul', value: 300 }] }
    ];
    const result = generateFallbackNarrative({ organicSummary: {} }, sections, 'New Pueblito Suites');
    assert.match(result.sections[0].narrativeComment, /Para New Pueblito Suites/);
    assert.match(result.sections[1].narrativeComment, /Para New Pueblito Suites/);
    assert.doesNotMatch(result.sections.map(section => section.narrativeComment).join(' '), /Para el negocio/i);
    assert.notEqual(result.sections[0].narrativeComment.split('\n\n')[1], result.sections[1].narrativeComment.split('\n\n')[1]);
  });
});
