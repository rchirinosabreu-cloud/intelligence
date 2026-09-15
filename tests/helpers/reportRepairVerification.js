import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildEvidenceReport } from '../../src/lib/reportEvidence.js';

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
const sorted = (items, key) => [...items].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
const index = (items, key) => {
  const result = new Map(items.map(item => [item[key], item]));
  assert.equal(result.size, items.length, `Identidades ${key} repetidas`);
  assert.ok(!result.has(undefined), `Falta identidad ${key}`);
  return result;
};
const without = (item, keys) => Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key)));
const evidenceFields = ['schemaVersion', 'observations', 'facts', 'panels', 'issues', 'readyForNarrative'];
const evidenceOnly = metrics => Object.fromEntries(evidenceFields.map(key => [key, metrics[key]]));

/** Pure comparison of two supplied snapshots; no filesystem, API or DB access.
 * payload is the exact authorized applyReportReview payload, not the OCR proposal.
 */
export function verifyReportRepair(before, after, payload, { actorType = 'MAINTENANCE', actorId, stage = 'persisted' } = {}) {
  assert.ok(['persisted', 'proposed'].includes(stage));
  assert.equal(after.id, before.id, 'Cambió el informe');
  assert.equal(payload.expectedVersion, before.normalizedMetrics.version, 'Payload obsoleto');
  assert.equal(after.normalizedMetrics.version, before.normalizedMetrics.version + (stage === 'persisted' ? 1 : 0), 'Versión inesperada');
  assert.equal(after.normalizedMetrics.dataVersion, before.normalizedMetrics.dataVersion + 1, 'Versión de datos inesperada');
  assert.deepEqual(after.normalizedMetrics.reportPeriod, before.normalizedMetrics.reportPeriod, 'Cambió el período del informe');
  assert.equal(after.status, 'REVIEW', 'La reparación no debe publicar');
  assert.equal(after.narrative.needsRegeneration, true, 'La narrativa anterior debe quedar invalidada');
  assert.deepEqual(sorted(after.sources, 'id'), sorted(before.sources, 'id'), 'MetricReportSource original fue modificado');
  const oldHistory = before.normalizedMetrics.reviewHistory || [], history = after.normalizedMetrics.reviewHistory || [];
  const newHistory = history.slice(oldHistory.length);

  const oldSources = index(before.normalizedMetrics.sourceExtractions, 'sourceId');
  const newSources = index(after.normalizedMetrics.sourceExtractions, 'sourceId');
  assert.deepEqual([...newSources.keys()].sort(), [...oldSources.keys()].sort(), 'Se añadieron o perdieron fuentes');
  const updates = index(payload.updates || [], 'observationId');
  const baseline = buildEvidenceReport(before.normalizedMetrics.sourceExtractions, { reportPeriod: before.normalizedMetrics.reportPeriod });
  const baselinePanels = index(baseline.panels, 'panelId');
  const changedNumericObservations = [];
  const seenUpdates = new Set();
  let observationCount = 0;
  for (const [sourceId, oldSource] of oldSources) {
    const nextSource = newSources.get(sourceId);
    assert.deepEqual(without(nextSource, ['observations', 'panels']), without(oldSource, ['observations', 'panels']), 'Cambió metadata de fuente');
    const oldObservations = index(oldSource.observations, 'observationId');
    const nextObservations = index(nextSource.observations, 'observationId');
    assert.deepEqual([...nextObservations.keys()].sort(), [...oldObservations.keys()].sort(), 'Se añadieron o perdieron observaciones');
    observationCount += oldObservations.size;
    for (const [observationId, original] of oldObservations) {
      const next = nextObservations.get(observationId), update = updates.get(observationId);
      const expected = structuredClone(original);
      if (update) {
        seenUpdates.add(observationId);
        Object.assign(expected, without(update, ['observationId', 'reason']));
        if (Object.hasOwn(update, 'value')) { expected.originalRawValue ??= original.rawValue; expected.rawValue = update.value; }
        if (Object.hasOwn(update, 'period')) expected.periodProvenance = 'HUMAN_REVIEW';
        assert.equal(next.review?.actorType, actorType, 'Actor de observación incorrecto');
        if (actorId !== undefined) assert.equal(next.review?.actorId, actorId);
        assert.equal(next.review?.reason, update.reason.trim());
        const audit = newHistory.filter(entry => entry.observationId === observationId);
        assert.equal(audit.length, 1, `Falta historia única para ${observationId}`);
        assert.deepEqual(audit[0].before, original, 'El antes de la auditoría no coincide con la evidencia original');
        assert.deepEqual(audit[0].after, next, 'El después de la auditoría no coincide con la evidencia corregida');
        assert.equal(audit[0].reason, update.reason.trim());
      } else {
        assert.deepEqual(next.review, original.review, 'Cambió una revisión no autorizada');
      }
      assert.deepEqual(without(next, ['review']), without(expected, ['review']), `Cambio no autorizado en ${observationId}`);
      if (next.value !== original.value) changedNumericObservations.push({ observationId, before: original.value, after: next.value });
    }
    const oldPanels = index(oldSource.panels || [], 'panelId'), nextPanels = index(nextSource.panels || [], 'panelId');
    assert.deepEqual([...nextPanels.keys()].sort(), [...oldPanels.keys()].sort(), 'Se añadieron o perdieron paneles');
    for (const [panelId, original] of oldPanels) {
      const expected = structuredClone(original);
      for (const update of (payload.panelUpdates || []).filter(item => item.panelId === panelId)) {
        Object.assign(expected, without(update, ['panelId', 'reason', 'rowIndex', 'rowLabel', 'field', 'value']));
        if (Object.hasOwn(update, 'period')) expected.periodProvenance = 'HUMAN_REVIEW';
        if (Object.hasOwn(update, 'field')) {
          assert.equal(String(expected.dataset[update.rowIndex]?.label ?? expected.dataset[update.rowIndex]?.name ?? ''), update.rowLabel);
          expected.dataset[update.rowIndex][update.field] = update.value;
        }
      }
      for (const ref of baselinePanels.get(panelId)?.cellReferences || []) {
        const update = updates.get(ref.observationId);
        if (!update || !Object.hasOwn(update, 'value')) continue;
        for (const row of expected.dataset.filter(item => String(item.label ?? item.name ?? '') === ref.rowLabel)) row[ref.columnKey] = update.value;
      }
      assert.deepEqual(without(nextPanels.get(panelId), ['review', 'cellReferences']), without(expected, ['review', 'cellReferences']), `Cambio no autorizado en panel ${panelId}`);
    }
  }
  assert.equal(seenUpdates.size, updates.size, 'Una corrección no pertenece al informe');
  assert.deepEqual(history.slice(0, oldHistory.length), oldHistory, 'Se alteró la historia anterior');
  assert.ok(history.length > oldHistory.length, 'Falta historia de reparación');
  for (const entry of history.slice(oldHistory.length)) {
    assert.equal(entry.actorType, actorType, 'Actor de historia incorrecto');
    if (actorId !== undefined) assert.equal(entry.actorId, actorId);
    assert.ok(entry.reason?.trim() && entry.before && entry.after, 'Historia incompleta');
  }
  const rebuilt = buildEvidenceReport(after.normalizedMetrics.sourceExtractions, { reportPeriod: after.normalizedMetrics.reportPeriod });
  const reconstructedFingerprint = fingerprint(evidenceOnly(rebuilt));
  const persistedFingerprint = fingerprint(evidenceOnly(after.normalizedMetrics));
  assert.equal(persistedFingerprint, reconstructedFingerprint, 'La evidencia persistida no coincide con el pipeline vigente');
  return { sourceCount: oldSources.size, observationCount, changedNumericObservations,
    originalSourcesFingerprint: fingerprint(sorted(before.sources, 'id')), reconstructedFingerprint, persistedFingerprint,
    readyForNarrative: rebuilt.readyForNarrative };
}
