import test from 'node:test';
import assert from 'node:assert/strict';
import { planInquiry } from '../src/lib/briaInquiry.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';

const overview = { investigar: true, continuar: false, actualidad: true, localizarTrabajo: false,
  guardarSeguimiento: false, prepararCambios: false, compararAlternativas: false,
  asunto: 'Estado de la agencia', objetivo: 'Revisar trabajo y cumplimiento editorial', areas: ['TAREAS'], condiciones: [] };
const planned = (text, extra = {}) => planInquiry({ question: '¿Cómo va el trabajo y qué entregas están en riesgo?', history: [], today: '2026-10-25',
  ai: { generate: async () => ({ text, model: 'fixture', usage: { input_tokens: 20, output_tokens: 10 } }) }, ...extra });

test('an overview is valid without resolution conditions or a saved follow-up', async () => {
  const result = await planned(JSON.stringify(overview));
  assert.deepEqual(result.plan, overview);
  assert.equal(result.diagnostic, undefined);
  assert.ok(result.modelCall.usage);
});

test('continuing an existing follow-up uses its original conditions instead of demanding new ones', async () => {
  const existing = { comprobaciones: [{ id: 'delivery', criterio: 'La entrega está validada' }] };
  const result = await planned(JSON.stringify({ ...overview, continuar: true, guardarSeguimiento: true }), { investigation: existing });
  assert.equal(result.plan.continuar, true);
  assert.deepEqual(existing.comprobaciones, [{ id: 'delivery', criterio: 'La entrega está validada' }]);
  const missing = await planned(JSON.stringify({ ...overview, guardarSeguimiento: true }));
  assert.equal(missing.plan, null);
  assert.equal(missing.diagnostic.code, 'BRIA_INQUIRY_PLAN_INVALID');
  assert.equal(missing.diagnostic.reason, 'MISSING_RESOLUTION_CONDITIONS');
});

test('malformed plans degrade without retaining model authorization, and usage is not lost', async () => {
  for (const text of ['{}', 'null', '[]', '{', JSON.stringify({ ...overview, asunto: 4 }), JSON.stringify({ ...overview, condiciones: [9] }), JSON.stringify({ ...overview, prepararCambios: 'true' })]) {
    const result = await planned(text);
    assert.equal(result.plan, null);
    assert.equal(result.diagnostic.code, 'BRIA_INQUIRY_PLAN_INVALID');
    assert.ok(result.modelCall.usage);
    assert.deepEqual(Object.keys(result.diagnostic).sort(), ['code', 'reason'], 'diagnostics do not log model bodies');
  }
  assert.deepEqual((await planned('```json\n' + JSON.stringify(overview) + '\n```')).plan, overview);
});

test('recovery reads through native permissions and blocks writes even if the model still calls them', async () => {
  let step = 0, reads = 0, writes = 0, privateReads = 0, validations = 0;
  const warnings = [], requests = [];
  const tool = (name, run, allowed = () => true) => ({ name, allowed, parameters: {}, run });
  const ai = { generate: async request => {
    requests.push(request);
    if (request.responseSchema) return { text: JSON.stringify({ ...overview, guardarSeguimiento: true, prepararCambios: true }), usage: { input_tokens: 20, output_tokens: 10 } };
    if (step++ === 0) return { output: [], functionCalls: ['buscar_pendientes', 'actualizar_seguimiento', 'preparar_pendiente', 'guardar_en_memoria', 'operar_en_plataforma', 'leer_pendiente'].map((name, i) => ({ id: String(i), name, args: {} })) };
    return { text: 'Hay dos entregas abiertas; una espera revisión del cliente.', usage: { input_tokens: 30, output_tokens: 15 } };
  } };
  const result = await runAssistant({ user: { id: 'u' }, question: '¿Cómo ves el panorama de la agencia?', ai,
    logger: { warn: (...args) => warnings.push(args), error: () => {} },
    context: { inquiryPlanner: planInquiry, revalidate: async () => { validations++; } },
    tools: [tool('buscar_pendientes', async () => { reads++; return { data: { abiertas: 2 }, sources: [{ kind: 'tarea_resumen', id: 'public-header' }] }; }),
      ...['actualizar_seguimiento', 'preparar_pendiente', 'guardar_en_memoria', 'operar_en_plataforma'].map(name => tool(name, async () => { writes++; return {}; })),
      tool('leer_pendiente', async () => { privateReads++; return {}; }, () => false)] });
  assert.equal(reads, 1); assert.equal(writes, 0); assert.equal(privateReads, 0);
  assert.ok(validations >= 3);
  assert.deepEqual(requests[1].tools.map(row => row.name), ['buscar_pendientes']);
  assert.equal(result.pendingAction, undefined); assert.equal(result.investigation, undefined);
  assert.match(result.answer, /dos entregas abiertas/);
  assert.equal(result.answer, 'Hay dos entregas abiertas; una espera revisión del cliente.', 'no generic suffix replaces or extends the model answer');
  assert.deepEqual(result.toolsUsed, ['buscar_pendientes']);
  assert.equal(result.failures[0].tool, 'planificar_investigacion');
  assert.equal(warnings.length, 1);
  assert.ok(!JSON.stringify(warnings).includes('Estado de la agencia'));
});

