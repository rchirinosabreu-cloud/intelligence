import test from 'node:test';
import assert from 'node:assert/strict';
import { quickInstructions, quickMessages, quickTurn, QUICK_HANDOFF, QUICK_TOOL } from '../src/lib/briaQuick.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { createQuickBrain, QUICK_MODEL } from '../src/services/briaQuickBrain.js';
import { createGovernedFetch } from '../src/services/aiEgress.js';
import { createBriaAssistantService } from '../src/services/briaAssistantService.js';

// La vía rápida de la voz (Rodny, 21 de noviembre de 2026: «si Bria vive en la plataforma, debería poder tener
// respuestas prontas siempre»): un modelo pequeño de la API de Claude responde primero con lo ya leído; lo que
// necesita consultar o cambiar algo sigue por el camino completo de siempre.

const sse = (events) => new Response(new ReadableStream({ start(controller) {
  for (const event of events) controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  controller.close();
} }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const start = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: QUICK_MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1 } } };
const spoken = (text) => [start,
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...text.match(/.{1,12}/gs).map(part => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 14 } }, { type: 'message_stop' }];
const handoff = [start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: QUICK_HANDOFF, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } }, { type: 'message_stop' }];
const governed = (events, { status = 200 } = {}) => {
  const sent = [], rows = [];
  const fetchImpl = createGovernedFetch({
    fetchImpl: async (url, options) => { sent.push({ url: String(url), options }); return status === 200 ? sse(events) : new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), { status, headers: { 'content-type': 'application/json' } }); },
    governance: { assertEgress: async () => ({ allowed: true }) }, usageLog: { record: async (row) => { rows.push(row); } }
  });
  return { fetchImpl, sent, rows };
};
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('sin la clave de la API de Claude, o con BRIA_QUICK=off, la vía rápida no existe', () => {
  assert.equal(createQuickBrain({ env: {} }), null);
  assert.equal(createQuickBrain({ env: { ANTHROPIC_API_KEY: '  ' } }), null);
  assert.equal(createQuickBrain({ env: { ANTHROPIC_API_KEY: 'k', BRIA_QUICK: 'off' } }), null);
  assert.equal(createQuickBrain({ env: { ANTHROPIC_API_KEY: 'k' } }).model, 'claude-haiku-5-5');
  assert.equal(createQuickBrain({ env: { ANTHROPIC_API_KEY: 'k', BRIA_QUICK_MODEL: 'otro' } }).model, 'otro');
});

test('responde por la salida gobernada: destino inventariado, sin pensar, una sola herramienta y un renglón de uso con sus tokens', async () => {
  const { fetchImpl, sent, rows } = governed(spoken('Hola, Rodny. Hoy tienes la propuesta de Aristea.'));
  const brain = createQuickBrain({ env: { ANTHROPIC_API_KEY: 'clave-de-prueba' }, fetchImpl });
  const deltas = [];
  const reply = await brain.answer({ system: 'Eres Bria.', messages: [{ role: 'user', content: 'Hola' }], onTextDelta: text => deltas.push(text) });
  assert.deepEqual({ text: reply.text, handoff: reply.handoff, model: reply.model }, { text: 'Hola, Rodny. Hoy tienes la propuesta de Aristea.', handoff: false, model: QUICK_MODEL });
  assert.equal(deltas.join(''), reply.text); assert.ok(deltas.length > 1, 'el texto llega por trozos');
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  const body = JSON.parse(sent[0].options.body);
  assert.equal(body.model, 'claude-haiku-5-5'); assert.equal(body.stream, true);
  assert.deepEqual(body.thinking, { type: 'disabled' }); assert.deepEqual(body.output_config, { effort: 'low' });
  assert.deepEqual(body.tools.map(tool => tool.name), [QUICK_HANDOFF]);
  for (const banned of ['temperature', 'top_p', 'top_k']) assert.ok(!(banned in body));
  assert.equal(sent[0].options.governanceContext, undefined, 'el contexto de gobierno no viaja al proveedor');
  await settle();
  assert.equal(rows.length, 1);
  assert.deepEqual({ provider: rows[0].provider, model: rows[0].model, endpoint: rows[0].endpoint, flow: rows[0].flow, outcome: rows[0].outcome, inputTokens: rows[0].inputTokens, outputTokens: rows[0].outputTokens },
    { provider: 'anthropic', model: 'claude-haiku-5-5', endpoint: '/v1/messages', flow: 'bria.assistant', outcome: 'ALLOWED', inputTokens: 900, outputTokens: 14 });
  assert.doesNotMatch(JSON.stringify(rows), /clave-de-prueba|Aristea/, 'el registro no lleva la clave ni lo dicho');
});

