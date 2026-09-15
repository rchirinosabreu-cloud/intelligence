import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticEvidenceBatch } from './fixtures/reportEvidenceBatch.js';
import { buildEvidenceReport, normalizeReportObservations } from '../src/lib/reportEvidence.js';
import { applyReportReview } from '../src/services/reportWorkflowService.js';
const verifier = await import('./helpers/reportRepairVerification.js').catch(() => ({}));
const period = { start: '2026-08-01', end: '2026-08-31' };
const payload = { expectedVersion: 1, updates: [
  { observationId: 'ads:ad-3-spend', value: 373, reason: 'Último dígito comprobado.' },
  { observationId: 'ads:ad-3-reach', value: 490, reason: 'Cifra comprobada.' },
  { observationId: 'ads:ad-1-costPerResult', resultType: 'CONVERSATIONS', reason: 'Definición comprobada.' },
] };
const fixture = () => {
  const sourceExtractions = syntheticEvidenceBatch().map(source => ({ ...source,
    observations: normalizeReportObservations(source, { sourceId: source.sourceId, reportPeriod: period }),
    panels: buildEvidenceReport([source], { reportPeriod: period }).panels }));
  const before = { id: 'report', status: 'DRAFT', sources: sourceExtractions.map(source => ({ id: source.sourceId, storagePath: `${source.sourceId}.png`, extractionData: { original: true } })),
    narrative: {}, normalizedMetrics: { ...buildEvidenceReport(sourceExtractions, { reportPeriod: period }), sourceExtractions, reportPeriod: period, version: 1, dataVersion: 1 } };
  const changes = applyReportReview(before, payload, { actorId: 'maintenance:reports', actorType: 'MAINTENANCE', now: '2026-09-15T12:00:00.000Z' });
  const after = { ...structuredClone(before), ...changes, normalizedMetrics: { ...changes.normalizedMetrics, version: 2 } };
  return { before, after };
};
const verify = (before, after) => {
  assert.equal(typeof verifier.verifyReportRepair, 'function');
  return verifier.verifyReportRepair(before, after, payload, { actorType: 'MAINTENANCE', actorId: 'maintenance:reports' });
};

test('repair verification checks allowed deltas and a reconstructed pipeline without mutating snapshots', () => {
  const { before, after } = fixture(), original = JSON.stringify({ before, after });
  const result = verify(before, after);
  assert.equal(result.observationCount, 88);
  assert.equal(result.changedNumericObservations.length, 2);
  assert.equal(result.reconstructedFingerprint, result.persistedFingerprint);
  assert.equal(JSON.stringify({ before, after }), original);
});

test('repair verification rejects extra numeric edits, omitted observations and changed original source records', () => {
  const edits = [
    value => { value.normalizedMetrics.sourceExtractions[0].observations[0].value += 1; },
    value => { value.normalizedMetrics.sourceExtractions[0].observations.pop(); },
    value => { value.sources[0].extractionData.original = false; },
    value => { value.normalizedMetrics.facts[0].value = 999999; },
    value => { value.normalizedMetrics.reviewHistory[0].actorType = 'USER'; },
    value => { value.normalizedMetrics.reviewHistory.shift(); },
    value => { value.normalizedMetrics.reviewHistory[0].before.value += 1; },
    value => { value.normalizedMetrics.version = 1; },
  ];
  for (const edit of edits) {
    const { before, after } = fixture(); edit(after);
    assert.throws(() => verify(before, after));
  }
});