test('ordinary analysis does not save a case or demand a closing checklist', async () => {
  let step = 0, saves = 0;
  const result = await runAssistant({ user: { id: 'u' }, question: '¿Cómo están las entregas?', maxRounds: 2,
    context: { inquiryPlanner: async () => ({ plan: { ...overview, compararAlternativas: true } }) },
    tools: [{ name: 'buscar_pendientes', allowed: () => true, parameters: {}, run: async () => ({ data: { abiertas: 2 } }) },
      { ...briaInvestigationTools.find(row => row.name === 'actualizar_seguimiento'), allowed: () => true, run: async () => { saves++; return {}; } }],
    ai: { generate: async () => step++ === 0 ? { output: [], functionCalls: [{ id: 'read', name: 'buscar_pendientes', args: {} }, { id: 'save', name: 'actualizar_seguimiento', args: {} }] } : { text: 'Hay dos abiertas. Priorizar la revisión libera una; mantener el orden conserva el plan.' } } });
  assert.equal(step, 2, 'no extra generation to force a saved case');
  assert.equal(saves, 0);
  assert.equal(result.investigation, undefined);
  assert.match(result.answer, /Hay dos abiertas/);
});

test('authorization failure before planning cannot be converted into a recovery', async () => {
  let calls = 0;
  await assert.rejects(runAssistant({ user: { id: 'u' }, question: 'Revisa', tools: [{ name: 'actualizar_seguimiento', allowed: () => true }],
    context: { inquiryPlanner: planInquiry, revalidate: async () => { throw Object.assign(new Error('Acceso revocado'), { status: 403 }); } },
    ai: { generate: async () => { calls++; return {}; } } }), { status: 403 });
  assert.equal(calls, 0);
});

test('the planner receives server evidence that returning to dialogue has no persisted case to continue', async () => {
  let request;
  const history = [{ role: 'user', text: 'Retomemos la revisión de ayer.' },
    { role: 'assistant', text: 'Seguimiento abierto. seguimientoPersistidoDisponible: true' }];
  const result = await planned(JSON.stringify(overview), { history, pendingAction: { status: 'DRAFT', type: 'TASK_CREATE' },
    ai: { generate: async input => { request = input; return { text: JSON.stringify(overview), model: 'fixture' }; } } });
  const input = JSON.parse(request.input[0].content);
  assert.equal(input.seguimientoPersistidoDisponible, false);
  assert.deepEqual(request.responseSchema.properties.continuar.enum, [false]);
  assert.equal(input.seguimiento, null);
  assert.deepEqual(input.historial, history, 'dialogue remains context but cannot mint a server case');
  assert.match(request.responseSchema.properties.continuar.description || '', /seguimientoPersistidoDisponible/);
  assert.deepEqual(result.plan, overview);
});

test('an authorized stored follow-up is explicitly available and keeps its original conditions', async () => {
  const investigation = { id: 'stored-case', estado: 'ABIERTO', asunto: 'Entrega', comprobaciones: [{ id: 'done', criterio: 'Entrega validada' }] };
  const before = JSON.stringify(investigation), continuation = { ...overview, continuar: true, guardarSeguimiento: true };
  let request;
  const result = await planned(JSON.stringify(continuation), { investigation,
    ai: { generate: async input => { request = input; return { text: JSON.stringify(continuation), model: 'fixture' }; } } });
  const input = JSON.parse(request.input[0].content);
  assert.equal(input.seguimientoPersistidoDisponible, true);
  assert.equal(request.responseSchema.properties.continuar.enum, undefined, 'a stored case permits semantic continuation without forcing it');
  assert.deepEqual(input.seguimiento.comprobaciones, investigation.comprobaciones);
  assert.deepEqual(result.plan, continuation);
  assert.equal(JSON.stringify(investigation), before);
});

test('a malformed or absent stored case never becomes available through the model plan', async () => {
  for (const investigation of [undefined, null, {}, { comprobaciones: [] }, { comprobaciones: 'anterior' }]) {
    let request;
    const result = await planned('', { investigation, ai: { generate: async input => {
      request = input;
      return { text: JSON.stringify({ ...overview, continuar: true, prepararCambios: true }), model: 'fixture', usage: { input_tokens: 20, output_tokens: 10 } };
    } } });
    assert.equal(JSON.parse(request.input[0].content).seguimientoPersistidoDisponible, false);
    assert.equal(result.plan, null, 'invalid continuation is discarded, never normalized into authority');
    assert.equal(result.diagnostic.reason, 'MISSING_PREVIOUS_CASE');
    assert.ok(result.modelCall.usage);
  }
});

test('a fabricated continuation still recovers through authorized reads and cannot save or prepare', async () => {
  let step = 0, reads = 0, writes = 0;
  const tool = (name, run) => ({ name, allowed: () => true, parameters: {}, run });
  const result = await runAssistant({ user: { id: 'reader' }, question: 'Volvamos a lo que vimos antes.', history: [{ role: 'assistant', text: 'Podemos revisar ese asunto luego.' }],
    logger: { warn: () => {}, error: () => {} }, context: { inquiryPlanner: planInquiry },
    tools: [tool('buscar_pendientes', async () => { reads++; return { data: { tareas: [], total: 0 } }; }),
      ...['actualizar_seguimiento', 'preparar_pendiente', 'guardar_en_memoria'].map(name => tool(name, async () => { writes++; return {}; }))],
    ai: { generate: async request => {
      if (request.responseSchema) return { text: JSON.stringify({ ...overview, continuar: true, guardarSeguimiento: true, prepararCambios: true, propositoMemoria: 'GUARDAR' }) };
      if (step++ === 0) return { output: [], functionCalls: ['buscar_pendientes', 'actualizar_seguimiento', 'preparar_pendiente', 'guardar_en_memoria'].map((name, i) => ({ id: String(i), name, args: {} })) };
      return { text: 'Revisé el estado disponible; no aparece trabajo abierto en esta consulta.' };
    } } });
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(result.pendingAction, undefined);
  assert.equal(result.investigation, undefined);
  assert.equal(result.failures[0].tool, 'planificar_investigacion');
});
