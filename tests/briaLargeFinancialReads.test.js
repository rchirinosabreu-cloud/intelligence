import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaPlatformClient, PLATFORM_RESPONSE_LIMIT } from '../src/lib/briaPlatformClient.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';
import { calculationReceipt } from '../src/lib/briaCalculationCoverage.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const route = '/financials/receivables-ledger?year=2026';
const ledger = {
  year: 2026,
  totals: { outstandingTotal: 301 },
  items: [
    { id: 'first', client: { name: 'Cuenta ficticia A' }, outstanding: 100.25, documents: [{ description: 'x'.repeat(PLATFORM_RESPONSE_LIMIT + 1000) }] },
    { id: 'last', client: { name: 'Cuenta ficticia B' }, outstanding: 200.75 }
  ]
};
const response = body => ({ status: 200, headers: { get: () => 'application/json' }, json: async () => body });
const readTool = platform => createBriaPlatformTools({ actions: {}, platform }).find(tool => tool.name === 'consultar_plataforma');
const receipt = (data, ids) => calculationReceipt({
  now: new Date('2026-10-27T22:00:00Z'),
  requirements: [{ id: 'amount', objetivo: 'Saldos solicitados', alcance: ids ? 'SELECCION' : 'TOTAL' }],
  call: { name: 'consultar_plataforma', args: { ruta: route, idsParaSumar: ids, calculo: { id: 'amount', campo: 'outstandingTotal', moneda: 'COP' } } }, data
});

test('complete native JSON supports exact totals and selections beyond a bounded model preview', async () => {
  const calls = [];
  const client = createBriaPlatformClient({ fetchFn: async (_url, init) => { calls.push(init); return response(ledger); } });
  const result = await client.call({ token: 'test', path: route });
  assert.equal(result.truncated, true);
  assert.equal(result.data.items.length, 2);
  for (const ids of [undefined, ['first', 'last'], ['last']]) {
    const { data } = await readTool(client).run({ ruta: route, idsParaSumar: ids }, { session: { token: 'test' } });
    assert.equal(receipt(data, ids)?.importe, ids?.length === 1 ? '200.75' : '301.00');
    assert.equal(data.recortada, true, 'the detail preview remains explicitly partial');
    assert.equal(typeof data.respuesta, 'string');
    assert.ok(data.respuesta.length < PLATFORM_RESPONSE_LIMIT + 100);
    assert.ok(!data.respuesta.includes('Cuenta ficticia B'), 'the last row is outside the preview');
    assert.equal(data.evidenciaNumerica.alcance.recortada, false, 'calculation uses the full parsed body');
    assert.ok(JSON.stringify(data).length < PLATFORM_RESPONSE_LIMIT + 5000, 'the full body must not leak into model input');
  }
  assert.equal(result.jsonBodyComplete, true);
  assert.ok(calls.every(call => call.method === 'GET' && call.headers.Authorization === 'Bearer test'));
  const missing = await readTool(client).run({ ruta: route, idsParaSumar: ['last', 'absent'] }, { session: { token: 'test' } });
  assert.equal(receipt(missing.data, ['last', 'absent']), null);
});

test('a preview flag alone never proves complete source data, and permissions still gate evidence', async () => {
  for (const result of [
    { ok: true, data: ledger, truncated: true, text: 'partial' },
    { ok: true, data: ledger, truncated: true, jsonBodyComplete: false, text: 'partial' },
    { ok: false, status: 403, error: 'denied', data: ledger, jsonBodyComplete: true }
  ]) {
    const { data } = await readTool({ call: async () => result }).run({ ruta: route }, { session: { token: 'test' } });
    assert.equal(receipt(data), null);
  }
});

test('malformed JSON cannot attest a complete body or satisfy a calculation', async () => {
  const client = createBriaPlatformClient({ fetchFn: async () => ({ ...response(null), json: async () => { throw new SyntaxError('incomplete'); } }) });
  assert.equal((await client.call({ token: 'test', path: route })).jsonBodyComplete, false);
  const { data } = await readTool(client).run({ ruta: route }, { session: { token: 'test' } });
  assert.equal(receipt(data), null);
});

test('the assistant completes both current calculation requirements using large native reads without forwarding the full ledger', async () => {
  const client = createBriaPlatformClient({ fetchFn: async () => response(ledger) });
  const requirements = [
    { id: 'total', objetivo: 'Total de cartera', alcance: 'TOTAL' },
    { id: 'subset', objetivo: 'Saldo de la cuenta identificada', alcance: 'SELECCION' }
  ];
  let step = 0;
  const result = await runAssistant({
    question: 'Total y saldo de la cuenta identificada', today: '2026-10-27',
    user: { role: 'ADMIN', modulePermissions: { bria: true } },
    context: { session: { token: 'test' }, inquiryPlanner: async () => ({ plan: { investigar: false, continuar: false, actualidad: true,
      localizarTrabajo: false, guardarSeguimiento: false, prepararCambios: false, compararAlternativas: false,
      soloConversacion: false, propositoMemoria: 'NINGUNO', asunto: '', objetivo: '', areas: [], condiciones: [], calculosFinancieros: requirements } }) },
    tools: [...createBriaPlatformTools({ actions: {}, platform: client }),
      { name: 'actualizar_seguimiento', allowed: () => true, parameters: {}, run: async () => assert.fail('no write requested') }],
    ai: { generate: async request => {
      if (step++ === 0) return { functionCalls: requirements.map(item => ({ id: item.id, name: 'consultar_plataforma',
        args: { ruta: route, ...(item.id === 'subset' ? { idsParaSumar: ['last'] } : {}), calculo: { id: item.id, campo: 'outstandingTotal', moneda: 'COP' } } })) };
      const outputs = request.input.filter(row => row.type === 'function_call_output').map(row => JSON.parse(row.output));
      assert.equal(outputs.length, 2);
      assert.ok(outputs.every(row => row.comprobanteCalculo), JSON.stringify(outputs.map(row => ({ keys: Object.keys(row), error: row.error }))));
      assert.deepEqual(outputs.map(row => row.comprobanteCalculo.importe), ['301.00', '200.75']);
      assert.ok(outputs.every(row => JSON.stringify(row).length < PLATFORM_RESPONSE_LIMIT + 6000));
      return { text: 'Total: COP 301. La cuenta seleccionada: COP 200,75.' };
    } }
  });
  assert.equal(result.calculos.length, 2);
  assert.equal(result.answer, 'Total: COP 301. La cuenta seleccionada: COP 200,75.');
  assert.equal(step, 2);
});
