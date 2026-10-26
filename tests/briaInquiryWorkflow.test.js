import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';
import { planInquiry, inquiryDeclarations } from '../src/lib/briaInquiry.js';
import { createFullInquiryFixture, runFullInquiryScenario, runAgencyOverviewScenario } from './evals/briaFullInquiryFixture.js';
import { normalizeTools } from '../src/services/openAIClient.js';
import { toolDeclarations } from '../src/lib/briaAssistant.js';

const user = { id: 'u', userId: 'u', role: 'ADMIN' };
const plan = { investigar: true, continuar: false, actualidad: true, localizarTrabajo: true, guardarSeguimiento: true, prepararCambios: false, asunto: 'Entrega del portal', objetivo: 'Determinar riesgo y opciones de la entrega', areas: ['TAREAS'], condiciones: ['La entrega está verificada'] };
const context = { inquiryPlanner: async () => ({ plan }), now: () => new Date('2026-10-24T20:00:00Z') };

test('a semantic conversation-only turn needs neither an operational catalog nor tool execution', async () => {
  let calls = 0, modelCalls = 0;
  const result = await runAssistant({ user, question: 'Gracias, con eso cerramos.', tools: [...briaInvestigationTools, { name: 'consultar_datos', allowed: () => true, parameters: {}, run: async () => { calls++; return { data: {} }; } }],
    context: { inquiryPlanner: async () => ({ plan: { ...plan, investigar: false, guardarSeguimiento: false, soloConversacion: true } }) },
    ai: { generate: async request => { assert.deepEqual(request.tools, []); return modelCalls++ === 0 ? { functionCalls: [{ id: 'unexpected', name: 'consultar_datos', args: {} }] } : { text: 'Listo, quedó cerrado.' }; } }
  });
  assert.equal(result.answer, 'Listo, quedó cerrado.');
  assert.equal(calls, 0);
  assert.equal(result.pendingAction, undefined);
});

test('the intent planner sees the active draft as data so a scope question can stay in its conversation', async () => {
  const pendingAction = { id: 'review-1', status: 'DRAFT', type: 'TASK_DELETE', draft: { reason: 'Trabajo descartado', items: [{ taskId: 't', title: 'Trabajo' }], selection: { filters: { responsable: 'Alex' }, matched: 1 } } };
  let received;
  await runAssistant({ user, question: '¿Incluye lo que no tiene fecha?', tools: briaInvestigationTools, context: { pendingAction, inquiryPlanner: async args => { received = args.pendingAction; return { plan: { investigar: false } }; } }, ai: { generate: async () => ({ text: 'El filtro no excluye los trabajos sin fecha.' }) } });
  assert.deepEqual(received, pendingAction);
  await planInquiry({ question: '¿Incluye lo que no tiene fecha?', pendingAction, history: [], today: '2026-10-26', ai: { generate: async request => {
    assert.deepEqual(JSON.parse(request.input[0].content).borradorActual, pendingAction);
    return { text: JSON.stringify({ ...plan, investigar: false, guardarSeguimiento: false }) };
  } } });
});

test('full catalog and conversation answer an agency overview without inventing a saved case', async () => {
  let step = 0;
  const fixture = createFullInquiryFixture({ generate: async request => {
    if (request.responseSchema) return { text: JSON.stringify({ ...plan, localizarTrabajo: false, guardarSeguimiento: false, compararAlternativas: false, areas: ['CONTEXTO', 'CONTENIDO'], condiciones: [] }) };
    const calls = list => ({ output: [], functionCalls: list.map(([name, args], i) => ({ id: `${step}-${i}`, name, args })) });
    if (step++ === 0) return calls([['cartera_de_operacion', {}], ['buscar_cliente', { nombre: 'Aurora' }]]);
    if (step === 2) return calls([['operacion_de_cliente', { slug: 'aurora' }], ['parrilla_de_cliente', { clientId: 'lifecycle-client' }]]);
    return { text: 'Hay una cuenta con dos piezas aprobadas: una publicada y otra con fecha vencida que aún no se ha publicado. Conviene revisar por qué quedó pendiente.' };
  } }, { overview: true });
  await runAgencyOverviewScenario(fixture);
});

