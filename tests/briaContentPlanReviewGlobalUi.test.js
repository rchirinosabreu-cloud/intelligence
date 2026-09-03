import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('content-plan review API exposes shared read, rerun and finding lifecycle routes', async () => {
  const routes = await read('src/routes/api/content.js');

  assert.match(routes, /router\.get\('\/plans\/:id\/bria-review'/);
  assert.match(routes, /router\.post\('\/plans\/:id\/bria-review'/);
  assert.match(routes, /findings\/:findingId/);
  assert.match(routes, /MARK_CORRECTED/);
  assert.match(routes, /DISMISS/);
  assert.match(routes, /req\.user\.userId/);
});

test('shared Bria panel uses the AI gradient and navigates findings three cards at a time', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');

  assert.match(panel, /brainstudio-mascot-tip\.png/);
  assert.match(panel, /aria-label="Revisión de Bria"/);
  assert.match(panel, /h-10 w-10 object-contain/);
  assert.doesNotMatch(panel, /absolute -bottom-3 right-3 h-24 w-24/);
  assert.doesNotMatch(panel, /Revisión compartida/);
  assert.match(panel, /'Corregido'/);
  assert.match(panel, /Descartar/);
  assert.match(panel, />\s*Ver pieza\s*</);
  assert.match(panel, /absolute right-3 top-3/);
  assert.doesNotMatch(panel, /Usa las flechas para ver todos los hallazgos en grupos de tres/);
  assert.match(panel, /bg-gradient-to-br/);
  assert.doesNotMatch(panel, /className="bg-zinc-950/);
  assert.match(panel, /overflow-x-auto/);
  assert.match(panel, /snap-x/);
  assert.match(panel, /useRef/);
  assert.match(panel, /cardsPerStep\s*=\s*3/);
  assert.match(panel, /scrollAnimationDuration\s*=\s*420/);
  assert.match(panel, /animateFindingsScroll/);
  assert.match(panel, /prefers-reduced-motion/);
  assert.match(panel, /Hallazgos anteriores/);
  assert.match(panel, /Siguientes hallazgos/);
  assert.match(panel, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(panel, /scrollIntoView/);
  assert.match(panel, /dark:/);
  assert.match(panel, /min-h-11/);
  assert.match(panel, /aria-live/);
});

test('an existing Bria review exposes rerun as a compact icon button with an accessible tooltip', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');

  assert.match(panel, /RefreshCw/);
  assert.match(panel, /aria-label="Revisar nuevamente"/);
  assert.match(panel, /title="Revisar nuevamente"/);
  assert.match(panel, /h-11 w-11[\s\S]*rounded-xl/);
  assert.doesNotMatch(panel, />\s*Revisar nuevamente\s*</);
});

test('Bria header keeps compact controls aligned and the disclosure action at the far right', async () => {
  const panel = await read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx');

  assert.match(panel, /rounded-2xl bg-white[\s\S]*brainstudio-mascot-tip\.png/);
  assert.match(panel, /\{result\.review\.score \?\? 0\}\/100/);
  assert.doesNotMatch(panel, />de 100</);
  assert.match(panel, /aria-label="Revisar nuevamente"[\s\S]*aria-label=\{isExpanded \? 'Cerrar' : 'Ver más'\}/);
  assert.match(panel, /title=\{isExpanded \? 'Cerrar' : 'Ver más'\}/);
  assert.match(panel, /aria-controls="bria-content-plan-review-body"[\s\S]*h-11 w-11/);
  assert.doesNotMatch(panel, /w-\[88px\]/);
  assert.match(panel, /ChevronDown/);
  assert.doesNotMatch(panel, />\s*\{isExpanded \? 'Cerrar' : 'Ver más'\}\s*</);
});

test('the project design contract forbids black AI banners globally', async () => {
  const agents = await read('AGENTS.md');
  assert.match(agents, /nunca usar banners negros/i);
  assert.match(agents, /superficies.*IA.*degradado/i);
});

test('content mutations mark the global Bria review stale instead of reviewing per browser', async () => {
  const service = await read('src/services/contentService.js');
  const scheduler = await read('src/services/briaContentPlanReviewScheduler.js');

  assert.match(service, /markContentPlanReviewPending/);
  assert.match(scheduler, /initBriaContentPlanReviewScheduler/);
  assert.match(scheduler, /60 \* 1000/);
  assert.match(scheduler, /running/);
});
