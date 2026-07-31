import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricReportCreateData } from '../src/services/reportPersistence.js';

test('buildMetricReportCreateData returns only fields accepted by MetricReportCreateInput', () => {
  const payload = buildMetricReportCreateData({
    clientId: 'client-1',
    periodKind: 'MONTHLY',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2026-07-31T23:59:59.999Z',
    normalizedMetrics: {
      reach: { key: 'reach', label: 'Alcance', value: 100, unit: 'count', ignored: undefined },
    },
    narrative: { draft: 'Borrador', final: 'Final' },
    sections: [{ sectionId: 'section-1', dataset: [] }],
    sources: [{
      sourceId: 'source-1',
      storagePath: 'reports/source.png',
      platform: 'META_ADS',
      screenType: 'Resumen',
      extractionData: { reach: 100 },
      confidence: 1,
      warnings: [],
    }],
    untrustedAiField: 'must-not-reach-prisma',
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    'clientId',
    'endDate',
    'narrative',
    'normalizedMetrics',
    'periodKind',
    'sections',
    'sources',
    'startDate',
    'status',
  ]);
  assert.equal(payload.periodKind, 'MONTHLY');
  assert.equal(payload.status, 'DRAFT');
  assert.equal(payload.normalizedMetrics.reach.ignored, undefined);
  assert.deepEqual(payload.sources, { create: [
    {
      sourceId: 'source-1',
      storagePath: 'reports/source.png',
      platform: 'META_ADS',
      screenType: 'Resumen',
      extractionData: { reach: 100 },
      confidence: 1,
      warnings: [],
    },
  ] });
});

test('buildMetricReportCreateData rejects invalid dates and source records', () => {
  const base = {
    clientId: 'client-1',
    periodKind: 'MONTHLY',
    startDate: 'invalid',
    endDate: '2026-07-31T23:59:59.999Z',
    normalizedMetrics: {},
    narrative: {},
    sections: [],
    sources: [],
  };

  assert.throws(() => buildMetricReportCreateData(base), /startDate/);
  assert.throws(() => buildMetricReportCreateData({
    ...base,
    startDate: '2026-07-01T00:00:00.000Z',
    sources: [{ sourceId: 'source-1', confidence: 1 }],
  }), /storagePath/);
});
