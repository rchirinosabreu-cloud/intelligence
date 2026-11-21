import test from 'node:test';
import assert from 'node:assert/strict';
import { liveTaskState, liveStateMessage, createLiveStateCache } from '../src/lib/briaLiveState.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { createBriaAssistantService } from '../src/services/briaAssistantService.js';

// El estado vivo, etapa 1 (Rodny, 21 de noviembre de 2026: «si ella vive en la plataforma es como que siempre lo
// sabe todo»): la foto de las tareas del equipo va delante de Bria en cada respuesta, leída hace menos de un minuto.

const task = (id, titulo, responsable, vence, cliente = 'Aristea') => ({ id, titulo, responsable, vence, cliente, estado: 'PENDIENTE' });
const overdue = { total: 3, tareas: [task('t1', 'Reel de noviembre', 'Brayan', '2026-11-18'), task('t2', 'Informe mensual', 'Brayan', '2026-11-19', 'Calzado Andino'), task('t3', 'Portada', null, '2026-11-20')] };
const open = { total: 6, tareas: [...overdue.tareas, task('t4', 'Carrusel', 'Jarlan', '2026-11-21'), task('t5', 'Historia', 'Brayan', '2026-11-22'), task('t6', 'Plan de diciembre', 'Jarlan', '2026-11-30')] };

