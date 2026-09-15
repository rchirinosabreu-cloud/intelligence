import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { applyReportReview, assertEvidenceReady } from '../src/services/reportWorkflowService.js';

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

test('a linked panel cannot remain publishable after its platform differs from its observation', () => {
  const before = fixture();
  assert.doesNotThrow(() => assertEvidenceReady(before));
  const after = { ...before, ...applyReportReview(before, { expectedVersion: 1, panelUpdates: [{
    panelId: 'mixed-capture:formats', platform: 'INSTAGRAM', reason: 'La cabecera revisada corresponde a Instagram.'
  }] }) };
  assert.equal(after.normalizedMetrics.panels[0].platform, 'INSTAGRAM');
  const fact = after.normalizedMetrics.facts[0];
  if (fact.platform !== after.normalizedMetrics.panels[0].platform) {
    assert.throws(() => assertEvidenceReady(after), /plataforma|conflicto|panel|referencia/i,
      'one linked figure must not remain publishable under two different platforms');
  }
});

test('an explicit cell link with a different scope cannot authorize a value copy', () => {
  const before = fixture();
  before.normalizedMetrics.sourceExtractions[0].panels[0].scope = 'PAID';
  before.normalizedMetrics = { ...before.normalizedMetrics,
    ...buildEvidenceReport(before.normalizedMetrics.sourceExtractions, { reportPeriod: period }) };
  assert.throws(() => assertEvidenceReady(before), /distribuci|conflicto|panel|referencia|alcance/i,
    'paid table cells cannot certify total observations solely by matching label and value');
});
