import test from 'node:test';
import assert from 'node:assert/strict';
import { getFindingVerificationUi } from '../src/lib/briaVerificationUi.js';
import { readFile } from 'node:fs/promises';

test('verification states distinguish waiting, active, failed and orphaned work', () => {
  const finding = { status: 'VERIFYING' };
  assert.equal(getFindingVerificationUi(finding, { state: 'PENDING' }).label, 'En espera');
  assert.equal(getFindingVerificationUi(finding, { state: 'RUNNING' }).label, 'Verificando');
  for (const state of ['FAILED', 'CURRENT', 'IDLE']) {
    const view = getFindingVerificationUi(finding, { state });
    assert.equal(view.label, 'No se pudo verificar');
    assert.equal(view.canRetry, true);
    assert.equal(view.canUndo, true);
    assert.equal(view.busy, false);
    assert.equal(view.isError, true);
  }
});

test('an inconclusive check remains actionable and exposes its explanation', () => {
  const view = getFindingVerificationUi({ status: 'OPEN', verification: { outcome: 'INCONCLUSIVE', reason: 'Falta confirmar el estado de publicación.' } }, { state: 'CURRENT' });
  assert.equal(view.label, 'Sin confirmar');
  assert.match(view.description, /publicación/);
  assert.equal(view.canRetry, true);
  assert.equal(view.canUndo, false);
});

test('a timed-out running verification offers recovery and polling includes pending findings', async () => {
  const view = getFindingVerificationUi({ status: 'VERIFYING' }, { state: 'RUNNING', startedAt: '2026-09-05T15:00:00Z' }, Date.parse('2026-09-05T15:06:00Z'));
  assert.equal(view.canRetry, true);
  const panel = await readFile(new URL('../src/components/modules/ContentPlan/BriaContentPlanReview.jsx', import.meta.url), 'utf8');
  assert.match(panel, /UNDO_CORRECTION/);
  assert.match(panel, /Deshacer/);
  assert.match(panel, /getFindingVerificationUi/);
  assert.match(panel, /hasVerifyingFindings/);
});
