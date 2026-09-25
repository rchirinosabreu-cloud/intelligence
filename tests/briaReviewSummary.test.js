import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregateContentPlanReviewBatches } from '../src/services/briaReviewBatches.js';
import { buildBriaReviewRequest } from '../src/services/briaContentPlanReviewGenerator.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dimensions = Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA']
  .map(key => [key, { score: 80, confidence: 0.8, assessable: true, note: 'Correcta.' }]));
const part = (itemIds, summary) => ({ itemIds, review: { summary, verdict: 'ALINEADA', findings: [], dimensions } });

test('the summary of a plan reviewed in batches reads as one text, not three stitched together', () => {
  const result = aggregateContentPlanReviewBatches([
    part(['a', 'b'], 'La línea editorial es clara y los textos están correctos.'),
    part(['c', 'd'], 'La línea editorial es clara y los textos están correctos.'),
    part(['e', 'f'], 'Falta precisión en la pieza del Día Mundial del Corazón.')
  ]);
  // La frase repetida por dos lotes aparece una sola vez.
  assert.equal(result.summary.match(/La línea editorial es clara/g).length, 1);
  assert.match(result.summary, /Día Mundial del Corazón/);
  // Un solo recuento, el real, y nunca contradictorio.
  assert.equal(result.summary.match(/piezas/g).length, 1);
  assert.match(result.summary, /6 piezas/);
});

test('a plan reviewed in one batch keeps the summary as it was written', () => {
  const result = aggregateContentPlanReviewBatches([part(['a'], 'Una sola frase sobre la parrilla.')]);
  assert.equal(result.summary, 'Una sola frase sobre la parrilla.');
});

test('the summary never grows beyond what a person reads at a glance', () => {
  const long = Array.from({ length: 8 }, (_, i) => part([`p${i}`], `Observación número ${i} ${'x'.repeat(300)}.`));
  const result = aggregateContentPlanReviewBatches(long);
  assert.ok(result.summary.length <= 1100, `el resumen mide ${result.summary.length}`);
});

test('the review is asked to write for a person, not to echo the field names of the schema', async () => {
  const request = buildBriaReviewRequest(
    { index: 0, itemIds: ['a'], snapshot: { id: 'plan', items: [{ id: 'a' }] } },
    []
  );
  assert.match(request.prompt, /español claro/i);
  assert.match(request.prompt, /assessable/, 'la regla técnica sigue existiendo');
  // …pero prohibiendo expresamente que esa palabra salga en el texto que se lee.
  assert.match(request.prompt, /no uses.*(nombres de campos|términos técnicos)/i);
  assert.match(request.prompt, /summary/);
  assert.match(request.prompt, /note/);
});

test('the shared review panel opens collapsed', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');
  assert.match(panel, /const \[isExpanded, setIsExpanded\] = useState\(false\)/);
  // Un fallo o un reintento sí lo abren, para que la persona vea qué pasó.
  assert.match(panel, /setIsExpanded\(true\)/);
});
