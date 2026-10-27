import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { planInquiry } from '../src/lib/briaInquiry.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';
import { calculationReceipt } from '../src/lib/briaCalculationCoverage.js';
import { financialEvidence } from '../src/lib/briaFinancialEvidence.js';

const calculation = { id: 'joint', objetivo: 'Saldo conjunto de las dos cuentas solicitadas', alcance: 'SELECCION' };
const plan = { investigar: false, continuar: false, actualidad: true, localizarTrabajo: false, guardarSeguimiento: false,
  prepararCambios: false, compararAlternativas: false, soloConversacion: false, propositoMemoria: 'NINGUNO', asunto: '', objetivo: '', areas: [], condiciones: [], calculosFinancieros: [calculation] };
const data = { items: [{ id: 'a', outstanding: 100.25 }, { id: 'b', outstanding: 200.75 }], totals: { outstandingTotal: 301 } };
const params = { ruta: '/financials/receivables-ledger', idsParaSumar: ['a', 'b'], calculo: { id: 'joint', campo: 'outstandingTotal', moneda: 'COP' } };
const toolsFor = result => [
  ...createBriaPlatformTools({ actions: {}, platform: { call: async () => result } }),
  { name: 'actualizar_seguimiento', allowed: () => true, parameters: {}, run: async () => { throw new Error('unexpected write'); } }
];
const execute = (ai, options = {}) => runAssistant({ question: '¿Cuánto representan juntas?', user: { role: 'ADMIN', modulePermissions: { bria: true } }, today: '2026-10-26',
  context: { inquiryPlanner: async () => ({ plan }) }, tools: toolsFor({ ok: true, data }), ai, ...options });

test('a requested subtotal cannot finish from prose or a historical result; the current authorized calculation completes it', async () => {
  let step = 0;
  const events = [];
  const result = await execute({ generate: async request => {
    if (step++ === 0) { request.onTextDelta?.('Invented 999'); return { text: 'Invented 999', output: [{ type: 'message', content: 'Invented 999' }] }; }
    if (step === 2) {
      assert.ok(!JSON.stringify(request.input).includes('Invented 999'));
      assert.deepEqual(request.tools.find(t => t.name === 'consultar_plataforma').parameters.properties.calculo.properties.id.enum, ['joint']);
      return { functionCalls: [{ id: 'sum', name: 'consultar_plataforma', args: params }] };
    }
    const receipt = JSON.parse(request.input.find(r => r.type === 'function_call_output').output).comprobanteCalculo;
    assert.equal(receipt.importe, '301.00');
    assert.deepEqual(receipt.ids, ['a', 'b']);
    assert.equal(receipt.campo, 'outstandingTotal');
    return { text: 'Juntas suman COP 301.' };
  } }, { onEvent: e => events.push(e), history: [{ role: 'assistant', text: 'Suman 999.', comprobanteCalculo: { id: 'joint' } }] });
  assert.equal(step, 3);
  assert.equal(result.answer, 'Juntas suman COP 301.');
  assert.ok(!events.some(e => e.type === 'delta' && e.text?.includes('999')));
  assert.equal(result.calculos[0].id, 'joint');
});

test('failed, incomplete, wrong currency, wrong field and wrong scope reads cannot satisfy a calculation', async () => {
  for (const [response, args] of [
    [{ ok: false, status: 403, error: 'denied' }, params],
    [{ ok: true, data, truncated: true }, params],
    [{ ok: true, data }, { ...params, idsParaSumar: ['a', 'missing'] }],
    [{ ok: true, data }, { ...params, calculo: { ...params.calculo, moneda: 'USD' } }],
    [{ ok: true, data }, { ...params, calculo: { ...params.calculo, campo: 'paidTotal' } }],
    [{ ok: true, data }, { ...params, idsParaSumar: undefined }],
    [{ ok: true, data }, { ...params, calculo: { ...params.calculo, id: 'unplanned' } }]
  ]) {
    let step = 0;
    const result = await execute({ generate: async () => step++ === 0 ? { functionCalls: [{ id: 'sum', name: 'consultar_plataforma', args }] } : { text: 'Invented 999' } }, { tools: toolsFor(response), maxRounds: 1 });
    assert.ok(!result.answer.includes('999'));
    assert.equal(result.calculos?.length || 0, 0);
    assert.ok(result.failures.some(row => row.code === 'BRIA_CALCULATION_INCOMPLETE'));
  }
});

