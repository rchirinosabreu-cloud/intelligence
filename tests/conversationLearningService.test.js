import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationLearningService, LEARNING_FROM } from '../src/services/conversationLearningService.js';

const at = (iso) => new Date(iso);
const chat = (id, actorRef, texts) => ({ id, actorRef, turns: texts.map((text, position) => ({ position, role: position % 2 ? 'assistant' : 'user', text, note: null, createdAt: new Date('2026-10-20T15:00:00Z') })) });

const setup = ({ answer, chats = [] } = {}) => {
  const runs = new Map(), imported = [], requests = [], queries = [];
  const pool = { async query(sql, args) {
    queries.push(sql);
    if (/INSERT INTO bria_memory.conversation_learning_runs/.test(sql)) {
      const [day] = args; const row = runs.get(day);
      if (!row) { runs.set(day, { started: Date.now(), finished: null }); return { rowCount: 1 }; }
      if (/finished_at = NULL/.test(sql)) { runs.set(day, { started: Date.now(), finished: null }); return { rowCount: 1 }; }
      return { rowCount: 0 };
    }
    if (/UPDATE bria_memory.conversation_learning_runs SET finished_at/.test(sql)) { runs.get(args[0]).finished = Date.now(); runs.get(args[0]).summary = args.slice(1); return { rowCount: 1 }; }
    throw new Error(`consulta inesperada: ${sql}`);
  } };
  const conversations = { async conversationsBetween(fromIso, toIso) { queries.push(`between ${fromIso} ${toIso}`); return chats; } };
  const facts = {
    async search() { return [{ id: 'k1', entity: 'Mimas Kitchen', statement: 'Publica martes y jueves.' }]; },
    async importReading(args) { imported.push(args); return { create: args.facts.length, update: 0, unchanged: 0, keptByTeam: 0 }; }
  };
  const db = {
    user: { findMany: async () => [{ id: 'u-fran', name: 'Francisco', teamMember: { name: 'Francisco Villa' } }] },
    client: { findMany: async () => [{ id: 'c-mimas', name: 'Mimas Kitchen' }] },
    teamMember: { findMany: async () => [{ id: 'm-kamila', name: 'Kamila del Toro' }] }
  };
  const generate = async (request) => { requests.push(request); return { text: JSON.stringify(answer || { aprendizajes: [] }), model: 'ficticio', usage: { input_tokens: 10, output_tokens: 5 } }; };
  const service = createConversationLearningService({ db, pool, conversations, facts, generate, now: () => at('2026-10-21T03:30:00Z'), logger: { log() {}, error() {} } });
  return { service, runs, imported, requests, queries };
};

test('at night Bria reads the day’s chats once, asks the model per chat, and writes only validated facts with origin CONVERSACION', async () => {
  const answer = { aprendizajes: [
    { entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'prioridad', afirmacion: 'Los pendientes de Mimas van con prioridad alta.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'con Mimas siempre va alta' },
    { entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'inventado', afirmacion: 'Mimas aprobó noviembre.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'esto no lo dijo nadie' }
  ] };
  const { service, imported, requests, queries } = setup({ answer, chats: [
    chat('chat-1', 'u-fran', ['Créame un pendiente para Mimas, para Kamila, mañana, prioridad alta: con Mimas siempre va alta, el cliente pide todo para ayer.', 'Así quedaría el pendiente…']),
    chat('chat-2', 'u-fran', ['hola', 'Hola, ¿en qué trabajamos?'])
  ] });
  const out = await service.runAutomatic(); // 22:30 de Bogotá del 20 de octubre
  assert.equal(out.day, '2026-10-20');
  assert.ok(queries.some((q) => q === 'between 2026-10-20T05:00:00.000Z 2026-10-21T05:00:00.000Z'), 'el día de Bogotá, de 5:00Z a 5:00Z');
  assert.equal(requests.length, 1, 'el chat de dos palabras no se manda al modelo');
  assert.match(requests[0].prompt, /\[Francisco Villa\] Créame un pendiente/);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].origin, 'CONVERSACION'); assert.equal(imported[0].actor.ref, 'bria'); assert.equal(imported[0].asOf, '2026-10-20');
  assert.deepEqual(imported[0].facts.map((f) => [f.entidad, f.certeza, f.clientId]), [['Mimas Kitchen', 'PRACTICA', 'c-mimas']]);
  assert.deepEqual({ facts: out.facts, dropped: out.dropped, conversations: out.conversations }, { facts: 1, dropped: 1, conversations: 2 });
  assert.equal((await service.runAutomatic()).skipped, 'ya leído', 'una sola lectura por noche');
});

test('before six in the morning it catches up yesterday; during the day it waits', async () => {
  const { service, queries } = setup();
  service.runAutomatic = createConversationLearningService.prototype?.runAutomatic || service.runAutomatic;
  const early = createConversationLearningService({ ...{}, db: { user: { findMany: async () => [] }, client: { findMany: async () => [] }, teamMember: { findMany: async () => [] } }, pool: { query: async (sql) => (/INSERT/.test(sql) ? { rowCount: 1 } : { rowCount: 1 }) }, conversations: { conversationsBetween: async () => [] }, facts: {}, generate: async () => ({ text: '{"aprendizajes":[]}' }), now: () => at('2026-10-21T09:30:00Z'), logger: { log() {}, error() {} } });
  assert.equal((await early.runAutomatic()).day, '2026-10-20', 'a las 4:30 de Bogotá lee el día anterior');
  const noon = createConversationLearningService({ pool: { query: async () => { throw new Error('no debe consultar'); } }, now: () => at('2026-10-21T17:00:00Z'), logger: { log() {}, error() {} } });
  assert.equal((await noon.runAutomatic()).skipped, 'fuera de horario');
  assert.ok(LEARNING_FROM === 22 * 60);
  assert.ok(queries.length === 0);
});

test('the morning never lists what Bria learned (Rodny, 20 de octubre de 2026: «no quiero lo de “ayer aprendí”»)', async () => {
  const { service } = setup();
  assert.equal(typeof service.learnedFor, 'undefined');
});
