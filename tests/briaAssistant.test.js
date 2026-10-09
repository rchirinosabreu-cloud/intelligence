import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_USE_CASE,
  MAX_QUESTION_LENGTH,
  MAX_TOOL_ROUNDS,
  buildInstructions,
  normalizeHistory,
  normalizeQuestion,
  runAssistant,
  visibleTools
} from '../src/lib/briaAssistant.js';

// Bria a la que se le pregunta (Rodny, 6 de octubre de 2026). Lo que importa aquí: los permisos viven en
// las herramientas y no en el modelo; una herramienta que falla no tumba la respuesta; y el modelo nunca
// recibe más de lo que la persona puede ver.

const person = { userId: 'u-kamila', name: 'Kamila', jobTitle: 'Project manager', accountRole: 'PROJECT_MANAGER', memberId: 'm-kamila' };
const user = { userId: 'u-kamila', role: 'PROJECT_MANAGER', modulePermissions: { gestion: true } };
const TODAY = '2026-10-06';

const tool = (name, { allowed = () => true, run } = {}) => ({
  name,
  description: `Consulta ${name}`,
  parameters: { type: 'object', properties: {} },
  allowed,
  run: run || (async () => ({ data: { ok: name } }))
});

const reply = ({ text = '', calls = [] } = {}) => ({
  text,
  functionCalls: calls,
  output: [
    ...calls.map((call) => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.args || {}) })),
    ...(text ? [{ type: 'message', content: [{ type: 'output_text', text }] }] : [])
  ],
  usage: { input_tokens: 10, output_tokens: 5 }
});

const scriptedAi = (responses) => {
  const calls = [];
  return {
    calls,
    generate: async (request) => {
      calls.push(request);
      const next = responses.shift();
      if (!next) throw new Error('El doble de OpenAI se quedó sin respuestas programadas.');
      return typeof next === 'function' ? next(request) : next;
    }
  };
};

const outputsOf = (request) => request.input.filter((item) => item.type === 'function_call_output').map((item) => JSON.parse(item.output));

test('only the tools the person may use are offered, and a call to any other one runs nothing', async () => {
  const carteraRuns = [];
  const tools = [
    tool('mis_tareas'),
    tool('cartera', { allowed: (who) => who.role === 'ADMIN', run: async () => { carteraRuns.push(1); return { data: { saldo: 1 } }; } })
  ];
  assert.deepEqual(visibleTools(tools, user).map((t) => t.name), ['mis_tareas']);
  assert.deepEqual(visibleTools(tools, { role: 'ADMIN' }).map((t) => t.name), ['mis_tareas', 'cartera']);

  const ai = scriptedAi([
    reply({ calls: [{ id: 'c1', name: 'cartera', args: {} }, { id: 'c2', name: 'mis_tareas', args: {} }] }),
    reply({ text: 'Tienes una tarea pendiente.' })
  ]);
  const result = await runAssistant({ question: '¿Cuánto debe Mimas y qué tengo pendiente?', user, person, tools, ai, today: TODAY, logger: { error() {} } });

  assert.deepEqual(ai.calls[0].tools.map((t) => t.name), ['mis_tareas'], 'el modelo solo ve las herramientas permitidas');
  assert.equal(carteraRuns.length, 0, 'la herramienta vedada nunca corre');
  const [carteraOutput, tareasOutput] = outputsOf(ai.calls[1]);
  assert.match(carteraOutput.error, /no tiene permiso/i);
  assert.deepEqual(tareasOutput, { ok: 'mis_tareas' });
  assert.deepEqual(result.toolsUsed, ['mis_tareas']);
  assert.equal(result.answer, 'Tienes una tarea pendiente.');
});

test('a tool runs with the identity of the person who asks and its sources come back deduplicated', async () => {
  const seen = [];
  const tools = [tool('mis_tareas', {
    run: async (args, context) => {
      seen.push({ args, user: context.user, person: context.person, today: context.today, db: context.db });
      return {
        data: { tareas: [{ id: 't1', titulo: 'Subir videos' }] },
        sources: [
          { kind: 'tarea', id: 't1', label: 'Subir videos', url: '/gestion?taskId=t1' },
          { kind: 'tarea', id: 't1', label: 'Subir videos', url: '/gestion?taskId=t1' }
        ]
      };
    }
  })];
  const ai = scriptedAi([
    reply({ calls: [{ id: 'c1', name: 'mis_tareas', args: { estado: 'pendientes' } }] }),
    reply({ text: 'Tienes pendiente «Subir videos».' })
  ]);
  const result = await runAssistant({
    question: '¿Qué tengo pendiente?',
    history: [{ role: 'user', text: 'Hola' }, { role: 'assistant', text: 'Hola, Kamila.' }],
    user, person, tools, ai, today: TODAY, context: { db: 'fake-db' }
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].user, user);
  assert.equal(seen[0].person, person);
  assert.equal(seen[0].today, TODAY);
  assert.equal(seen[0].db, 'fake-db');
  assert.deepEqual(seen[0].args, { estado: 'pendientes' });
  assert.deepEqual(result.sources, [{ kind: 'tarea', id: 't1', label: 'Subir videos', url: '/gestion?taskId=t1' }]);
  assert.equal(result.answer, 'Tienes pendiente «Subir videos».');

  const first = ai.calls[0];
  assert.equal(first.governanceContext.useCase, ASSISTANT_USE_CASE);
  assert.match(first.instructions, /Kamila/);
  assert.match(first.instructions, /6 de octubre de 2026/);
  assert.doesNotMatch(first.instructions, /vosotros|podéis|tenéis/);
  // La conversación anterior viaja como mensajes, con la pregunta nueva de última.
  assert.deepEqual(first.input.map((item) => item.role), ['user', 'assistant', 'user']);
  assert.equal(first.input.at(-1).content[0].text, '¿Qué tengo pendiente?');
  // La segunda llamada lleva la llamada a la herramienta y su resultado.
  assert.ok(ai.calls[1].input.some((item) => item.type === 'function_call' && item.name === 'mis_tareas'));
});