test('semantic calculation requirements are schema-bound without interpreting trigger words', async () => {
  let request;
  const result = await planInquiry({ question: 'Those two together?', history: [], today: '2026-10-26', ai: { generate: async r => { request = r; return { text: JSON.stringify(plan) }; } } });
  assert.ok(request.responseSchema.required.includes('calculosFinancieros'));
  assert.deepEqual(result.plan.calculosFinancieros, [calculation]);
  for (const invalid of [null, [{ ...calculation, alcance: 'UNKNOWN' }], [calculation, calculation], [{ ...calculation, objetivo: '' }]]) {
    const bad = await planInquiry({ ai: { generate: async () => ({ text: JSON.stringify({ ...plan, calculosFinancieros: invalid }) }) } });
    assert.equal(bad.plan, null);
  }
  const contradictory = await planInquiry({ ai: { generate: async () => ({ text: JSON.stringify({ ...plan, soloConversacion: true }) }) } });
  assert.equal(contradictory.plan, null);
});

test('a selection requires valid amounts in one currency; an unselected source total cannot stand in for it', () => {
  const receipt = (evidence, args = params, requirements = [calculation]) => calculationReceipt({ requirements, call: { name: 'consultar_plataforma', args }, data: { evidenciaNumerica: evidence }, now: new Date('2026-10-26T14:00:00Z') });
  const individual = financialEvidence({ operation: 'GET /financials/receivables-ledger', data, path: params.ruta });
  assert.equal(receipt(individual), null);
  assert.equal(receipt(financialEvidence({ operation: 'GET /financials/receivables-ledger', data: { items: [{ id: 'a', outstanding: null }, { id: 'b', outstanding: 20 }] }, idsParaSumar: ['a', 'b'] })), null);
  const mixed = financialEvidence({ operation: 'GET /financials/records', data: { page: 1, total: 2, items: [{ id: 'a', type: 'INCOME', amount: 10, currency: 'COP' }, { id: 'b', type: 'INCOME', amount: 20, currency: 'USD' }] }, idsParaSumar: ['a', 'b'] });
  assert.equal(receipt(mixed, { ...params, calculo: { ...params.calculo, campo: 'income' } }), null);
});

test('native complete-filter totals may be used with paginated rows, but a source discrepancy cannot be silently accepted', () => {
  const requirement = { ...calculation, alcance: 'TOTAL' };
  const args = { ruta: '/financials/receivables-ledger', calculo: params.calculo };
  const evidence = financialEvidence({ operation: 'GET /financials/receivables-ledger', data, path: args.ruta });
  evidence.alcance.filasCompletas = false;
  const get = () => calculationReceipt({ requirements: [requirement], call: { name: 'consultar_plataforma', args }, data: { evidenciaNumerica: evidence }, now: new Date('2026-10-26T14:00:00Z') });
  assert.equal(get().importe, '301.00');
  evidence.diferencias = [{ campo: 'outstandingTotal', moneda: 'COP' }];
  assert.equal(get(), null);
});

test('a pending calculation prevents saving premature follow-up prose or taking the early completion path', async () => {
  let saved = 0, step = 0;
  const tools = toolsFor({ ok: true, data });
  tools.at(-1).run = async () => { saved++; return {}; };
  const result = await execute({ generate: async () => step++ === 0
    ? { functionCalls: [{ id: 'save', name: 'actualizar_seguimiento', args: {} }] }
    : { text: 'Invented 999' } }, { maxRounds: 1, tools,
    context: { inquiryPlanner: async () => ({ plan: { ...plan, investigar: true, guardarSeguimiento: true, asunto: 'Comparación', objetivo: 'Cálculo y alternativas', condiciones: ['Cifras verificadas'] } }) } });
  assert.equal(saved, 0);
  assert.ok(!result.answer.includes('999'));
});

test('a denied platform tool is never called just because a calculation was requested', async () => {
  let reads = 0;
  const tools = toolsFor({ ok: true, data });
  const platform = tools.find(t => t.name === 'consultar_plataforma');
  platform.allowed = () => false; platform.run = async () => { reads++; return {}; };
  const result = await execute({ generate: async () => ({ functionCalls: [{ id: 'sum', name: 'consultar_plataforma', args: params }] }) }, { tools, maxRounds: 1 });
  assert.equal(reads, 0);
  assert.equal(result.calculos, undefined);
});

test('discarding an invalid plan preserves well-formed calculation restrictions without granting its requested writes', async () => {
  let step = 0;
  const result = await execute({ generate: async request => {
    if (request.responseSchema) return { text: JSON.stringify({ ...plan, continuar: true, prepararCambios: true }) };
    step++;
    assert.ok(!request.tools.some(t => t.name === 'operar_en_plataforma'));
    return { text: 'Invented 999' };
  } }, { context: { inquiryPlanner: planInquiry }, logger: { warn() {}, error() {} } });
  assert.ok(!result.answer.includes('999'));
  assert.ok(result.failures.some(row => row.code === 'BRIA_CALCULATION_INCOMPLETE'));
  assert.equal(step, 2, 'one bounded continuation, no unbounded generation');
  assert.equal(result.pendingAction, undefined);
});
