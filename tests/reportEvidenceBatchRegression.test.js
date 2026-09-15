import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { buildReportPresentation } from '../src/lib/reportPresentationModel.js';
const fixture = await import('./fixtures/reportEvidenceBatch.js').catch(() => ({}));
const sources = () => {
  assert.equal(typeof fixture.syntheticEvidenceBatch, 'function', 'synthetic eight-source fixture exists');
  return fixture.syntheticEvidenceBatch();
};
const period = { start: '2026-08-01', end: '2026-08-31' };

test('eight-source regression preserves 88 observations while consolidating repeated Meta summaries', () => {
  const input = sources();
  assert.equal(input.length, 8);
  assert.deepEqual(input.map(item => item.observations.length), [33, 6, 8, 6, 8, 16, 3, 8]);
  const report = buildEvidenceReport(input, { reportPeriod: period });
  assert.equal(report.observations.length, 88);
  assert.equal(report.facts.length, 80);
  const totals = report.facts.filter(item => item.key === 'views' && item.scope === 'TOTAL');
  assert.deepEqual(totals.map(item => item.value).sort((a, b) => a - b), [660, 4321, 12340, 13000]);
  assert.equal(totals.find(item => item.platform === 'FACEBOOK' && item.contextKey === 'account_content').value, 4321);
  assert.equal(report.facts.find(item => item.key === 'viewers').value, 2123);
  assert.equal(report.issues.filter(item => item.code === 'CURRENCY_UNKNOWN').length, 1);
  assert.equal(report.issues.filter(item => item.code === 'PERIOD_INHERITED').length, 1);

  const presentation = buildReportPresentation({ normalizedMetrics: report });
  assert.equal(presentation.sections.filter(section => section.panelId).length, 0, 'every fixture panel cell has explicit observation evidence; none repeats it');
  const represented = presentation.sections.flatMap(section => section.rows.flatMap(row => row.facts.map(item => item.factId)));
  assert.equal(new Set(represented).size, represented.length, 'no source panel repeats a rendered fact');
  assert.deepEqual([...represented].sort(), report.facts.filter(item => typeof item.value === 'number').map(item => item.factId).sort());
  const formats = presentation.sections.find(section => section.platform === 'FACEBOOK' && section.entityLevel === 'FORMAT');
  const links = formats.rows.find(row => row.label === 'Enlaces');
  assert.equal(links.cells.views.value, 2400);
  assert.equal(links.cells.interactions.value, 9);
});

test('reuploading the same captures cannot double totals or turn unknown source context into corroboration', () => {
  const input = sources();
  const baseline = buildEvidenceReport(input, { reportPeriod: period });
  const repeated = buildEvidenceReport([...input, ...input.map(item => ({ ...structuredClone(item), sourceId: `${item.sourceId}-copy` }))], { reportPeriod: period });
  assert.equal(repeated.observations.length, 176);
  const semanticFacts = report => report.facts.filter(item => !item.contextKey.startsWith('SOURCE_SPECIFIC:'))
    .map(({ factId, value, unit }) => ({ factId, value, unit })).sort((a, b) => a.factId.localeCompare(b.factId));
  assert.deepEqual(semanticFacts(repeated), semanticFacts(baseline));
  assert.equal(repeated.facts.filter(item => item.contextKey.startsWith('SOURCE_SPECIFIC:')).length, 2);
  assert.equal(repeated.issues.some(item => item.code === 'VALUE_CONFLICT'), false);
});

test('a repeated exact and rounded summary blocks analysis when their percentage changes disagree', () => {
  const input = sources();
  input.find(item => item.sourceId === 'facebook-summary').observations.find(item => item.key === 'viewers').changePct = -35.2;
  input.find(item => item.sourceId === 'facebook-trends').observations.find(item => item.key === 'viewers').changePct = -31;
  const report = buildEvidenceReport(input, { reportPeriod: period });
  const viewers = report.facts.filter(item => item.key === 'viewers');
  assert.equal(viewers.length, 1);
  assert.equal(viewers[0].value, 2123);
  assert.equal(viewers[0].changePct, null);
  const conflict = report.issues.find(item => item.code === 'CHANGE_CONFLICT');
  assert.equal(conflict.blocking, true);
  assert.deepEqual(conflict.sourceIds, ['facebook-summary', 'facebook-trends']);
  assert.equal(report.readyForNarrative, false);
});
