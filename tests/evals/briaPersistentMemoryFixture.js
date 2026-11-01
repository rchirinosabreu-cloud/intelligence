import assert from 'node:assert/strict';
import { runAssistant } from '../../src/lib/briaAssistant.js';
import { factKey, factVisible, validateFact } from '../../src/lib/briaAgencyFacts.js';
import { createAgencyFactTools } from '../../src/services/briaAgencyFactTools.js';
import { createBriaAgencyFactService } from '../../src/services/briaAgencyFactService.js';
import { createBriaModelRuntime } from '../../src/services/briaModelRuntime.js';
import { briaInvestigationTools } from '../../src/services/briaInvestigationTools.js';
import { buildDailyDigest, buildDailyReadingRequest, parseDailyReading, validateDailyReading, composeReading } from '../../src/lib/dailyReading.js';

// Dos fases y datos ficticios: conversación real del motor, después lectura de la
// mañana. El repositorio es un doble persistente entre instancias; PostgreSQL se
// comprueba aparte. No hay conexión, tareas reales ni herramientas de ejecución.
export const createPersistentMemoryFixture = (ai, { runtimeEnv = process.env } = {}) => {
  const today = '2026-10-26', tomorrow = '2026-10-27';
  const user = { id: 'memory-director', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true }, teamMember: { name: 'Marina Duarte', isActive: true } };
  const clients = [{ id: 'roble', name: 'Estudio Roble Ficticio', slug: 'roble' }, { id: 'faro', name: 'Clínica Faro Ficticia', slug: 'faro' }];
  const base = { entityType: 'cliente', topic: 'acuerdo', certainty: 'CONFIRMADO', purpose: 'operacion', sensitivity: 'normal', origin: 'EQUIPO', status: 'ACTIVE', revision: 1, actorName: 'Marina Duarte', updatedAt: '2026-10-20T15:00:00Z', sources: [] };
  const facts = [
    { ...base, id: 'roble-september', clientId: 'roble', entity: clients[0].name, statement: 'Dos publicaciones comprometidas de septiembre siguen pendientes; su cierre debe comprobarse.', validFrom: '2026-09-01', validUntil: '2026-09-30' },
    { ...base, id: 'roble-october', clientId: 'roble', entity: clients[0].name, statement: 'Octubre está contratado y nueve publicaciones siguen pendientes.', validFrom: '2026-10-01', validUntil: '2026-10-31' },
    { ...base, id: 'faro-october', clientId: 'faro', entity: clients[1].name, statement: 'Octubre está contratado: cuatro publicaciones aprobadas tienen entrega vigente esta semana.', validFrom: '2026-10-01', validUntil: '2026-10-31' }
  ];
  const reads = [], writes = [], operationalWrites = [], requests = [], outcomes = [];
  const repository = {
    search: async (access, { clientId, entity }) => { reads.push('memory'); return facts.filter(row => row.status === 'ACTIVE' && factVisible(row, access) && (row.clientId === clientId || factKey(row.entity) === factKey(entity))); },
    searchClients: async (access, selected, limit) => { reads.push('batch-memory'); return selected.flatMap(client => facts.filter(row => row.status === 'ACTIVE' && row.clientId === client.id && factVisible(row, access)).slice(0, limit)); },
    getMany: async (access, ids) => facts.filter(row => ids.includes(row.id) && factVisible(row, access)),
    openQuestions: async () => [],
    record: async ({ fact, clientId, replaces, actor }) => {
      const saved = { ...validateFact(fact), id: `memory-${writes.length + 1}`, clientId, origin: 'EQUIPO', status: 'ACTIVE', revision: 1, actorName: actor.name, updatedAt: '2026-10-26T15:00:00Z' };
      for (const replacement of replaces) {
        const old = facts.find(row => row.id === replacement.id);
        assert.ok(old && old.revision === replacement.revision && old.status === 'ACTIVE');
        assert.equal(old.clientId, clientId);
        assert.equal(old.validFrom, saved.validFrom, 'the fixture must not supersede September when correcting October');
        assert.equal(old.validUntil, saved.validUntil);
        old.status = 'SUPERSEDED'; old.supersededBy = saved.id; old.revision++;
      }
      facts.push(saved); writes.push(saved);
      return { fact: saved, replaced: replaces.map(row => row.id) };
    }
  };
  const db = { user: { findUnique: async () => user }, client: { findUnique: async ({ where }) => clients.find(row => row.id === where.id), findMany: async () => clients } };
  const newService = () => createBriaAgencyFactService({ repository, db });
  const generate = request => { requests.push({ phase: request.responseSchema?.properties.decisiones ? 'morning' : request.responseSchema ? 'purpose' : 'conversation', bytes: Buffer.byteLength(JSON.stringify(request)), maxOutputTokens: request.maxOutputTokens }); return ai.generate(request); };
  const runtime = createBriaModelRuntime({ ai: { generate }, user, env: runtimeEnv });
  const question = 'Sobre Estudio Roble Ficticio: octubre no se contrató. Esa parrilla era una propuesta sin autorización, así que no hay compromiso de publicar esas nueve piezas. Las dos pendientes de septiembre sí eran un compromiso y siguen por comprobar. No cambies tareas ni contratos.';
  return { user, clients, facts, reads, writes, operationalWrites, requests, outcomes, question, today, tomorrow, newService, repository, generate,
    async teach() {
      const service = newService();
      const answer = await runAssistant({ question, history: [{ role: 'user', text: '¿Qué teníamos pendiente con Estudio Roble Ficticio?' }, { role: 'assistant', text: 'La lectura guardada considera nueve publicaciones de octubre pendientes, además de dos de septiembre.' }], user, person: { name: 'Marina Duarte', jobTitle: 'Dirección' }, today, tools: [...createAgencyFactTools(service), ...briaInvestigationTools], ai: runtime, maxRounds: 4,
        context: { db, agencyFacts: service, recallMemory: ({ question: current }) => service.recall(user, { texto: current }), selectionTurn: 'fictional-chat-one:3', now: () => new Date('2026-10-26T15:00:00Z') }, logger: { error() {}, warn() {} } });
      outcomes.push({ phase: 'conversation', question, answer });
      return answer;
    },
    async morning() {
      const fresh = newService();
      const recalled = await fresh.contextForClients(user, clients);
      assert.ok(recalled.cuentas.find(row => row.clientId === 'roble').hechos.some(row => row.id.startsWith('memory-')), 'another service must recover the correction without chat history');
      const context = { accounts: clients.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, contract: { estado: 'ACTIVO', inicio: '2026-01-01', fin: client.id === 'roble' ? '2026-09-30' : '2026-12-31', notas: null }, facts: facts.filter(row => row.status === 'ACTIVE' && row.clientId === client.id) })), criteria: [] };
      const snapshots = clients.map(client => ({ ...client, metrics: { level: 'red', cycle: { label: 'Octubre de 2026', published: client.id === 'roble' ? 3 : 8, quota: 12, expected: 12 }, awaitingApproval: 0, returnedPieces: 0, returnedTasks: 0, overdueTasks: 0, reasons: [] } }));
      const signals = clients.map(client => ({ id: `signal-${client.id}`, kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: client.id, subjectName: client.name, direction: 'peor', severity: 2, text: `${client.name} tiene ${client.id === 'roble' ? 9 : 4} piezas de octubre con fecha pasada sin publicación registrada.`, url: null }));
      const summary = { historyDays: 8, firstDay: '2026-10-19', clients: { red: 2, yellow: 0, green: 0, gray: 0 }, team: { open: 0, overdue: 0, returned: 0 } };
      const digest = buildDailyDigest({ today: tomorrow, baseDay: today, summary, signals, clients: snapshots, context });
      // The compact two-account evaluation bounds output, without changing the
      // production prompt, schema or interpretation contracts.
      const request = { ...buildDailyReadingRequest({ digest, today: tomorrow }), maxOutputTokens: 2400 };
      const response = await generate(request);
      const rawResponse = parseDailyReading(response.text);
      const model = validateDailyReading(rawResponse, { signals, clients: snapshots, day: tomorrow, context });
      const reading = composeReading({ day: tomorrow, baseDay: today, summary, signals, clients: snapshots, model, context, modelName: response.model });
      outcomes.push({ phase: 'morning', rawResponse, validation: model.diagnostics, reading });
      assert.equal(snapshots[0].metrics.cycle.quota - snapshots[0].metrics.cycle.published, 9, 'the platform counter is not rewritten to hide the problem');
      return { reading, recalled, context };
    }
  };
};

