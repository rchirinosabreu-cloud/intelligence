import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';

const period = { start: '2026-08-01', end: '2026-08-31' };
const base = { key: 'views', platform: 'FACEBOOK', scope: 'TOTAL', unit: 'count', precision: 'EXACT', contextKey: 'account_content', period };
const formatSource = () => ({
  sourceId: 'formats', screenType: 'CONTENT_FORMATS', platform: 'FACEBOOK', period,
  metrics: [
    { ...base, id: 'reels', label: 'Reels', value: 933 },
    { ...base, id: 'photo', label: 'Foto', value: 109 },
    { ...base, id: 'photos', label: 'Varias fotos', value: 7 }
  ],
  panels: [{ id: 'views', metricKey: 'views', title: 'Visualizaciones', platform: 'FACEBOOK', contextKey: 'account_content', scope: 'TOTAL', unit: 'count', observationIds: ['reels', 'photo', 'photos'], dataset: [{ label: 'Reels', views: 933 }, { label: 'Foto', views: 109 }, { label: 'Varias fotos', views: 7 }] }]
});

test('format rows keep identities distinct from one another and the account headline', () => {
  const report = buildEvidenceReport([formatSource(), { sourceId: 'summary', metrics: [{ ...base, id: 'total', label: 'Visualizaciones', value: 1049, entityLevel: 'ACCOUNT' }] }], { reportPeriod: period });
  assert.equal(report.facts.length, 4);
  assert.deepEqual(report.facts.filter(fact => fact.entityLevel === 'FORMAT').map(fact => fact.entityName).sort(), ['Foto', 'Reels', 'Varias fotos']);
  assert.equal(report.issues.some(issue => issue.code === 'VALUE_CONFLICT'), false);
});

test('format identity requires a matching panel row and is stable after renormalizing', () => {
  const source = formatSource();
  source.metrics.push({ ...base, id: 'unmatched', label: 'Historias', value: 6 });
  const report = buildEvidenceReport([source], { reportPeriod: period });
  assert.equal(report.observations.find(item => item.label === 'Historias').entityLevel, 'UNKNOWN');
  const repeated = buildEvidenceReport([{ ...source, observations: report.observations }], { reportPeriod: period });
  assert.deepEqual(repeated.facts, report.facts);
});

test('an explicitly related partial additive breakdown cannot exceed its own total', () => {
  const report = buildEvidenceReport([{ sourceId: 'source', metrics: [
    { ...base, id: 'total', value: 100, entityLevel: 'ACCOUNT' },
    { ...base, id: 'reels', value: 101, entityLevel: 'FORMAT', entityName: 'Reels', relation: { type: 'COMPONENT_OF', parentObservationId: 'total', exhaustive: false } }
  ] }], { reportPeriod: period });
  assert.ok(report.issues.some(issue => issue.code === 'PARTIAL_BREAKDOWN_EXCEEDS_TOTAL' && issue.blocking));
});

test('linked panel cells retain source identity and block a stale value after observation correction', () => {
  const initial = buildEvidenceReport([formatSource()], { reportPeriod: period });
  const panel = initial.panels[0];
  assert.ok(panel.cellReferences.some(ref => ref.rowLabel === 'Reels' && ref.columnKey === 'views' && ref.observationId === 'formats:reels'));
  const observations = initial.observations.map(item => item.observationId === 'formats:reels' ? { ...item, value: 930, rawValue: '930' } : item);
  const reviewed = buildEvidenceReport([{ ...formatSource(), observations, panels: initial.panels }], { reportPeriod: period });
  assert.equal(reviewed.panels[0].dataset[0].views, 933);
  assert.ok(reviewed.issues.some(issue => issue.code === 'PANEL_OBSERVATION_MISMATCH' && issue.blocking));
  assert.equal(reviewed.readyForNarrative, false);
});

test('explicit cell references reject another source, a missing row, or a mismatched metric column', () => {
  for (const ref of [
    { rowLabel: 'Reels', columnKey: 'views', observationId: 'different:reels' },
    { rowLabel: 'Missing', columnKey: 'views', observationId: 'formats:reels' },
    { rowLabel: 'Reels', columnKey: 'interactions', observationId: 'formats:reels' }
  ]) {
    const source = formatSource();
    source.panels[0].cellReferences = [ref];
    const report = buildEvidenceReport([source], { reportPeriod: period });
    assert.ok(report.issues.some(issue => issue.code === 'PANEL_REFERENCE_INVALID' && issue.blocking));
  }
});

test('matching numbers alone cannot bind a chart row to an observation', () => {
  const source = formatSource();
  source.metrics[0].label = 'Total';
  const report = buildEvidenceReport([source], { reportPeriod: period });
  assert.equal(report.panels[0].cellReferences.some(ref => ref.rowLabel === 'Reels'), false);
});

test('the sample-size annotation cannot be published as a period content count', () => {
  const report = buildEvidenceReport([{ sourceId: 'sample', metrics: [{ ...base, key: 'contentCount', value: 200, rawValue: '200', label: 'Contenido publicado', evidence: 'Contenido publicado. Según 200 contenidos.', entityLevel: 'ACCOUNT' }] }], { reportPeriod: period });
  assert.equal(report.observations[0].value, 200);
  assert.ok(report.issues.some(issue => issue.code === 'SOURCE_SAMPLE_AS_CONTENT_COUNT' && issue.blocking));
});

test('excluding an observation does not permit its linked panel to republish the value', () => {
  const source = formatSource();
  source.metrics[0].excluded = true;
  const report = buildEvidenceReport([source], { reportPeriod: period });
  assert.equal(report.panels[0].dataset[0].views, 933);
  assert.ok(report.issues.some(issue => issue.code === 'PANEL_REFERENCE_INVALID' && issue.blocking));
});

test('an interface recommendation badge cannot be published as an advertising result', () => {
  const source = { sourceId: 'campaign', metrics: [{ ...base, id: 'badge', key: 'recommendations', label: 'Recomendaciones', value: 2, evidence: 'Insignia de recomendaciones de Meta' }] };
  const report = buildEvidenceReport([source], { reportPeriod: period });
  assert.equal(report.observations[0].value, 2);
  assert.ok(report.issues.some(issue => issue.code === 'UI_METADATA_AS_METRIC' && issue.blocking));
  assert.equal(report.readyForNarrative, false);
});

test('unknown result types do not create a separate identity that hides incompatible view totals', () => {
  const report = buildEvidenceReport([
    { sourceId: 'cap', metrics: [{ ...base, value: 1017, resultType: null }] },
    { sourceId: 'summary', metrics: [{ ...base, value: 1049, resultType: 'UNKNOWN' }] }
  ], { reportPeriod: period });
  assert.equal(report.facts.length, 1);
  assert.equal(report.facts[0].value, null);
  assert.ok(report.issues.some(issue => issue.code === 'VALUE_CONFLICT' && issue.blocking));
  assert.ok(report.observations.every(item => item.resultType === null));
});

test('explicit advertising result types retain distinct meanings', () => {
  const report = buildEvidenceReport([{ sourceId: 'ads', metrics: [
    { ...base, key: 'results', value: 10, resultType: 'CONVERSATIONS' },
    { ...base, key: 'results', value: 10, resultType: 'LINK_CLICKS' }
  ] }], { reportPeriod: period });
  assert.equal(report.facts.length, 2);
  assert.deepEqual(report.observations.map(item => item.resultType).sort(), ['CONVERSATIONS', 'LINK_CLICKS']);
});
