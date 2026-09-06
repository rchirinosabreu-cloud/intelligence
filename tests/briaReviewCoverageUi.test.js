import test from 'node:test';
import assert from 'node:assert/strict';
import { getBriaReviewCoverageUi } from '../src/lib/briaReviewCoverageUi.js';

test('coverage separates pieces from dimensions and never invents coverage for legacy scores', () => {
  assert.equal(getBriaReviewCoverageUi({ coverage: 100 }).pieces, 'Cobertura de piezas no registrada');
  const ui = getBriaReviewCoverageUi({ scope: { complete: true, reviewedItems: 61, totalItems: 61, batchCount: 6, crossBatchTextComparison: false },
    dimensions: { ESTRATEGIA: { assessable: true }, MARCA: { assessable: false }, GRAMATICA: { assessable: true }, CONSISTENCIA: { assessable: true } } });
  assert.equal(ui.pieces, '61/61 piezas revisadas');
  assert.equal(ui.dimensions, '3/4 dimensiones evaluadas');
  assert.match(ui.limit, /entre lotes/);
});
test('progress is independent of the last published score and persists on retry', () => {
  const ui = getBriaReviewCoverageUi({ score: 80 }, { state: 'PENDING', progress: { completedBatches: 1, totalBatches: 2, reviewedItems: 12, totalItems: 13 } });
  assert.equal(ui.progress, 'Avance guardado: 12/13 piezas · 1/2 lotes.');
  assert.equal(ui.previousScore, true);
  assert.equal(getBriaReviewCoverageUi({ score: 80 }, { state: 'CURRENT' }).previousScore, false);
  assert.equal(getBriaReviewCoverageUi(null, { state: 'RUNNING' }).previousScore, false);
});