export const runPersistentMemoryScenario = async fixture => {
  const answer = await fixture.teach();
  assert.deepEqual(answer.failures, []);
  assert.ok(answer.toolsUsed.includes('guardar_en_memoria'), 'the model must persist the correction, not merely acknowledge it');
  assert.equal(answer.pendingAction, undefined);
  assert.equal(fixture.operationalWrites.length, 0);
  assert.ok(fixture.writes.length > 0);
  for (const fact of fixture.writes) {
    assert.equal(fact.sources[0].turno, 'fictional-chat-one:3');
    assert.match(fact.sources[0].huellaMensaje, /^[a-f0-9]{64}$/);
  }
  const corrections = fixture.writes.filter(row => row.clientId === 'roble' && row.validFrom === '2026-10-01' && row.validUntil === '2026-10-31');
  assert.ok(corrections.length, 'the correction must apply to the whole October agreement, not start on its reception date');
  const october = fixture.facts.find(row => row.id === 'roble-october');
  assert.equal(october.status, 'SUPERSEDED', 'the contradicted October agreement must be superseded, not remain active beside another fact');
  assert.ok(corrections.some(row => row.id === october.supersededBy), 'the dated correction must replace the contradicted October agreement');
  const september = fixture.facts.find(row => row.id === 'roble-september');
  assert.equal(september.status, 'ACTIVE');
  assert.equal(september.revision, 1, 'the correction cannot rewrite the earlier agreement');
  assert.equal(september.validFrom, '2026-09-01');
  assert.equal(september.validUntil, '2026-09-30');
  const result = await fixture.morning();
  assert.equal(result.reading.source, 'MODELO');
  const roble = result.reading.decisions.filter(row => row.subjectId === 'roble');
  assert.ok(roble.length && roble.some(row => row.memoryEvidence.some(id => fixture.writes.some(fact => fact.id === id))), 'the morning must use the human correction');
  assert.ok(roble.some(row => ['NO_HACER', 'VIGILAR'].includes(row.kind)), 'uncontracted October must not be pursued as an active obligation');
  const narrative = [result.reading.overview, ...roble.map(row => `${row.title} ${row.why}`), result.reading.accounts.roble.lectura].join('\n');
  assert.match(narrative, /septiembre/iu, 'the October correction cannot erase September’s obligations');
  assert.match(narrative, /propuesta|no\s+(?:se\s+)?contrat|sin\s+autoriz/iu);
  assert.ok(result.reading.decisions.some(row => row.subjectId === 'faro' && ['HACER', 'CONVERSAR'].includes(row.kind)), 'a different client still has a current obligation');
  assert.deepEqual(fixture.operationalWrites, []);
  return { answer, ...result };
};
