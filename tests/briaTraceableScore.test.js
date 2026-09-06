import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACEABLE_RUBRIC, parseTraceableReview, calculateTraceableScore, buildTraceableRequest } from '../src/services/briaTraceableScore.js';
import { generateContentPlanReview } from '../src/services/briaContentPlanReviewGenerator.js';

const snapshot = { id: 'plan', client: { id: 'client', name: 'Ejemplo', instructions: '' }, items: [{ id: 'piece', objective: 'Educar', copyText: 'Las flores crece.', captionText: 'Conoce el jardín.' }] };
const raw = () => ({ summary: 'Revisada.', reviewedItemIds: ['piece'], checks: TRACEABLE_RUBRIC.rules.map(rule => ({
  itemId: 'piece', ruleKey: rule.key, outcome: 'PASS', severity: 'NONE', field: 'copyText', quote: 'Las flores crece.', detail: 'Cotejo explícito de este criterio.', recommendation: '', evidenceIds: []
})) });
const parse = data => parseTraceableReview('```json\n' + JSON.stringify(data) + '\n```', snapshot, []);
test('traceable score is based on explicit complete checks, not a model number or missing findings', () => {
  const noContext = raw();
  noContext.checks = noContext.checks.map(check => ({ ...check, outcome: 'NOT_ASSESSABLE', severity: 'NONE', quote: '', detail: 'No hay contexto suficiente.' }));
  assert.equal(calculateTraceableScore(parse(noContext).scoreChecks).score, null);
  assert.throws(() => parse({ ...raw(), checks: [] }), { code: 'BRIA_SCORE_INVALID' });
  const checked = raw();
  checked.checks = checked.checks.map(check => check.ruleKey.startsWith('BRAND_') ? { ...check, outcome: 'NOT_ASSESSABLE', quote: '', detail: 'Falta una guía de marca vigente.' } : check);
  const result = calculateTraceableScore(parse(checked).scoreChecks);
  assert.equal(result.score, 100);
  assert.ok(result.scoreTrace.assessedChecks < result.scoreTrace.totalChecks);
  assert.equal(result.scoreTrace.partial, true);
  assert.equal(result.dimensions.MARCA.assessable, false);
});
test('each deduction has one rule, one piece and an exact source quote; repeated inputs produce identical math', () => {
  const value = raw();
  value.checks[0] = { ...value.checks[0], outcome: 'FAIL', severity: 'WARNING', recommendation: 'Cambiar crece por crecen.' };
  const review = parse(value);
  assert.equal(review.findings.length, 1);
  const result = calculateTraceableScore(review.scoreChecks);
  assert.deepEqual(result, calculateTraceableScore(review.scoreChecks));
  const row = result.scoreTrace.deductions[0];
  assert.equal(row.itemId, 'piece');
  assert.equal(row.ruleKey, value.checks[0].ruleKey);
  assert.equal(row.quote, 'Las flores crece.');
  assert.ok(Math.abs(result.scoreTrace.unroundedScore - (100 - row.points)) < 0.0001);
  assert.equal(result.scoreTrace.rubric.status, 'CANDIDATE');
});
test('unknown IDs, duplicate/omitted checks, invented quotes and unsupported verdicts cannot publish a score', () => {
  for (const invalidJson of ['null', '[]', 'false', '42', '{}']) assert.throws(() => parseTraceableReview(invalidJson, snapshot, []), { code: 'BRIA_SCORE_INVALID' });
  for (const mutate of [
    value => value.checks.pop(), value => value.checks.push(value.checks[0]),
    value => { value.checks[0].itemId = 'foreign'; },
    value => { value.checks[0].quote = 'Invented text'; },
    value => { value.checks[0].evidenceIds = ['foreign-client-source']; },
    value => { value.checks[0].outcome = 'FAIL'; value.checks[0].severity = 'INFO'; }
  ]) { const value = raw(); mutate(value); assert.throws(() => parse(value), { code: 'BRIA_SCORE_INVALID' }); }
});

test('traceable aggregation recomputes exact deductions across batches and resumes only validated checkpoints', async () => {
  const full = { ...snapshot, items: Array.from({ length: 13 }, (_, i) => ({ ...snapshot.items[0], id: `p${i}` })) };
  let saved;
  let calls = 0;
  const ai = { generate: async request => {
    calls++;
    const batch = JSON.parse(request.prompt.split('PARRILLA ACTUAL:\n')[1].split('\n')[0]);
    const value = { summary: 'Lote completo.', reviewedItemIds: batch.items.map(item => item.id), checks: batch.items.flatMap(item => raw().checks.map(check => ({ ...check, itemId: item.id }))) };
    if (batch.items.some(item => item.id === 'p0')) value.checks[0] = { ...value.checks[0], outcome: 'FAIL', severity: 'WARNING', recommendation: 'Corregir.' };
    return { text: JSON.stringify(value) };
  } };
  const result = await generateContentPlanReview({ snapshot: full, analysisHash: 'batch-test', variant: 'traceable', ai, saveCheckpoint: value => { saved = value; } });
  assert.equal(result.review.scoreTrace.totalChecks, 143);
  assert.equal(result.review.scoreTrace.deductions.length, 1);
  assert.ok(Math.abs(result.review.scoreTrace.deductions[0].points - 25 * .5 / 39) < 0.00001);
  assert.equal(calls, 2);
  const cached = await generateContentPlanReview({ snapshot: full, analysisHash: 'batch-test', variant: 'traceable', ai, loadCheckpoint: () => saved });
  assert.equal(calls, 2);
  assert.deepEqual(cached.review.scoreTrace, result.review.scoreTrace);
});
test('traceable candidate is explicit, generated through batched production path without promoting it', async () => {
  const request = buildTraceableRequest({ index: 0, snapshot, itemIds: ['piece'] }, []);
  assert.ok(request.responseSchema.properties.checks);
  assert.match(request.prompt, /No asignes un puntaje/);
  const result = await generateContentPlanReview({ snapshot, evidence: [], analysisHash: 'traceable', variant: 'traceable', ai: { generate: async () => ({ text: JSON.stringify(raw()) }) } });
  assert.equal(result.review.scoreTrace.totalChecks, 11);
  assert.equal(result.review.scope.rubric.version, TRACEABLE_RUBRIC.version);
  assert.equal(result.review.scope.rubric.status, 'CANDIDATE');
});
