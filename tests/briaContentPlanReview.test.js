import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildContentPlanReviewQuery,
  parseBriaContentPlanReview,
  reviewContentPlanWithBria
} from '../src/services/briaContentPlanReviewService.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const plan = {
  id: 'plan-1',
  clientId: 'client-andino',
  month: 9,
  year: 2026,
  strategicObjectives: 'Aumentar recordación de la nueva colección sin promociones agresivas.',
  internalNotes: JSON.stringify(['Evitar descuentos como argumento principal.']),
  client: {
    id: 'client-andino',
    name: 'Calzado Andino',
    slug: 'calzado-andino',
    aiInstructions: 'Tono cercano, experto y colombiano. No usar la palabra barato.'
  },
  items: [
    {
      id: 'piece-1',
      objective: 'Reconocimiento',
      format: 'Reel',
      copyText: 'Un zapato barato para todos.',
      captionText: 'Descubre nuestra nueva colección',
      comments: 'El cliente pidió evitar mensajes de precio.',
      internalNotes: 'Validar el cierre.'
    }
  ]
};

test('Bria content-plan review accepts structured JSON wrapped in markdown fences', () => {
  const parsed = parseBriaContentPlanReview('```json\n{"summary":"Hay un ajuste de marca.","verdict":"REQUIERE_AJUSTES","score":72,"findings":[]}\n```');

  assert.equal(parsed.summary, 'Hay un ajuste de marca.');
  assert.equal(parsed.verdict, 'REQUIERE_AJUSTES');
  assert.equal(parsed.score, 72);
  assert.deepEqual(parsed.findings, []);
});

test('the retrieval query anchors Bria in the client and current strategic objective', () => {
  const query = buildContentPlanReviewQuery(plan);

  assert.match(query, /Calzado Andino/);
  assert.match(query, /Aumentar recordación/);
  assert.match(query, /preferencias|reglas de marca/i);
});

test('Bria review isolates client evidence, uses the economical model and preserves traceability', async () => {
  const calls = { ai: null, search: null };
  const evidence = [
    {
      id: 'chunk-own', clientId: 'client-andino', title: 'Seguimiento Calzado Andino',
      sourceUrl: '/minutas?minute=1', content: 'La cliente pidió no competir por precio.', score: 0.91
    },
    {
      id: 'chunk-wrong', clientId: 'client-other', title: 'Reunión de Otro Cliente',
      sourceUrl: '/minutas?minute=2', content: 'Usar descuentos todos los viernes.', score: 0.99
    },
    {
      id: 'chunk-legacy-own', clientId: null, title: 'Calzado Andino - estrategia',
      sourceUrl: '/minutas?minute=3', content: 'Calzado Andino prioriza diseño y durabilidad.', score: 0.82
    },
    {
      id: 'chunk-unscoped', clientId: null, title: 'Reunión general',
      sourceUrl: '/minutas?minute=4', content: 'Otro cliente pidió una promoción.', score: 0.95
    }
  ];
  const ai = {
    generate: async (request) => {
      calls.ai = request;
      assert.match(request.prompt, /La cliente pidió no competir por precio/);
      assert.match(request.prompt, /Calzado Andino prioriza diseño y durabilidad/);
      assert.doesNotMatch(request.prompt, /descuentos todos los viernes/);
      assert.doesNotMatch(request.prompt, /Otro cliente pidió una promoción/);
      return {
        model: 'gpt-5.6-luna',
        requestId: 'req-review-1',
        text: '```json\n{"summary":"La propuesta contradice una regla de marca.","verdict":"REQUIERE_AJUSTES","score":64,"findings":[{"category":"MARCA","severity":"WARNING","title":"Evitar competir por precio","detail":"La palabra barato contradice el posicionamiento.","recommendation":"Reformular desde diseño y durabilidad.","itemId":"piece-1","evidenceIds":["chunk-own","chunk-wrong","missing"]}]}\n```'
      };
    }
  };

  const result = await reviewContentPlanWithBria({
    planId: 'plan-1',
    getPlan: async () => plan,
    searchMemory: async (request) => {
      calls.search = request;
      return evidence;
    },
    ai,
    now: () => new Date('2026-09-01T15:00:00.000Z')
  });

  assert.equal(calls.search.clientId, 'client-andino');
  assert.equal(calls.ai.model, 'gpt-5.6-luna');
  assert.equal(result.review.findings[0].evidenceIds.length, 1);
  assert.deepEqual(result.review.findings[0].evidenceIds, ['chunk-own']);
  assert.deepEqual(result.evidence.map((item) => item.id), ['chunk-own', 'chunk-legacy-own']);
  assert.equal(result.meta.model, 'gpt-5.6-luna');
  assert.equal(result.meta.reviewedAt, '2026-09-01T15:00:00.000Z');
});

test('content-plan API and editor expose a read-only Bria review workflow', async () => {
  const [routes, editor, panel] = await Promise.all([
    read('src/routes/api/content.js'),
    read('src/components/modules/ContentPlanDetail.jsx'),
    read('src/components/modules/ContentPlan/BriaContentPlanReview.jsx')
  ]);

  assert.match(routes, /plans\/:id\/bria-review/);
  assert.match(routes, /reviewContentPlanWithBria/);
  assert.match(editor, /BriaContentPlanReview/);
  assert.match(panel, /Revisión de Bria/);
  assert.match(panel, /Revisar parrilla/);
  assert.match(panel, /No cambia el contenido/i);
  assert.match(panel, /evidence/);
  assert.match(panel, /sm:|md:|lg:/);
  assert.match(panel, /dark:/);
});