test('saving investigation requires the provider to include every evidence field, including alternative citations', () => {
  const [tool] = normalizeTools(toolDeclarations(briaInvestigationTools.filter(tool => tool.name === 'actualizar_seguimiento')));
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.parameters.required.sort(), Object.keys(tool.parameters.properties).sort());
  assert.ok(tool.parameters.properties.alternativas.items.required.includes('consultas'));
  assert.deepEqual(tool.parameters.properties.accionPreparada.type, ['string', 'null']);
});

test('binding receipt ids never constrains uncertainty prose through a shared schema object', () => {
  const declarations = toolDeclarations(briaInvestigationTools);
  const tool = inquiryDeclarations(declarations, [{ id: 'consulta-actual' }]).find(tool => tool.name === 'actualizar_seguimiento');
  assert.deepEqual(tool.parameters.properties.alternativas.items.properties.consultas.items.enum, ['consulta-actual']);
  assert.deepEqual(tool.parameters.properties.relato.items.properties.consultas.items.enum, ['consulta-actual']);
  assert.equal(tool.parameters.properties.relato.items.properties.texto.enum, undefined);
  assert.equal(tool.parameters.properties.incertidumbres.items.enum, undefined);
  assert.equal(declarations.find(tool => tool.name === 'actualizar_seguimiento').parameters.properties.alternativas.items.properties.consultas.items.enum, undefined);
});

test('an investigation cannot spend its current-work inquiry only on historical memory and end without a saved case', async () => {
  let historyReads = 0, call = 0;
  const result = await runAssistant({ user, question: 'Investiga el compromiso del portal y conserva el seguimiento', maxRounds: 2, context: { ...context },
    tools: [...briaInvestigationTools, { name: 'memoria_de_agencia', allowed: () => true, parameters: {}, run: async () => { historyReads++; return { data: { texto: 'Factura de hace ocho meses' } }; } }],
    ai: { generate: async () => ++call === 1 ? { output: [], functionCalls: [{ id: 'history', name: 'memoria_de_agencia', args: {} }] } : { text: 'No existe información operativa. La factura sugiere riesgo.' } }
  });
  assert.equal(historyReads, 0);
  assert.ok(result.investigation);
  assert.equal(result.investigation.estado, 'ABIERTO');
  assert.ok(result.investigation.pendientesDelRecorrido.length);
  assert.doesNotMatch(result.answer, /factura sugiere|No existe información operativa/);
});

test('investigation intent does not authorize preparing or executing an unrelated change', async () => {
  let writes = 0, call = 0;
  const result = await runAssistant({ user, question: 'Investiga sin actuar', maxRounds: 2, context: { ...context }, tools: [...briaInvestigationTools,
    { name: 'guardar_en_memoria', allowed: () => true, parameters: {}, run: async () => { writes++; return { data: { saved: true } }; } },
    { name: 'preparar_pendiente', allowed: () => true, parameters: {}, run: async () => { writes++; return { data: {} }; } }],
    ai: { generate: async () => ++call === 1 ? { output: [], functionCalls: [{ id: 'write', name: 'guardar_en_memoria', args: {} }, { id: 'prepare', name: 'preparar_pendiente', args: {} }] } : { text: 'Listo' } }
  });
  assert.equal(writes, 0);
  assert.equal(result.pendingAction, undefined);
});

test('task details retain the native privacy boundary, even for an admin', async () => {
  const tool = briaInvestigationTools.find(t => t.name === 'leer_pendiente');
  assert.ok(tool);
  const privateTask = { id: 't', title: 'Visible header', isPrivate: true, creatorId: 'other', assignee: { userId: 'other' }, collaborators: [], viewers: [], comments: 'PRIVATE BODY', taskComments: [] };
  await assert.rejects(tool.run({ id: 't' }, { user, db: { task: { findUnique: async () => privateTask } } }), { status: 403 });
  const result = await tool.run({ id: 't' }, { user: { ...user, id: 'other', userId: 'other' }, db: { task: { findUnique: async () => privateTask } } });
  assert.equal(result.data.tarea.descripcion, 'PRIVATE BODY');
  assert.equal(result.sources[0].kind, 'tarea');
});

