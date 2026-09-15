import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';
import { formatEvidenceValue } from '../src/lib/reportEvidenceFormat.js';
import { buildReportPresentation } from '../src/lib/reportPresentationModel.js';

test('rounded monetary values show their resolved currency without changing the approximation', () => {
  assert.equal(formatEvidenceValue({ value: 180000, rawValue: '$180 mil', precision: 'ROUNDED', unit: 'COP' }), '≈ $180 mil COP');
  assert.equal(formatEvidenceValue({ value: 180000, rawValue: '180 mil USD', precision: 'ROUNDED', unit: 'USD' }), '≈ 180 mil USD');
});

test('currency convention is disclosed once, not repeated for every amount', () => {
  const normalizedMetrics = buildEvidenceReport([{ sourceId: 'a', observations: [
    { id: 'one', key: 'spend', unit: '$', value: 20 }, { id: 'two', key: 'costPerResult', unit: '$', value: 2 },
  ] }]);
  const notes = buildReportPresentation({ normalizedMetrics }).contextNotes.filter(item => item.code === 'CURRENCY_CONVENTION');
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /COP/);
});

test('an ISO currency visible in source text wins over the default even if OCR omitted the unit', () => {
  const report = buildEvidenceReport([{ observations: [{ key: 'spend', unit: 'UNKNOWN', value: 120, rawValue: 'USD $120' }] }]);
  assert.equal(report.facts[0].unit, 'USD');
  assert.equal(report.observations[0].currencyProvenance, 'SOURCE_VISIBLE');
});