test('cuando el modelo pide consultar, devuelve el relevo; un fallo del proveedor se lanza y queda anotado', async () => {
  const asked = governed(handoff);
  const reply = await createQuickBrain({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: asked.fetchImpl }).answer({ system: 's', messages: [{ role: 'user', content: '¿Cuánto debe Aristea?' }] });
  assert.deepEqual({ handoff: reply.handoff, reason: reply.reason }, { handoff: true, reason: 'consulta' });
  const down = governed([], { status: 529 });
  await assert.rejects(createQuickBrain({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: down.fetchImpl }).answer({ system: 's', messages: [{ role: 'user', content: 'Hola' }] }), error => error.status === 529);
  assert.equal(down.sent.length, 1, 'sin reintentos: el camino completo responde');
  await settle();
  assert.deepEqual(down.rows.map(row => [row.outcome, row.errorCode]), [['ERROR', 'HTTP_529']]);
});

test('otra dirección de Anthropic no está en el inventario', async () => {
  const { fetchImpl, sent } = governed([]);
  await assert.rejects(fetchImpl('https://api.anthropic.com/v1/files', { method: 'POST', body: '{"model":"claude-haiku-5-5"}' }), error => error.code === 'AI_DESTINATION_INVALID');
  await assert.rejects(fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' }), error => error.code === 'AI_SCOPE_REQUIRED');
  assert.equal(sent.length, 0);
});

test('los mensajes empiezan por la persona, alternan y llevan lo leído antes de la pregunta', () => {
  const messages = quickMessages({ history: [{ role: 'assistant', text: 'Buenos días.' }, { role: 'user', text: 'Hola' }, { role: 'user', text: '¿Estás?' }, { role: 'assistant', text: 'Aquí estoy.' }], notes: ['Pendientes: []'], question: '¿Qué tengo hoy?' });
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant', 'user']);
  assert.equal(messages[0].content, 'Hola\n\n¿Estás?');
  assert.equal(messages[2].content, '[Plataforma, no es la persona] Pendientes: []\n\n¿Qué tengo hoy?');
  assert.deepEqual(quickMessages({ history: [{ role: 'user', text: 'Hola' }], question: 'Sigo' }), [{ role: 'user', content: 'Hola\n\nSigo' }]);
  const system = quickInstructions({ person: { name: 'Rodny', jobTitle: 'Director' }, today: '2026-11-21' });
  assert.match(system, /hablada/); assert.match(system, new RegExp(QUICK_HANDOFF)); assert.match(system, /Hablas con Rodny, Director\.$/);
  assert.deepEqual(QUICK_TOOL.input_schema.properties, {});
});

test('va por la vía rápida un turno hablado sin borrador en curso, aunque la conversación tenga historia', () => {
  const quick = { answer: async () => ({}) };
  assert.equal(quickTurn({ channel: 'voz', context: { quick } }), true);
  assert.equal(quickTurn({ channel: 'voz', context: {} }), false);
  assert.equal(quickTurn({ channel: 'plataforma', context: { quick } }), false);
  // En una conversación guardada siempre hay `selectionTurn`, y suele haber un seguimiento y archivos viejos.
  assert.equal(quickTurn({ channel: 'voz', context: { quick, selectionTurn: 'c1:4', investigation: { id: 'i1' }, pendingAction: null } }), true);
  for (const busy of ['pendingAction', 'reviewRequested']) assert.equal(quickTurn({ channel: 'voz', context: { quick, [busy]: { id: 1 } } }), false, busy);
});

const turn = ({ quick, generate, events = [], lines = [], question = '¿Qué tengo hoy?', history = [], tools = [] }) => runAssistant({
  question, history, person: { name: 'Rodny' }, user: { id: 'u1' }, today: '2026-11-21', channel: 'voz', tools,
  ai: { generate: generate || (async () => { throw new Error('el modelo grande no debía correr'); }) },
  onEvent: event => events.push(event), logger: { info: line => lines.push(line), error: () => {}, warn: () => {} },
  context: { quick, dayBrief: async () => ({ data: { tareas: [{ id: 't1', titulo: 'Propuesta de Aristea', valor: 4500000 }] }, sources: [{ kind: 'tarea', id: 't1', label: 'Propuesta de Aristea' }] }) }
});

test('lo que se contesta con lo ya leído sale de la vía rápida, sin tocar el modelo grande', async () => {
  const events = [], lines = [], asked = [];
  const result = await turn({ events, lines, history: [{ role: 'user', text: 'Hola' }, { role: 'assistant', text: 'Hola, Rodny.' }],
    quick: { answer: async (request) => { asked.push(request); request.onTextDelta('Tienes la propuesta '); request.onTextDelta('de Aristea, por 4.500.000.'); return { text: 'Tienes la propuesta de Aristea, por 4.500.000.', handoff: false, model: 'claude-haiku-5-5', usage: { input_tokens: 800, output_tokens: 15 } }; } } });
  assert.equal(result.answer, 'Tienes la propuesta de Aristea, por 4.500.000.');
  assert.deepEqual({ rounds: result.rounds, toolsUsed: result.toolsUsed, sources: result.sources.map(source => source.id) }, { rounds: 0, toolsUsed: [], sources: ['t1'] });
  assert.equal(result.usage.totalTokens, 815);
  assert.deepEqual(events.map(event => event.type), ['delta', 'delta']);
  assert.match(asked[0].system, /Hablas con Rodny/);
  assert.deepEqual(asked[0].messages.map(message => message.role), ['user', 'assistant', 'user']);
  assert.match(asked[0].messages.at(-1).content, /Propuesta de Aristea[\s\S]*¿Qué tengo hoy\?$/);
  assert.match(lines.find(line => /Tiempos/.test(line)), /canal=voz total=\d+ms previo=\d+ms rapida=\d+ms $/);
});

test('si pide consultar, falla, se queda vacía, inventa una cifra o pide confirmar, sigue el camino completo y la persona oye que Bria va a mirar', async () => {
  const cases = {
    consulta: async () => ({ text: '', handoff: true, reason: 'consulta' }),
    fallo: async () => { throw Object.assign(new Error('Overloaded'), { status: 529 }); },
    vacia: async () => ({ text: '  ', handoff: false }),
    cifras: async (request) => { request.onTextDelta('Aristea debe 9.870.000.'); return { text: 'Aristea debe 9.870.000.', handoff: false }; },
    confirmar: async () => ({ text: '¿Confirmas que lo cree?', handoff: false })
  };
  for (const [reason, answer] of Object.entries(cases)) {
    const events = [], lines = [], seen = [];
    const result = await turn({ events, lines, quick: { answer },
      generate: async (request) => { seen.push(request); request.onTextDelta?.('Listo.'); return { text: 'Listo.', functionCalls: [], output: [] }; } });
    assert.equal(result.answer, 'Listo.', reason);
    assert.equal(seen.length, 1, `${reason}: el modelo grande responde una vez`);
    assert.equal(seen[0].input.at(-1).role, 'user');
    assert.deepEqual(events.map(event => event.type), [...(reason === 'cifras' ? ['delta', 'reset'] : []), 'status', 'delta'], reason);
    assert.match(lines.find(line => /Tiempos/.test(line)), new RegExp(`rapida=${reason}:\\d+ms ronda1=`), reason);
  }
});

test('el servicio solo ofrece la vía rápida en voz y cuando existe', async () => {
  const asked = [];
  const quick = { answer: async () => { asked.push(1); return { text: 'Hola, Rodny.', handoff: false }; } };
  const db = { user: { findUnique: async () => ({ id: 'u1', name: 'Rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 0, teamMember: { id: 'm1', name: 'Rodny', role: 'Director', isActive: true } }) } };
  const generated = [];
  const ai = { generate: async () => { generated.push(1); return { text: 'Hola desde el modelo grande.', functionCalls: [], output: [] }; } };
  const base = { db, ai, tools: [], knowledge: null, agencyFacts: null, vault: null, mail: null, notebook: null, usage: null, permissions: null, dailyReading: null, serviceHealth: null, logger: { info: () => {}, error: () => {}, warn: () => {} } };
  const user = () => ({ id: 'u1', userId: 'u1', role: 'ADMIN', sessionVersion: 0, modulePermissions: { bria: true } });
  const voice = await createBriaAssistantService({ ...base, quick: () => quick }).ask({ user: user(), question: 'Hola', session: { channel: 'voz' } });
  assert.equal(voice.answer, 'Hola, Rodny.'); assert.equal(generated.length, 0);
  const written = await createBriaAssistantService({ ...base, quick: () => quick }).ask({ user: user(), question: 'Hola' });
  assert.equal(written.answer, 'Hola desde el modelo grande.'); assert.equal(asked.length, 1, 'el chat escrito no pasa por la vía rápida');
  // Como llega de una conversación guardada: con su turno, un archivo viejo del chat y la última operación.
  const saved = { session: { channel: 'voz' }, selectionTurn: 'c1:7', lastOperation: { id: 'a1', type: 'TASK_UPDATE', status: 'DONE', title: 'Cambio', result: 'Listo.' }, attachments: [{ id: 'f1', name: 'viejo.pdf', current: false, status: 'READ', text: 'x' }] };
  assert.equal((await createBriaAssistantService({ ...base, quick: () => quick }).ask({ user: user(), question: 'Hola', ...saved })).answer, 'Hola, Rodny.');
  const fresh = await createBriaAssistantService({ ...base, quick: () => quick }).ask({ user: user(), question: 'Mira esto', ...saved, attachments: [{ id: 'f2', name: 'nuevo.pdf', current: true, status: 'READ', text: 'x' }] });
  assert.equal(fresh.answer, 'Hola desde el modelo grande.', 'un archivo recién adjuntado va por el camino completo');
  const drafting = await createBriaAssistantService({ ...base, quick: () => quick }).ask({ user: user(), question: 'Hola', ...saved, pendingAction: { id: 'a2', type: 'TASK_UPDATE', status: 'DRAFT', title: 'Cambio' } });
  assert.equal(drafting.answer, 'Hola desde el modelo grande.', 'con un borrador en curso responde el camino completo');
  const off = await createBriaAssistantService({ ...base, quick: () => null }).ask({ user: user(), question: 'Hola', session: { channel: 'voz' } });
  assert.equal(off.answer, 'Hola desde el modelo grande.');
});

test('Bria puede descartar el borrador en curso cuando se lo piden con cualquier palabra', async () => {
  const { discardDraftTool } = await import('../src/services/briaConversationTools.js');
  assert.deepEqual((await discardDraftTool.run({}, {})).data.descartado, false);
  assert.equal((await discardDraftTool.run({}, { pendingAction: { id: 'a0', status: 'DONE' } })).pendingAction, undefined);
  const draft = { id: 'a1', type: 'TASK_CREATE', status: 'DRAFT', title: 'Pendiente nuevo', draft: { status: 'DRAFT', items: [] } };
  const seen = [];
  const result = await runAssistant({
    question: 'No, deja eso así, ya no lo quiero. ¿Qué más tengo?', person: { name: 'Rodny' }, user: { id: 'u1', role: 'ADMIN', modulePermissions: { bria: true } }, today: '2026-11-21', channel: 'voz', tools: [discardDraftTool],
    ai: { generate: async (request) => { seen.push(request); return seen.length === 1
      ? { text: '', functionCalls: [{ id: 'c1', name: 'descartar_borrador', args: {} }], output: [] }
      : { text: 'Listo, lo descarté.', functionCalls: [], output: [] }; } },
    logger: { info: () => {}, error: () => {}, warn: () => {} }, context: { pendingAction: draft }
  });
  assert.equal(result.answer, 'Listo, lo descarté.', 'sin documento de aprobación pegado');
  assert.deepEqual({ status: result.pendingAction.status, draft: result.pendingAction.draft.status }, { status: 'CANCELLED', draft: 'CANCELLED' });
  assert.equal(result.quickReplies, undefined, 'no ofrece confirmar algo descartado');
  const output = JSON.parse(seen[1].input.at(-1).output);
  assert.equal(output.descartado, true); assert.equal(output.instruccionRespuesta, undefined);
  const service = (await import('node:fs')).readFileSync('src/services/briaAssistantService.js', 'utf8');
  assert.match(service, /conversationChoiceTool, discardDraftTool/); assert.match(service, /llama descartar_borrador/);
});
