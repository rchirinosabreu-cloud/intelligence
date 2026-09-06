import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIA_REVIEW_RUBRIC, rubricHash } from '../src/lib/briaReviewRubric.js';
import { buildBriaReviewRequest, generateContentPlanReview } from '../src/services/briaContentPlanReviewGenerator.js';

const snapshot = { id: 'plan', client: { id: 'client', name: 'Cliente ficticio', instructions: '' }, period: '9/2026', items: [{ id: 'piece', objective: 'Educar', copyText: 'Texto completo.', captionText: '' }] };
const dimensions = Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { score: 80, confidence: 0.8, assessable: true, note: 'Comprobado.' }]));
const response = (ids, findings = []) => ({ summary: 'Revisión.', verdict: 'ALINEADA', dimensions, reviewedItemIds: ids, findings });

test('rúbrica candidata conserva pesos, identifica reglas únicas y cambia su huella al editar criterios', () => {
  assert.equal(BRIA_REVIEW_RUBRIC.status, 'CANDIDATE');
  assert.equal(Object.values(BRIA_REVIEW_RUBRIC.weights).reduce((a, b) => a + b), 100);
  assert.equal(new Set(BRIA_REVIEW_RUBRIC.rules.map(rule => rule.key)).size, BRIA_REVIEW_RUBRIC.rules.length);
  assert.notEqual(rubricHash(), rubricHash({ ...BRIA_REVIEW_RUBRIC, version: 'changed' }));
});

test('producción conserva el prompt base y la candidata solo se activa explícitamente', () => {
  const batch = { index: 0, itemIds: ['piece'], snapshot };
  const baseline = buildBriaReviewRequest(batch, []);
  const candidate = buildBriaReviewRequest(batch, [], { variant: 'candidate' });
  assert.equal(baseline.prompt, readFileSync(new URL('./fixtures/briaReviewBaselinePrompt.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd());
  assert.doesNotMatch(baseline.prompt, /RÚBRICA CANDIDATA/);
  assert.match(candidate.prompt, /RÚBRICA CANDIDATA/);
  assert.match(candidate.prompt, /No confundas ausencia de memoria/);
  assert.match(candidate.prompt, /comentario antiguo/);
  assert.match(candidate.prompt, /GRAMMAR_AGREEMENT/);
  assert.equal(candidate.model, baseline.model);
  assert.equal(candidate.maxOutputTokens, baseline.maxOutputTokens);
  assert.throws(() => buildBriaReviewRequest(batch, [], { variant: 'typo' }), /variante/i);
});

test('generador compartido procesa JSON cercado, revisa todas las piezas y filtra referencias ajenas', async () => {
  const full = { ...snapshot, items: Array.from({ length: 13 }, (_, i) => ({ ...snapshot.items[0], id: `p${i}` })) };
  const result = await generateContentPlanReview({ snapshot: full, analysisHash: 'run', evidence: [{ id: 'valid' }], ai: { generate: async request => {
    const ids = JSON.parse(request.prompt.split('PARRILLA ACTUAL:\n')[1].split('\n')[0]).items.map(item => item.id);
    return { text: '```json\n' + JSON.stringify(response(ids, [
      { ruleKey: 'GRAMMAR_AGREEMENT', itemId: ids[0], field: 'copyText', category: 'GRAMATICA', severity: 'WARNING', title: 'Concordancia', evidenceIds: ['valid', 'foreign'] },
      { ruleKey: 'FOREIGN', itemId: 'not-in-plan', evidenceIds: [] }
    ])) + '\n```', model: 'test-model', requestId: 'req', raw: { usage: { input_tokens: 100, output_tokens: 20 } } };
  } } });
  assert.equal(result.review.scope.reviewedItems, 13);
  assert.equal(result.review.score, 80);
  assert.equal(result.review.findings.length, 2);
  assert.deepEqual(result.review.findings[0].evidenceIds, ['valid']);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].usage.input_tokens, 100);
  assert.equal(result.calls[0].rejectedFindingCount, 1);
  assert.equal(result.calls[0].rejectedEvidenceCount, 1);
});

test('generador no publica lote incompleto ni continúa después de abortar', async () => {
  await assert.rejects(generateContentPlanReview({ snapshot, evidence: [], analysisHash: 'run', ai: { generate: async () => ({ text: JSON.stringify(response([])) }) } }), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateContentPlanReview({ snapshot, evidence: [], analysisHash: 'run', signal: controller.signal, ai: { generate: () => assert.fail('No debe llamar al proveedor') } }), { name: 'AbortError' });
});