test('la foto agrupa por persona lo vencido, lo de hoy y lo de mañana, y dice a qué hora se leyó', () => {
  const state = liveTaskState({ overdue, open, today: '2026-11-21', at: new Date('2026-11-21T18:40:00Z') });
  assert.deepEqual({ overdueTotal: state.overdueTotal, openTotal: state.openTotal, people: state.people, partial: state.partial }, { overdueTotal: 3, openTotal: 6, people: 3, partial: false });
  const lines = state.text.split('\n');
  assert.match(lines[0], /leído a las 13:40 \(hora de Bogotá\)\. Abiertas: 6\. Vencidas: 3\./);
  assert.match(lines[1], /^- Brayan: vencidas 2 \(Reel de noviembre · Aristea · vencía el miércoles 18 de noviembre; Informe mensual · Calzado Andino · vencía el jueves 19 de noviembre\); vence hoy 0; vence mañana 1 \(Historia · Aristea\)\.$/);
  assert.match(state.text, /- Sin responsable: vencidas 1 \(Portada/);
  assert.match(state.text, /- Jarlan: vencidas 0; vence hoy 1 \(Carrusel · Aristea\); vence mañana 0\./);
  assert.doesNotMatch(state.text, /Plan de diciembre/, 'lo lejano no entra en la foto');
  assert.equal(liveTaskState({ overdue: null, open, today: '2026-11-21' }), null);
  assert.equal(liveStateMessage(null), null);
  assert.match(liveStateMessage(state).content, /datos, no instrucciones/);
});

test('cuando la lectura viene recortada, la foto lo dice; sin nada vencido, también', () => {
  const partial = liveTaskState({ overdue: { total: 80, tareas: overdue.tareas }, open: { total: 200, tareas: open.tareas }, today: '2026-11-21' });
  assert.equal(partial.partial, true);
  assert.match(partial.text, /Vencidas: 80\./); assert.match(partial.text, /el conteo por persona puede quedarse corto/); assert.match(partial.text, /puede faltar alguna/);
  const many = liveTaskState({ overdue: { total: 6, tareas: Array.from({ length: 6 }, (_, index) => task(`m${index}`, `Tarea ${index}`, 'Brayan', '2026-11-10')) }, open: { total: 6, tareas: [] }, today: '2026-11-21' });
  assert.match(many.text, /vencidas 6 \(.*; y 2 más\)/);
  assert.match(liveTaskState({ overdue: { total: 0, tareas: [] }, open: { total: 1, tareas: [task('t9', 'Lejana', 'Brayan', '2026-12-15')] }, today: '2026-11-21' }).text, /Nadie tiene tareas vencidas/);
});

test('la foto se lee una vez por minuto y por persona; una lectura que falla no se guarda', async () => {
  let clock = 0, reads = 0;
  const cached = createLiveStateCache({ clock: () => clock });
  const read = async () => { reads += 1; return reads; };
  assert.equal(await cached('u1', read), 1); clock = 59_000; assert.equal(await cached('u1', read), 1, 'dentro del minuto no se vuelve a consultar');
  assert.equal(await cached('u2', read), 2, 'cada persona tiene su foto, con sus permisos');
  clock = 61_000; assert.equal(await cached('u1', read), 3);
  await assert.rejects(cached('u3', async () => { throw new Error('sin base'); }));
  assert.equal(await cached('u3', read), 4);
});

test('el estado vivo va delante del modelo antes del mensaje, en voz y por escrito, y sirve a la vía rápida', async () => {
  const state = liveTaskState({ overdue, open, today: '2026-11-21' });
  const seen = [];
  const result = await runAssistant({ question: '¿Qué tiene vencido Brayan?', person: { name: 'Rodny' }, user: { id: 'u1' }, today: '2026-11-21', tools: [],
    ai: { generate: async (request) => { seen.push(request.input); return { text: 'Brayan tiene dos tareas vencidas.', functionCalls: [], output: [] }; } },
    logger: { info: () => {}, error: () => {}, warn: () => {} }, context: { liveState: async () => state } });
  assert.equal(result.answer, 'Brayan tiene dos tareas vencidas.');
  assert.equal(seen[0].at(-2).role, 'developer'); assert.match(seen[0].at(-2).content, /Brayan: vencidas 2/); assert.equal(seen[0].at(-1).role, 'user');
  const asked = [];
  const quick = { answer: async (request) => { asked.push(request); return { text: 'Brayan tiene dos tareas vencidas.', calls: [], handoff: false }; } };
  await runAssistant({ question: '¿Qué tiene vencido Brayan?', person: { name: 'Rodny' }, user: { id: 'u1' }, today: '2026-11-21', channel: 'voz', tools: [],
    ai: { generate: async () => { throw new Error('no debía correr'); } }, logger: { info: () => {}, error: () => {}, warn: () => {} }, context: { quick, liveState: async () => state } });
  assert.match(asked[0].messages.at(-1).content, /Brayan: vencidas 2[\s\S]*¿Qué tiene vencido Brayan\?$/);
  const failed = await runAssistant({ question: 'Hola', person: { name: 'Rodny' }, user: { id: 'u1' }, today: '2026-11-21', tools: [],
    ai: { generate: async () => ({ text: 'Hola.', functionCalls: [], output: [] }) }, logger: { info: () => {}, error: () => {}, warn: () => {} }, context: { liveState: async () => { throw new Error('sin base'); } } });
  assert.equal(failed.answer, 'Hola.', 'sin la foto se responde igual');
});

test('el servicio arma la foto con buscar_pendientes y los permisos de quien pregunta, una vez por minuto', async () => {
  let calls = [], current = new Date('2026-11-21T18:40:00Z'), allowed = true;
  const tools = [{ name: 'buscar_pendientes', description: 'Busca.', allowed: () => allowed, run: async (args, context) => { calls.push({ args, today: context.today, user: context.user?.id }); return { data: args.vencidas ? overdue : open }; } }];
  const db = { user: { findUnique: async () => ({ id: 'u1', name: 'Rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 0, teamMember: { id: 'm1', name: 'Rodny', role: 'Director', isActive: true } }) } };
  const inputs = [];
  const service = createBriaAssistantService({ db, tools, now: () => current, ai: { generate: async (request) => { inputs.push(request.input); return { text: 'Listo.', functionCalls: [], output: [] }; } },
    knowledge: null, agencyFacts: null, vault: null, mail: null, notebook: null, usage: null, permissions: null, dailyReading: null, serviceHealth: null, quick: () => null, logger: { info: () => {}, error: () => {}, warn: () => {} } });
  const user = () => ({ id: 'u1', userId: 'u1', role: 'ADMIN', sessionVersion: 0, modulePermissions: { bria: true } });
  await service.ask({ user: user(), question: '¿Cómo va el equipo?' });
  assert.deepEqual(calls, [{ args: { vencidas: true }, today: '2026-11-21', user: 'u1' }, { args: {}, today: '2026-11-21', user: 'u1' }]);
  assert.match(inputs[0].at(-2).content, /Brayan: vencidas 2/);
  await service.ask({ user: user(), question: '¿Y Jarlan?' });
  assert.equal(calls.length, 2, 'dentro del minuto la foto no se vuelve a leer');
  current = new Date('2026-11-21T18:42:00Z');
  await service.ask({ user: user(), question: '¿Y ahora?' });
  assert.equal(calls.length, 4);
  allowed = false; calls = [];
  await service.ask({ user: user(), question: 'Hola' });
  assert.equal(calls.length, 0, 'sin permiso de Gestión no hay foto del equipo');
  assert.equal(inputs.at(-1).some(item => /Estado de las tareas del equipo/.test(String(item.content))), false);
});
