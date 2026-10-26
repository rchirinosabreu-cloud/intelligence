import test from 'node:test';
import assert from 'node:assert/strict';
import * as assistant from '../src/lib/briaAssistant.js';
import { createBriaPlatformTools } from '../src/services/briaPlatformTools.js';

const now = new Date('2026-10-27T02:30:00Z'); // Aún es lunes en Bogotá.
const today = '2026-10-26';

test('tool date context distinguishes today from future and never treats an ISO instant prefix as its native day', async () => {
  let step = 0;
  const data = {
    fechas: ['2026-10-25', today, '2026-10-27', '2026-02-30'],
    evento: '2026-10-28T02:00:00Z',
    texto: 'Un documento menciona 2026-10-29 sin definir un plazo.',
    plazos: { entrega: { fecha: today } }
  };
  const response = await assistant.runAssistant({
    user: { role: 'ADMIN' }, person: { name: 'Alex' }, question: '¿Qué vence hoy?', today,
    context: { now: () => now },
    tools: [{ name: 'consultar_fechas', allowed: () => true, parameters: {}, run: async () => ({ data }) }],
    ai: { generate: async request => {
      if (step++ === 0) return { functionCalls: [{ id: 'dates', name: 'consultar_fechas', args: {} }] };
      const output = JSON.parse(request.input.find(row => row.type === 'function_call_output').output);
      assert.equal(output.contextoTemporal.hoy, today);
      assert.equal(output.contextoTemporal.zonaHoraria, 'America/Bogota');
      assert.deepEqual(output.contextoTemporal.fechas, {
        '2026-10-25': { relacionConHoy: 'PASADO' },
        '2026-10-26': { relacionConHoy: 'HOY' },
        '2026-10-27': { relacionConHoy: 'FUTURO' }
      });
      assert.deepEqual(output.fechas, data.fechas, 'the evidence does not rewrite source fields');
      assert.equal(output.evento, data.evento);
      return { text: 'La entrega es hoy. La publicación de mañana todavía no está vencida.' };
    } }
  });
  assert.equal(response.answer, 'La entrega es hoy. La publicación de mañana todavía no está vencida.');
});

test('grounding survives the final round without adding a template or truncating the model answer', async () => {
  const prose = 'Revisaría primero la entrega de hoy: el detalle muestra que falta una validación breve. La conciliación puede esperar hasta mañana sin perder el compromiso registrado.';
  const result = await assistant.runAssistant({
    user: { role: 'ADMIN' }, question: '¿Qué hago primero?', today, maxRounds: 0,
    ai: { generate: async request => {
      assert.deepEqual(request.tools, []);
      assert.match(request.instructions, /opción.*aplaz|dejarías esperando/u);
      assert.match(request.instructions, /evidenciaNumerica/u);
      assert.match(request.instructions, /contextoTemporal/u);
      return { text: prose };
    } }
  });
  assert.equal(result.answer, prose);
  assert.equal(result.pendingAction, undefined);
});

test('authorized platform reads carry computed money evidence without replacing the source or hiding its discrepancy', async () => {
  const data = { year: 2026, items: [
    { id: 'one', amount: 3200000.11, outstanding: 3200000.11, currency: 'COP' },
    { id: 'two', amount: 375500.02, outstanding: 375500.02, currency: 'COP' }
  ], totals: { outstandingTotal: 3575500.14 } };
  let called;
  const tool = createBriaPlatformTools({ actions: {}, platform: { call: async args => { called = args; return { ok: true, data }; } } }).find(row => row.name === 'consultar_plataforma');
  const result = await tool.run({ ruta: '/financials/receivables-ledger?year=2026&month=10' }, { session: { token: 'fictional-session' }, now: () => now });
  assert.equal(called.token, 'fictional-session');
  assert.equal(called.method, 'GET');
  assert.deepEqual(result.data.respuesta, data);
  const evidence = result.data.evidenciaNumerica;
  assert.equal(evidence.sumasFilasVisibles.find(row => row.campo === 'outstandingTotal').importe, '3575500.13');
  assert.equal(evidence.diferencias[0].diferencia, '0.01');
  assert.deepEqual(evidence.alcance.filtrosSolicitados, { year: '2026', month: '10' });
});

test('failed or truncated financial reads never fabricate complete numeric evidence', async () => {
  let next = { ok: false, status: 403, error: 'Acceso denegado', data: { items: [{ amount: 900 }] } };
  const tool = createBriaPlatformTools({ actions: {}, platform: { call: async () => next } }).find(row => row.name === 'consultar_plataforma');
  const args = { ruta: '/financials/receivables-ledger' };
  assert.equal((await tool.run(args, {})).data.evidenciaNumerica, undefined);
  next = { ok: true, truncated: true, data: { items: [{ amount: 900, outstanding: 900 }] } };
  const result = await tool.run(args, {});
  assert.equal(result.data.evidenciaNumerica.alcance.filasCompletas, false);
  assert.equal(result.data.evidenciaNumerica.alcance.recortada, true);
});

test('requested financial subtotals select current row identities and never change the API filter or source total', async () => {
  let requested;
  const data = { items: [{ id: 'a', outstanding: 1200.25 }, { id: 'b', outstanding: 800.75 }, { id: 'c', outstanding: 500 }], totals: { outstandingTotal: 2501 } };
  const tool = createBriaPlatformTools({ actions: {}, platform: { call: async args => { requested = args; return { ok: true, data }; } } }).find(row => row.name === 'consultar_plataforma');
  const result = await tool.run({ ruta: '/financials/receivables-ledger?month=10', idsParaSumar: ['a', 'b'] }, {});
  assert.equal(requested.path, '/financials/receivables-ledger?month=10');
  assert.equal(result.data.respuesta.totals.outstandingTotal, 2501);
  assert.equal(result.data.evidenciaNumerica.seleccion.completa, true);
  assert.equal(result.data.evidenciaNumerica.seleccion.sumasExactas.find(row => row.campo === 'outstandingTotal').importe, '2001.00');
});
