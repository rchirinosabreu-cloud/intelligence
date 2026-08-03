import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from '../src/services/aiService.js';
import {
  validateAndCleanSourceExtraction,
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
});
