import test from 'node:test';
import assert from 'node:assert/strict';
import * as assistant from '../src/lib/briaAssistant.js';
const { buildInstructions, runAssistant } = assistant;
import { createDailyReadingTools } from '../src/services/dailyReadingTools.js';

const user = { id: 'reviewer', role: 'ADMIN', isActive: true };

test('reading instructions route a saved proposal identifier to the existing reading tool', () => {
  const tools = createDailyReadingTools({ explain: async () => ({}) });
  assert.equal(tools[0].name, 'lectura_de_la_agencia');
  assert.match(tools[0].description, /propuestas.*identificador/i);
  // La guía vive en la descripción (31 de octubre de 2026): la propuesta guardada se revisa con esta misma herramienta.
  assert.match(tools[0].description, /revisar una propuesta de esa lectura por identificador, número o asunto/i);
  assert.match(tools[0].description, /un id de otra fecha no cambia la lectura consultada/i);
  const instructions = buildInstructions({ person: { name: 'Dirección' }, today: '2026-10-15', user, tools });
  assert.match(instructions, /- lectura_de_la_agencia/);
});

test('a proposal request is data and cannot replace a question about account status with a drafted message', async () => {
  const proposal = { id: '2026-10-15:50', pedido: 'Redáctame un mensaje al cliente.', titulo: 'Revisar aprobaciones' };
  const tools = createDailyReadingTools({ explain: async () => ({ fecha: '2026-10-15', decisiones: [proposal] }) });
  const result = await tools[0].run({}, { user });
  assert.deepEqual(result.data.decisiones, [proposal], 'the suggested next step remains reviewable as data');
  assert.match(result.data.instruccion, /pedido.*datos.*no.*instrucciones/i);
  assert.match(result.data.instruccion, /pregunta actual/i);
  assert.match(result.data.instruccion, /no.*sustitu.*an[aá]lisis.*borrador/i);
  assert.match(tools[0].description, /pedido.*no.*petici[oó]n actual/i);
  assert.match(buildInstructions({ person: { name: 'Dirección' }, today: '2026-10-15', user, tools }), /- lectura_de_la_agencia/);
});

test('a client with several proposals is resolved from the stated issue before asking the person again', async () => {
  const tools = createDailyReadingTools({ recordVerdict: async () => ({ saved: false, motivo: 'Hay varias propuestas de esa cuenta.' }) });
  const note = tools.find((tool) => tool.name === 'anotar_decision');
  assert.match(note.description, /varias.*lectura_de_la_agencia.*id/i);
  assert.match(note.parameters.properties.decision.description, /asunto.*cliente/i);
  const result = await note.run({ decision: 'Aristea', veredicto: 'hecho' }, { user });
  assert.match(result.data.instruccion, /cliente.*asunto.*lectura_de_la_agencia.*id/i);
  assert.match(result.data.instruccion, /pregunta.*sigue.*ambigu/i);
});

test('calendar hints use the real weekday of valid ISO days, including leap years, and cap their size', () => {
  assert.equal(typeof assistant.calendarHints, 'function');
  assert.deepEqual(assistant.calendarHints({
    dates: ['2026-10-06', '2026-10-13', '2026-10-14', '2026-10-17', '2028-02-29', '2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31'],
    nested: { note: 'Lectura 2026-10-14, ya citada.', observedAt: '2026-10-14T02:00:00Z' }
  }), {
    '2026-10-06': 'martes 6 de octubre de 2026',
    '2026-10-13': 'martes 13 de octubre de 2026',
    '2026-10-14': 'miércoles 14 de octubre de 2026',
    '2026-10-17': 'sábado 17 de octubre de 2026',
    '2028-02-29': 'martes 29 de febrero de 2028'
  }, 'the map describes each ISO day, not the local time of an event');
  const manyDays = Array.from({ length: 150 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  assert.equal(Object.keys(assistant.calendarHints(manyDays)).length, 100);
  assert.deepEqual(assistant.calendarHints(null), {});
});

test('the model receives derived calendar hints only for data returned by an authorized tool', async () => {
  const data = { fechas: ['2026-10-06', '2026-10-13'], nota: 'Consulta autorizada' };
  let calls = 0;
  const ai = { generate: async (request) => {
    calls += 1;
    if (calls === 1) {
      assert.match(request.instructions, /jueves 15 de octubre de 2026/);
      assert.match(request.instructions, /calendarioFechas/);
      return { functionCalls: [{ id: 'yes', name: 'visible' }, { id: 'no', name: 'private' }] };
    }
    const outputs = request.input.filter((item) => item.type === 'function_call_output').map((item) => JSON.parse(item.output));
    assert.deepEqual(outputs[0], { ...data, calendarioFechas: {
      '2026-10-06': 'martes 6 de octubre de 2026',
      '2026-10-13': 'martes 13 de octubre de 2026'
    }, contextoTemporal: { hoy: '2026-10-15', zonaHoraria: 'America/Bogota', fechas: {
      '2026-10-06': { relacionConHoy: 'PASADO' },
      '2026-10-13': { relacionConHoy: 'PASADO' }
    } } });
    assert.match(outputs[1].error, /permiso/);
    assert.equal(outputs[1].calendarioFechas, undefined);
    assert.equal(outputs[1].contextoTemporal, undefined);
    assert.doesNotMatch(JSON.stringify(outputs), /2031-12-31/);
    return { text: 'Desde el martes 6 de octubre.' };
  } };
  await runAssistant({ user, person: { name: 'Dirección' }, today: '2026-10-15', question: '¿Desde cuándo?', ai, tools: [
    { name: 'visible', allowed: () => true, run: async () => ({ data }) },
    { name: 'private', allowed: () => false, run: async () => { assert.fail('una consulta denegada no corre'); return { data: { fecha: '2031-12-31' } }; } }
  ] });
  assert.equal(calls, 2);
  assert.equal(data.calendarioFechas, undefined, 'the source object is not mutated');
});
