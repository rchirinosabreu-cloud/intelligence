import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeBriaReview, summarizeBriaEvaluation, validateBriaEvaluationCases, runBriaReviewEvaluation } from '../src/evals/briaReviewEvaluation.js';
import { briaReviewCases } from '../evals/bria/editorial-cases.js';

const expected = { ruleKey: 'GRAMMAR_AGREEMENT', itemId: 'p1', field: 'copyText' };
const dimensions = Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { score: 100, confidence: 0.9, assessable: true, note: 'Texto revisado.' }]));
const example = () => ({ id: 'case', source: { kind: 'synthetic', labels: 'DRAFT' }, snapshot: { id: 'plan', client: { id: 'client' }, items: [{ id: 'p1', copyText: 'Las tarea está lista.' }] }, evidence: [], expected: { required: [expected], forbidden: [], exhaustive: false, scoreBands: {}, assessable: {} } });
const review = findings => ({ findings, dimensions, score: 100, scope: { reviewedItemIds: ['p1'], complete: true } });

test('unscored traceable results never imply perfect numeric score stability', () => {
  const runs = [null, 100].map(score => ({ caseId: 'missing-score', status: 'SUCCESS', review: { ...review([]), score }, calls: [], grade: gradeBriaReview(example(), review([])) }));
  assert.equal(summarizeBriaEvaluation(runs).stability[0].scoreSpread, null);
});

test('casos sintéticos tienen etiquetas de borrador, IDs únicos y al menos 32 escenarios positivos/negativos', () => {
  assert.ok(briaReviewCases.length >= 32);
  validateBriaEvaluationCases(briaReviewCases);
  assert.ok(briaReviewCases.every(item => item.source.kind === 'synthetic' && item.source.labels === 'DRAFT'));
  assert.ok(briaReviewCases.some(item => item.expected.required.length));
  assert.ok(briaReviewCases.some(item => item.expected.forbidden.length));
});

test('identificadores enviados al modelo no revelan el nombre ni el resultado esperado del caso', () => {
  for (const sample of briaReviewCases) {
    assert.ok(!JSON.stringify({ snapshot: sample.snapshot, evidence: sample.evidence }).includes(sample.id));
  }
});

test('calificador no cuenta duplicados como aciertos ni observaciones no etiquetadas como falsos positivos', () => {
  const grade = gradeBriaReview(example(), review([expected, expected, { ...expected, ruleKey: 'OTHER_GRAMATICA' }]));
  assert.equal(grade.tp, 1); assert.equal(grade.fn, 0); assert.equal(grade.fp, 0);
  assert.equal(grade.duplicateCount, 1); assert.equal(grade.unadjudicated, 1);
  assert.equal(grade.precision, null); // Gold incompleto: no inventar una precisión perfecta.
});

test('calificador distingue errores exigidos, falsos positivos explícitos, dimensión no evaluable y rango de puntaje', () => {
  const sample = example(); sample.expected.forbidden = [{ ...expected, ruleKey: 'BRAND_VOICE' }];
  sample.expected.assessable = { MARCA: false }; sample.expected.scoreBands = { GRAMATICA: [75, 89] };
  const grade = gradeBriaReview(sample, review(sample.expected.forbidden));
  assert.equal(grade.fn, 1); assert.equal(grade.fp, 1);
  assert.equal(grade.scoreBandChecks[0].passed, false);
  assert.equal(grade.assessabilityChecks[0].passed, false);
});

test('etiquetas exhaustivas permiten precisión y penalizan hallazgos extra; ausencia de positivos no equivale a recall 100%', () => {
  const sample = example(); sample.expected.exhaustive = true;
  const grade = gradeBriaReview(sample, review([expected, { ...expected, ruleKey: 'OTHER_GRAMATICA' }]));
  assert.equal(grade.precision, 0.5); assert.equal(grade.recall, 1);
  sample.expected.required = [];
  assert.equal(gradeBriaReview(sample, review([])).recall, null);
});

test('coincidencias generales y específicas se asignan uno a uno sin depender del orden', () => {
  const sample = example();
  sample.expected.required = [{ ruleKey: expected.ruleKey }, { ...expected }];
  const findings = [expected, { ...expected, itemId: 'p2' }];
  const grade = gradeBriaReview(sample, review(findings));
  assert.equal(grade.tp, 2); assert.equal(grade.fn, 0);
  assert.equal(gradeBriaReview(sample, review(findings.reverse())).tp, 2);
});

test('validador rechaza evidencia de otro cliente, IDs repetidos y etiquetas ajenas', () => {
  const sample = example();
  assert.throws(() => validateBriaEvaluationCases([sample, sample]), /ID/);
  assert.throws(() => validateBriaEvaluationCases([{ ...sample, evidence: [{ id: 'e', clientId: 'other', content: 'Privado' }] }]), /cliente/);
  sample.expected.required[0] = { ...expected, itemId: 'foreign' };
  assert.throws(() => validateBriaEvaluationCases([sample]), /pieza/);
});

