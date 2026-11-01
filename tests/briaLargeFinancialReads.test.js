import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaPlatformClient, PLATFORM_RESPONSE_LIMIT } from '../src/lib/briaPlatformClient.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { unsupportedFigures } from '../src/lib/briaFigures.js';

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
// El importe exacto que la evidencia numérica acredita para el campo pedido: null si la fuente está recortada,
// la selección incompleta o el campo no está. Es lo que antes comprobaba el recibo del planificador.
const receipt = (data, ids) => {
  const evidence = data?.evidenciaNumerica;
  if (!evidence || evidence.alcance?.recortada || !evidence.operacion) return null;
  if (ids) {
    const selection = evidence.seleccion;
    if (!selection?.completa || selection.idsNoDisponibles?.length || selection.idsEncontrados?.length !== ids.length) return null;
    return selection.sumasExactas.find(row => row.campo === 'outstandingTotal' && row.moneda === 'COP') || null;
  }
  return evidence.totalesFuente.find(row => row.campo === 'outstandingTotal' && row.moneda === 'COP') || null;
};

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

test('the catalog exposes native ledger filters so a clipped preview can be narrowed without inventing routes', async () => {
  const tools = createBriaPlatformTools({ actions: {}, platform: {} });
  const { data } = await tools.find(tool => tool.name === 'mapa_de_plataforma').run({ busqueda: 'receivables-ledger' });
  const ledgerOperation = data.operaciones.find(row => row.operacion === 'GET /financials/receivables-ledger');
  for (const field of ['year', 'month', 'quarter', 'q']) assert.ok(ledgerOperation.campos?.includes(field));
});

test('the assistant answers a total and a subtotal from large native reads without forwarding the full ledger, and its figures trace to them', async () => {
  const client = createBriaPlatformClient({ fetchFn: async () => response(ledger) });
  let step = 0;
  const outputs = [];
  const result = await runAssistant({
    question: 'Total y saldo de la cuenta identificada', today: '2026-10-27',
    user: { role: 'ADMIN', modulePermissions: { bria: true } },
    context: { session: { token: 'test' } },
    tools: [...createBriaPlatformTools({ actions: {}, platform: client }),
      { name: 'actualizar_seguimiento', allowed: () => true, parameters: {}, run: async () => assert.fail('no write requested') }],
    ai: { generate: async request => {
      if (step++ === 0) return { functionCalls: [{ id: 'total', name: 'consultar_plataforma', args: { ruta: route } }, { id: 'subset', name: 'consultar_plataforma', args: { ruta: route, idsParaSumar: ['last'] } }] };
      outputs.push(...request.input.filter(row => row.type === 'function_call_output').map(row => JSON.parse(row.output)));
      assert.equal(outputs.length, 2);
      assert.deepEqual([receipt(outputs[0])?.importe, receipt(outputs[1], ['last'])?.importe], ['301.00', '200.75']);
      assert.ok(outputs.every(row => JSON.stringify(row).length < PLATFORM_RESPONSE_LIMIT + 6000));
      return { text: 'Total: COP 301. La cuenta seleccionada: COP 200,75. Juntas no llegan a 1.000.' };
    } }
  });
  assert.equal(result.answer, 'Total: COP 301. La cuenta seleccionada: COP 200,75. Juntas no llegan a 1.000.');
  assert.equal(step, 2, 'figures that come from the reads are delivered without another generation');
  assert.deepEqual(unsupportedFigures(result.answer, outputs.map(row => JSON.stringify(row))), []);
  assert.deepEqual(unsupportedFigures('Juntas suman 50.175.', outputs.map(row => JSON.stringify(row))), ['50.175'], 'an invented subtotal is detectable');
});
