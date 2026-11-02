import test from 'node:test';
import assert from 'node:assert/strict';
import { unsupportedFigures } from '../src/lib/briaFigures.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const user = { id: 'u', userId: 'u', role: 'ADMIN' };
const tool = (name, run) => ({ name, allowed: () => true, parameters: {}, run });

test('a figure counts as supported in any of its written forms when the data holds it', () => {
  const evidence = [JSON.stringify({ outstandingTotal: 1200000, items: [{ outstanding: 200.75 }, { outstanding: 301 }], when: '2026-10-31' })];
  assert.deepEqual(unsupportedFigures('Deben $1.200.000; una cuenta tiene 200,75 y otra 301,00. Es de 2026.', evidence), []);
  assert.deepEqual(unsupportedFigures('Deben $1 200 000 en total.', evidence), []);
  assert.deepEqual(unsupportedFigures('Suman $1.400.750 entre las dos.', evidence), ['1.400.750']);
});

test('short numbers, years and figures the person wrote are never flagged', () => {
  assert.deepEqual(unsupportedFigures('Hay 83 vencidas, 12 por cuenta, en 2026 y para el 2027.', []), []);
  assert.deepEqual(unsupportedFigures('Como dijiste, el tope es 4.500.000.', ['¿Cabe en 4.500.000?']), []);
  assert.deepEqual(unsupportedFigures('', ['9999']), []);
});

test('an unsourced figure goes back to the model once; the answer is never replaced by a fixed text', async () => {
  let step = 0, reads = 0;
  const requests = [];
  const result = await runAssistant({ user, question: '¿Cuánto nos deben?', tools: [tool('consultar_plataforma', async () => { reads++; return { data: { totals: { outstandingTotal: 4500000 } } }; })],
    ai: { generate: async request => {
      requests.push(request);
      if (step++ === 0) return { text: 'Nos deben $4.500.000.', output: [{ type: 'message', content: 'x' }] };
      if (step === 2) return { functionCalls: [{ id: 'read', name: 'consultar_plataforma', args: { ruta: '/financials/receivables-ledger' } }] };
      return { text: 'Nos deben $4.500.000 según cartera.' };
    } }, logger: { warn() {}, error() {} } });
  assert.equal(reads, 1);
  assert.equal(result.answer, 'Nos deben $4.500.000 según cartera.');
  assert.match(requests[1].input.at(-1).content, /4\.500\.000/);
  assert.deepEqual(result.failures, []);
});

test('a figure the model keeps without evidence is delivered and recorded, not swallowed', async () => {
  let step = 0;
  const result = await runAssistant({ user, question: '¿Cuánto nos deben?', tools: [tool('consultar_plataforma', async () => ({ data: { totals: { outstandingTotal: 1 } } }))],
    ai: { generate: async () => step++ === 0 ? { text: 'Nos deben $4.500.000.' } : { text: 'Calculo que son $4.500.000.' } }, logger: { warn() {}, error() {} } });
  assert.equal(step, 2);
  assert.equal(result.answer, 'Calculo que son $4.500.000.');
  assert.ok(result.failures.some(row => row.code === 'BRIA_UNSOURCED_FIGURE'));
});
