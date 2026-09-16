import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { applyReportReview, assertEvidenceReady } from '../src/services/reportWorkflowService.js';
import { buildReportPresentation } from '../src/lib/reportPresentationModel.js';

const period = { start: '2026-08-01', end: '2026-08-31' };
const fixture = () => {
  const sourceExtractions = [{ sourceId: 'mixed-capture', screenType: 'CONTENT_FORMATS', observations: [{
    observationId: 'mixed-capture:reels', key: 'views', label: 'Reels', value: 933, rawValue: '933', unit: 'count',
    platform: 'FACEBOOK', scope: 'TOTAL', precision: 'EXACT', contextKey: 'facebook-formats', period, evidence: 'Reels: 933'
  }], panels: [{ panelId: 'mixed-capture:formats', title: 'Visualizaciones por formato', metricKey: 'views',
    platform: 'FACEBOOK', scope: 'TOTAL', unit: 'count', contextKey: 'facebook-formats', period,
    observationIds: ['mixed-capture:reels'], dataset: [{ label: 'Reels', value: 933 }]
  }] }];
  return { id: 'context-integrity', status: 'REVIEW', normalizedMetrics: {
    ...buildEvidenceReport(sourceExtractions, { reportPeriod: period }), version: 1, dataVersion: 1,
    reportPeriod: period, sourceExtractions, sourceFailures: [], processingSummary: { failedFiles: 0, partialFiles: 0 }
  }, narrative: {} };
};

test('issuance keeps platform mismatch pending and leaves the ambiguous panel in internal review', () => {
  const before = fixture();
  assert.doesNotThrow(() => assertEvidenceReady(before));
  const after = { ...before, ...applyReportReview(before, { expectedVersion: 1, panelUpdates: [{
    panelId: 'mixed-capture:formats', platform: 'INSTAGRAM', reason: 'La cabecera revisada corresponde a Instagram.'
  }] }) };
  assert.equal(after.normalizedMetrics.panels[0].platform, 'INSTAGRAM');
  const fact = after.normalizedMetrics.facts[0];
  if (fact.platform !== after.normalizedMetrics.panels[0].platform) {
    assert.doesNotThrow(() => assertEvidenceReady(after));
    assert.ok(after.normalizedMetrics.issues.some(issue => issue.code === 'PANEL_CONTEXT_MISMATCH' && issue.blocking));
    const presentation = buildReportPresentation(after);
    assert.equal(presentation.sections.some(section => section.panelId === 'mixed-capture:formats'), false);
    assert.equal(presentation.detailPanels.length, 1);
  }
});

test('an explicit cell link with a different scope cannot authorize a value copy', () => {
  const before = fixture();
  before.normalizedMetrics.sourceExtractions[0].panels[0].scope = 'PAID';
  before.normalizedMetrics = { ...before.normalizedMetrics,
    ...buildEvidenceReport(before.normalizedMetrics.sourceExtractions, { reportPeriod: period }) };
  assert.doesNotThrow(() => assertEvidenceReady(before));
  assert.ok(before.normalizedMetrics.issues.some(issue => issue.code === 'PANEL_CONTEXT_MISMATCH' && issue.blocking));
  assert.equal(buildReportPresentation(before).sections.some(section => section.panelId === 'mixed-capture:formats'), false);
});

test('a single-metric summary cannot publish viewers as a views row without semantic evidence', () => {
  const source = fixture().normalizedMetrics.sourceExtractions[0];
  source.screenType = 'CONTENT_SUMMARY';
  source.panels = [{ ...source.panels[0], chartType: 'SUMMARY', title: 'Desglose de visualizaciones',
    observationIds: [], dataset: [{ label: 'Total', views: 1234 }, { label: 'Espectadores', value: 900 }] }];
  const original = structuredClone(source);
  const evidence = buildEvidenceReport([source], { reportPeriod: period });
  const mismatch = evidence.issues.find(issue => issue.code === 'PANEL_METRIC_MISMATCH');
  assert.equal(mismatch?.blocking, true);
  assert.deepEqual(mismatch.panelIds, ['mixed-capture:formats']);
  assert.deepEqual(mismatch.sourceIds, ['mixed-capture']);
  assert.equal(evidence.readyForNarrative, false);
  assert.deepEqual(evidence.panels[0].dataset, source.panels[0].dataset, 'original cells remain available for review');
  assert.deepEqual(source, original);
  assert.doesNotThrow(() => assertEvidenceReady({ normalizedMetrics: evidence }));
  assert.equal(buildReportPresentation({ normalizedMetrics: evidence }).detailPanels.length, 1);
});

test('the summary metric guard does not reinterpret formats, empty cells or explicitly mixed tables', () => {
  for (const change of [
    { label: 'Reels' }, { label: 'Enlaces' }, { label: 'Total' }, { label: 'Visualizaciones' },
    { label: 'Espectadores', value: null }, { label: 'Espectadores', chartType: 'BAR' },
    { label: 'Espectadores', metricKey: 'summary' },
  ]) {
    const source = fixture().normalizedMetrics.sourceExtractions[0];
    source.panels = [{ ...source.panels[0], chartType: change.chartType || 'SUMMARY_CARDS',
      metricKey: change.metricKey || 'views', observationIds: [],
      dataset: [{ label: change.label, value: Object.hasOwn(change, 'value') ? change.value : 900 }] }];
    const result = buildEvidenceReport([source], { reportPeriod: period });
    assert.equal(result.issues.some(issue => issue.code === 'PANEL_METRIC_MISMATCH'), false, JSON.stringify(change));
  }
});