test('semantic planning is structured, accounts for usage, and never interprets a malformed plan as authorization', async () => {
  const args = { question: 'Revisa el compromiso', history: [], today: '2026-10-24' };
  const result = await planInquiry({ ...args, ai: { generate: async request => {
    assert.ok(request.responseSchema.required.includes('investigar'));
    assert.deepEqual(request.tools, []);
    return { text: JSON.stringify({ ...plan, compararAlternativas: true }), usage: { input_tokens: 100, output_tokens: 20 }, model: 'fake' };
  } } });
  assert.equal(result.plan.investigar, true);
  assert.ok(result.modelCall.usage);
  const discarded = await planInquiry({ ...args, ai: { generate: async () => ({ text: '{}' }) } });
  assert.equal(discarded.plan, null);
  assert.equal(discarded.diagnostic.code, 'BRIA_INQUIRY_PLAN_INVALID');
});

test('full production catalog resolves the target, preserves checks and reads it again without writes', async () => {
  let step = 0, turn = 0;
  const fixture = createFullInquiryFixture({ generate: async request => {
    if (request.responseSchema) {
      step = 0; turn++;
      return { text: JSON.stringify({ ...plan, continuar: turn > 1, compararAlternativas: true, areas: ['TAREAS', 'ACTIVIDAD', 'CARGA', 'CONTEXTO'] }) };
    }
    const calls = list => ({ output: [], functionCalls: list.map(([name, args], index) => ({ id: `${turn}-${step}-${index}`, name, args })) });
    switch (step++) {
      case 0: return calls([['buscar_cliente', { nombre: 'Aurora' }]]);
      case 1: return calls([['tareas_de_cliente', { clientId: 'lifecycle-client' }], ['actividad_del_equipo', {}], ['carga_del_equipo', {}], ['operacion_de_cliente', { slug: 'aurora' }]]);
      case 2: return calls([['leer_pendiente', { id: 'feature-delivery' }]]);
      case 3: return calls([['actualizar_seguimiento', {
        nueva: turn === 1, asunto: plan.asunto, objetivo: plan.objetivo,
        cobertura: ['TAREAS', 'ACTIVIDAD', 'CARGA', 'CONTEXTO'].map((area, i) => ({ area, estado: 'CONSULTADA', consultas: [`consulta-${i + 1}`, ...(i === 0 ? ['consulta-5'] : [])], motivo: '' })).concat({ area: 'CONTENIDO', estado: 'NO_APLICA', consultas: [], motivo: 'Es desarrollo interno, no una pieza editorial.' }),
        hallazgos: [{ texto: 'La entrega vencía el 20 de octubre; la exportación falla con cuentas sin movimientos.', consultas: ['consulta-5'] }],
        relato: [{ texto: 'La entrega vencía el 20 de octubre y la exportación sigue fallando. Recomiendo validar el caso sin movimientos antes de proponer otro compromiso; dividir la entrega permitiría avanzar con permisos, pero dejaría la exportación pendiente.', consultas: ['consulta-5'] }],
        alternativas: [{ propuesta: 'Validar exportación', beneficio: 'Resolver el fallo', costo: 'Tiempo de pruebas no estimado', incertidumbre: 'Falta estimación', consultas: ['consulta-5'] }, { propuesta: 'Separar entregas', beneficio: 'Entregar permisos antes', costo: 'La exportación espera', incertidumbre: 'Falta aprobación del alcance', consultas: ['consulta-5'] }], recomendada: '1',
        comprobaciones: [{ id: '1', criterio: turn > 1 ? null : 'La entrega pasa las pruebas de aceptación', resultado: 'NO_CUMPLIDO', consultas: ['consulta-5'] }], proximaRevision: 'Cuando se valide el caso sin movimientos'
      }]]);
      default: return { text: 'Investigación guardada.' };
    }
  } });
  await runFullInquiryScenario(fixture);
  assert.equal(fixture.modelRequests.length, 10, 'two plans and eight useful tool rounds; no redundant final generation');
  assert.ok(fixture.modelRequests[1].tools.includes('preparar_pendiente'), 'first selection uses the whole catalog');
  assert.ok(!fixture.modelRequests[2].tools.includes('preparar_pendiente'), 'read-only investigation narrows effects after initial selection');
});