test('validador rechaza etiquetas duplicadas o contradictorias para no inflar las métricas', () => {
  const duplicated = example(); duplicated.expected.required.push({ ...expected });
  assert.throws(() => validateBriaEvaluationCases([duplicated]), /duplicadas/);
  const contradictory = example(); contradictory.expected.forbidden = [{ ruleKey: expected.ruleKey }];
  assert.throws(() => validateBriaEvaluationCases([contradictory]), /contradictorias/);
});

test('ejecutor usa generación real compartida sin enviar respuestas esperadas al modelo y registra trazabilidad', async () => {
  const sample = example(); sample.expected.comment = 'SECRET_GOLD_NOT_FOR_MODEL';
  let calls = 0;
  const result = await runBriaReviewEvaluation({ cases: [sample], repeats: 2, maxCalls: 2, ai: { generate: async request => {
    assert.doesNotMatch(request.prompt, /SECRET_GOLD_NOT_FOR_MODEL/); calls++;
    return { text: '```json\n' + JSON.stringify({ summary: 'Revisión.', verdict: 'ALINEADA', dimensions, findings: [], reviewedItemIds: ['p1'] }) + '\n```', model: 'controlled-test', requestId: `r${calls}`, raw: { usage: { input_tokens: 10, output_tokens: 5 } } };
  } } });
  assert.equal(calls, 2); assert.equal(result.runs.length, 2);
  assert.equal(result.summary.successfulRuns, 2); assert.equal(result.summary.tokens.input, 20);
  assert.equal(result.summary.stability[0].scoreSpread, 0);
  assert.equal(result.runs[0].grade.fn, 1);
  assert.equal(result.runs[0].calls[0].requestId, 'r1');
  assert.match(result.datasetHash, /^[a-f0-9]{64}$/);
  assert.equal(result.decision, 'NEEDS_HUMAN_CALIBRATION');
});

test('presupuesto se valida antes de llamar al modelo, incluyendo lotes y repeticiones', async () => {
  const sample = example(); sample.snapshot.items = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}` }));
  await assert.rejects(runBriaReviewEvaluation({ cases: [sample], repeats: 2, maxCalls: 3, ai: { generate: () => assert.fail('No gastar') } }), /presupuesto/);
  await assert.rejects(runBriaReviewEvaluation({ cases: [example()], repeats: 0, ai: {} }), /repeticiones/);
});

test('fallos no desaparecen de las métricas y una sola repetición no demuestra estabilidad', async () => {
  const result = await runBriaReviewEvaluation({ cases: [example()], ai: { generate: async () => ({ text: '{}' }) } });
  assert.equal(result.summary.failedRuns, 1); assert.equal(result.summary.contractSuccessRate, 0);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.stability[0].findingAgreement, null);
  assert.equal(result.runs[0].error.code, 'BRIA_REVIEW_INCOMPLETE_BATCH');
});

test('baseline no simula comparabilidad de ruleKeys libres con catálogo candidato', async () => {
  const result = await runBriaReviewEvaluation({ cases: [example()], variant: 'baseline', ai: { generate: async () => ({ text: JSON.stringify({ summary: 'Revisión.', verdict: 'ALINEADA', dimensions, findings: [], reviewedItemIds: ['p1'] }) }) } });
  assert.equal(result.runs[0].grade.ruleMetricsComparable, false);
  assert.equal(result.summary.recall, null);
});

test('resumen mide variación entre repeticiones, no entre clientes, y no oculta ejecuciones incompletas', () => {
  const runs = [
    { caseId: 'one', status: 'SUCCESS', review: review([expected]), grade: { tp: 1, fp: 0, fn: 0, unadjudicated: 0, ruleMetricsComparable: true }, calls: [] },
    { caseId: 'one', status: 'SUCCESS', review: { ...review([]), score: 80 }, grade: { tp: 0, fp: 0, fn: 1, unadjudicated: 0, ruleMetricsComparable: true }, calls: [] }
  ];
  const summary = summarizeBriaEvaluation(runs);
  assert.equal(summary.stability[0].scoreSpread, 20); assert.equal(summary.stability[0].findingAgreement, 0);
});

test('descuentos sin defecto asociado se señalan, no se convierten en puntajes inventados', () => {
  const output = review([]);
  output.dimensions = { ...dimensions, GRAMATICA: { ...dimensions.GRAMATICA, score: 84 }, MARCA: { ...dimensions.MARCA, score: 0, assessable: false } };
  const grade = gradeBriaReview(example(), output);
  assert.deepEqual(grade.unsupportedDeductions, ['GRAMATICA']);
  assert.equal(output.dimensions.GRAMATICA.score, 84);
  assert.deepEqual(gradeBriaReview(example(), output, { ruleMetricsComparable: false }).unsupportedDeductions, null);
  const summary = summarizeBriaEvaluation([{ caseId: 'case', status: 'SUCCESS', review: output, grade, calls: [] }]);
  assert.equal(summary.unsupportedDeductionRuns, 1);
});
