import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('«Ver pieza» pide a la parrilla que abra la pieza, en vez de buscarla en la página', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');
  // La parrilla solo renderiza la pieza seleccionada, así que buscar su id en el
  // DOM encontraba null en todas las demás y el botón se quedaba callado.
  assert.match(panel, /onOpenItem/);
  assert.match(panel, /onOpenItem\(itemId\)/);
});

test('la parrilla le pasa al panel cómo abrir una pieza, la misma vía que usa el calendario', async () => {
  const detail = await read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(detail, /<BriaContentPlanReview[\s\S]{0,200}onOpenItem=/);
  // El calendario ya resolvía esto: seleccionar y volver al editor.
  assert.match(detail, /onOpenPiece=\{\(id\) => \{ selectPiece\(id\); setPlanView\('editor'\); \}\}/);
});

test('abrir una pieza desde un hallazgo siempre la deja delante, aunque ya estuviera elegida', async () => {
  const detail = await read('src/components/modules/ContentPlanDetail.jsx');
  // `scrolledForRef` recuerda que ya se bajó a esa pieza una vez; sin soltarlo,
  // pulsar «Ver pieza» sobre la pieza ya seleccionada no movería la página.
  assert.match(detail, /scrolledForRef\.current = null/);
});

test('sin parrilla alrededor, el panel conserva el salto por ancla y no se rompe', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');
  assert.match(panel, /getElementById\(`item-\$\{itemId\}`\)/);
  assert.match(panel, /scrollIntoView/);
});
