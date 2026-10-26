import test from 'node:test';
import assert from 'node:assert/strict';
import { planInquiry } from '../src/lib/briaInquiry.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const plan = { investigar: true, continuar: false, actualidad: true, localizarTrabajo: false,
  guardarSeguimiento: false, prepararCambios: false, compararAlternativas: false, soloConversacion: false,
  propositoMemoria: 'CORREGIR', asunto: 'Revisar compromisos', objetivo: 'Priorizar con el acuerdo corregido', areas: [], condiciones: [] };
const tool = (name, run) => ({ name, allowed: () => true, parameters: {}, run });

test('semantic planning distinguishes human memory correction from operational permission', async () => {
  const result = await planInquiry({ question: 'Octubre era solo una propuesta. Revisa el orden teniendo eso presente.', history: [], today: '2026-10-26', ai: { generate: async request => {
    assert.ok(request.responseSchema.required.includes('propositoMemoria'));
    return { text: '```json\n' + JSON.stringify(plan) + '\n```' };
  } } });
  assert.equal(result.plan.propositoMemoria, 'CORREGIR');
  for (const changed of [{ propositoMemoria: 'EJECUTAR' }, { soloConversacion: true }]) {
    const invalid = await planInquiry({ ai: { generate: async () => ({ text: JSON.stringify({ ...plan, investigar: false, ...changed }) }) } });
    assert.equal(invalid.plan, null);
  }
});

test('investigation can remember a human correction without authorizing retirement or operational changes', async () => {
  const effects = [], requests = [];
  const tools = ['actualizar_seguimiento', 'guardar_en_memoria', 'retirar_de_memoria', 'preparar_pendiente'].map(name => tool(name, async (_args, context) => {
    effects.push(name);
    if (name === 'guardar_en_memoria') {
      assert.equal(context.memoryIntent, 'CORREGIR');
      assert.equal(context.question, 'La cuenta no renovó octubre. Revisa la prioridad.');
      return { data: { saved: true, hecho: { id: 'f1' } } };
    }
    return { data: {} };
  }));
  const result = await runAssistant({ user: {}, question: 'La cuenta no renovó octubre. Revisa la prioridad.', tools,
    context: { inquiryPlanner: async () => ({ plan }), memoryIntent: 'RETIRAR' },
    ai: { generate: async request => {
      requests.push(request);
      return requests.length === 1
        ? { functionCalls: ['guardar_en_memoria', 'retirar_de_memoria', 'preparar_pendiente'].map((name, i) => ({ id: String(i), name, args: {} })) }
        : { text: 'Guardé la aclaración de octubre; no cambié tareas.' };
    } }
  });
  assert.deepEqual(effects, ['guardar_en_memoria']);
  assert.ok(requests[1].tools.some(row => row.name === 'guardar_en_memoria'));
  assert.ok(!requests[1].tools.some(row => row.name === 'retirar_de_memoria'));
  assert.ok(!requests[1].tools.some(row => row.name === 'preparar_pendiente'));
  assert.equal(result.pendingAction, undefined);
});

test('a memory request cannot finish by merely promising to remember without a persistence receipt', async () => {
  let calls = 0, saved = 0;
  const result = await runAssistant({ user: {}, question: 'La parrilla de octubre no fue contratada; tenlo presente.',
    context: { inquiryPlanner: async () => ({ plan: { ...plan, investigar: false } }) },
    tools: [tool('actualizar_seguimiento', async () => ({})), tool('guardar_en_memoria', async () => { saved++; return { data: { saved: true } }; })],
    ai: { generate: async () => {
      calls++;
      if (calls === 1) return { text: 'Lo recordaré.' };
      if (calls === 2) return { functionCalls: [{ id: 'save', name: 'guardar_en_memoria', args: {} }] };
      return { text: 'Guardé que octubre no estaba contratado.' };
    } }
  });
  assert.equal(saved, 1);
  assert.equal(result.answer, 'Guardé que octubre no estaba contratado.');
});

test('an ordinary question never authorizes an unsolicited memory write', async () => {
  let saved = 0, call = 0;
  const result = await runAssistant({ user: {}, question: '¿Octubre está contratado?',
    context: { inquiryPlanner: async () => ({ plan: { ...plan, investigar: false, propositoMemoria: 'NINGUNO' } }) },
    tools: [tool('actualizar_seguimiento', async () => ({})), tool('guardar_en_memoria', async () => { saved++; return { data: { saved: true } }; })],
    ai: { generate: async () => ++call === 1 ? { functionCalls: [{ id: 'invented', name: 'guardar_en_memoria', args: {} }] } : { text: 'Necesito consultar el acuerdo.' } }
  });
  assert.equal(saved, 0);
  assert.deepEqual(result.toolsUsed, []);
});

test('a correction waits for the model to receive account memory before writing, even when also investigating current work', async () => {
  let saved = 0, step = 0;
  const question = 'Octubre era solo una propuesta. Revisa los compromisos.';
  const write = { id: 'save', name: 'guardar_en_memoria', args: { clientId: 'c', entidad: 'Cuenta', request: { intent: 'CORRECT' } } };
  const tools = [tool('actualizar_seguimiento', async () => ({})),
    tool('memoria_de_la_agencia', async () => ({ data: { hechos: [{ id: 'old' }] } })),
    tool('guardar_en_memoria', async () => { saved++; return { data: { saved: true } }; })];
  await runAssistant({ user: {}, question, tools, context: { inquiryPlanner: async () => ({ plan: { ...plan, localizarTrabajo: true } }) },
    ai: { generate: async request => {
      if (step++ === 0) return { functionCalls: [write] };
      if (step === 2) { assert.equal(saved, 0); return { functionCalls: [{ id: 'read', name: 'memoria_de_la_agencia', args: { clientId: 'c' } }, write] }; }
      if (step === 3) {
        assert.equal(saved, 0, 'issuing read and write together cannot use evidence the model has not received');
        const receipt = request.input.find(item => item.type === 'function_call_output' && item.call_id === 'read');
        assert.ok(receipt && JSON.parse(receipt.output).hechos.some(row => row.id === 'old'));
        return { functionCalls: [{ ...write, id: 'save-after-reading' }] };
      }
      return { text: 'La aclaración quedó guardada; falta comprobar el trabajo actual.' };
    } }
  });
  assert.equal(saved, 1);
});