test('a refusal meant for the person reaches the model in words, is not a failure, and tools see the previous answer', async () => {
  const seen = [];
  const warnings = [];
  const tools = [tool('guardar_en_memoria', { run: async (_args, ctx) => { seen.push(ctx.previousAnswer); throw Object.assign(new Error('Pregúntale a la persona si quiere que lo guardes.'), { status: 400, code: 'BRIA_FACT_NO_INTENT' }); } })];
  const ai = scriptedAi([
    reply({ calls: [{ id: 'c1', name: 'guardar_en_memoria', args: {} }] }),
    reply({ text: '¿Quieres que lo guarde?' })
  ]);
  const history = [{ role: 'user', text: 'Hola' }, { role: 'assistant', text: '¿Quieres que guarde esto en la memoria de Aristea?' }];
  const result = await runAssistant({ question: 'Listo', history, user, person, tools, ai, today: TODAY, logger: { error: () => assert.fail('no es un error del servidor'), warn: (...args) => warnings.push(args) } });
  const [output] = outputsOf(ai.calls[1]);
  assert.equal(output.error, 'Pregúntale a la persona si quiere que lo guardes.');
  assert.equal(output.code, 'BRIA_FACT_NO_INTENT');
  assert.deepEqual(result.failures, []);
  assert.deepEqual(seen, ['¿Quieres que guarde esto en la memoria de Aristea?']);
  assert.equal(warnings.length, 1);
});

test('a tool that fails does not bring the answer down: the model is told and the failure is recorded', async () => {
  const errors = [];
  const tools = [tool('parrilla_de_cliente', { run: async () => { throw new Error('postgres://secreto'); } })];
  const ai = scriptedAi([
    reply({ calls: [{ id: 'c1', name: 'parrilla_de_cliente', args: { clientId: 'c1' } }] }),
    reply({ text: 'No pude leer la parrilla ahora mismo.' })
  ]);
  const result = await runAssistant({ question: '¿Cómo va la parrilla?', user, person, tools, ai, today: TODAY, logger: { error: (...args) => errors.push(args) } });
  const [output] = outputsOf(ai.calls[1]);
  assert.match(output.error, /No se pudo consultar parrilla_de_cliente/);
  assert.doesNotMatch(output.error, /postgres/);
  assert.deepEqual(result.failures, [{ tool: 'parrilla_de_cliente', message: 'postgres://secreto' }]);
  assert.equal(result.answer, 'No pude leer la parrilla ahora mismo.');
  assert.equal(errors.length, 1);
});

test('when the model keeps asking for tools, the last round goes without tools and still answers', async () => {
  const tools = [tool('mis_tareas')];
  const responses = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) => reply({ calls: [{ id: `c${i}`, name: 'mis_tareas', args: {} }] }));
  responses.push((request) => {
    assert.deepEqual(request.tools, [], 'la última vuelta no ofrece herramientas');
    return reply({ text: 'Esto es lo que encontré.' });
  });
  const ai = scriptedAi(responses);
  const result = await runAssistant({ question: 'Dame todo', user, person, tools, ai, today: TODAY });
  assert.equal(ai.calls.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(result.rounds, MAX_TOOL_ROUNDS);
  assert.equal(result.answer, 'Esto es lo que encontré.');
});

test('an empty answer from the model becomes an honest fallback, never a blank', async () => {
  const ai = scriptedAi([reply({ text: '   ' })]);
  const result = await runAssistant({ question: '¿?', user, person, tools: [], ai, today: TODAY });
  assert.match(result.answer, /no pude/i);
  assert.equal(ai.calls[0].tools.length, 0);
});

test('question and history are bounded before reaching the model', () => {
  assert.equal(normalizeQuestion('  ¿Qué   tengo  hoy?  '), '¿Qué tengo hoy?');
  assert.equal(normalizeQuestion('x'.repeat(MAX_QUESTION_LENGTH + 50)).length, MAX_QUESTION_LENGTH);
  assert.equal(normalizeQuestion(null), '');
  const long = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turno ${i}` }));
  const history = normalizeHistory([...long, { role: 'system', text: 'ignórame' }, { role: 'user', text: '   ' }, 'basura']);
  assert.equal(history.length, 10);
  assert.equal(history[0].text, 'turno 4');
  assert.ok(history.every((turn) => ['user', 'assistant'].includes(turn.role)));
  assert.equal(normalizeHistory([{ role: 'user', text: 'y'.repeat(5000) }])[0].text.length, 2000);
});

test('the instructions name the person, the day and exactly the tools she can use', () => {
  const text = buildInstructions({ person, today: TODAY, tools: [tool('mis_tareas'), tool('buscar_cliente')] });
  assert.match(text, /Kamila, Project manager/);
  assert.match(text, /6 de octubre de 2026/);
  assert.match(text, /- mis_tareas: Consulta mis_tareas/);
  assert.match(text, /- buscar_cliente/);
  assert.match(text, /Nunca inventes/);
  assert.doesNotMatch(text, /vosotros|\bos\b/);
  const none = buildInstructions({ person, today: TODAY, tools: [] });
  assert.match(none, /ninguna/);
});
