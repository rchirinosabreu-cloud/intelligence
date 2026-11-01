import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyFactTools } from '../src/services/briaAgencyFactTools.js';
import { createKnowledgeTools } from '../src/services/briaKnowledgeTools.js';
import { createBriaAgencyFactService } from '../src/services/briaAgencyFactService.js';
import * as facts from '../src/lib/briaAgencyFacts.js';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';

const user = { id: 'u-test', userId: 'u-test', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 0 };
const account = { ...user, teamMember: { isActive: true, name: 'Persona ficticia' } };
const args = { entidad: 'Cuenta Faro', tipoEntidad: 'cliente', clientId: 'c-faro', tema: 'acuerdo', afirmacion: 'El trabajo de noviembre es exploratorio, sin compromiso confirmado.', proposito: 'operacion', certeza: 'CONFIRMADO', desde: '2026-11-01', hasta: '2026-11-30', reemplaza: [], respondeDuda: null };
const ctx = { user, question: 'Lo de Faro en noviembre es exploratorio, todavía no acordamos entregas.', today: '2026-10-26', selectionTurn: 'chat-ficticio:4' };
const tool = (tools, name) => tools.find(item => item.name === name);

test('a human business correction persists by semantic purpose, without a required phrase', async () => {
  const calls = [];
  const tools = createAgencyFactTools({ record: async (...values) => { calls.push(values); return { fact: { id: 'saved', entity: args.entidad, revision: 1 }, replaced: [] }; } });
  const saved = await tool(tools, 'guardar_en_memoria').run({ ...args, request: { intent: 'TEACH', evidence: 'invented by model' } }, ctx);
  assert.equal(saved.data.saved, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].question, ctx.question, 'provenance comes from the actual human turn, not the generated argument');
  assert.equal(calls[0][2].selectionTurn, ctx.selectionTurn);
});

test('an attachment instruction or a declined correction cannot become a memory write', async () => {
  let writes = 0;
  const tools = createAgencyFactTools({ record: async () => { writes++; return { fact: { id: 'saved' } }; } });
  const save = tool(tools, 'guardar_en_memoria');
  await assert.rejects(() => save.run({ ...args, request: { intent: 'TEACH' } }, { ...ctx, question: '' }), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run({ ...args, request: { intent: 'RETIRE' } }, ctx), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run({ ...args, request: { intent: 'EXECUTE' } }, ctx), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run(args, ctx), { code: 'BRIA_FACT_NO_INTENT' });
  assert.equal(writes, 0);
});

test('accepting a save offer is anchored to the actual immediately previous answer', async () => {
  let writes = 0;
  const save = tool(createAgencyFactTools({ record: async () => { writes++; return { fact: { id: 'saved' }, replaced: [] }; } }), 'guardar_en_memoria');
  const offer = 'Puedo conservar que noviembre es exploratorio para usarlo en las próximas lecturas.';
  const request = { intent: 'ACCEPT', offerEvidence: offer };
  assert.equal((await save.run({ ...args, request }, { ...ctx, question: 'Tal cual.', previousAnswer: offer })).data.saved, true);
  for (const previousAnswer of [undefined, 'El semáforo registra ocho piezas.']) {
    await assert.rejects(() => save.run({ ...args, request }, { ...ctx, question: 'Tal cual.', previousAnswer }), { code: 'BRIA_FACT_NO_INTENT' });
  }
  assert.equal(writes, 1);
});

test('both memory systems share semantic authorization and retirement stays a distinct effect', async () => {
  const saved = [], retired = [];
  const tools = createKnowledgeTools({ save: async (_user, value) => { saved.push(value); return { ...value, id: 'k', revision: 1 }; }, revoke: async (...values) => { retired.push(values); return { id: 'k' }; } });
  const input = { scope: 'ACCOUNT', entity: 'Cuenta Faro', topic: 'acuerdo', text: args.afirmacion, kind: 'CONFIRMED', validFrom: '2026-11-01', validUntil: '2026-11-30', request: { intent: 'TEACH' } };
  assert.equal((await tool(tools, 'recordar_aprendizaje').run(input, ctx)).data.saved, true);
  await assert.rejects(() => tool(tools, 'retirar_recuerdo').run({ id: 'k', expectedRevision: 1, request: { intent: 'TEACH' } }, ctx), /memoria|recuerdo/i);
  assert.equal((await tool(tools, 'retirar_recuerdo').run({ id: 'k', expectedRevision: 1, request: { intent: 'RETIRE' } }, { ...ctx, question: 'Ese acuerdo quedó sustituido; sácalo de lo vigente.' })).data.withdrawn, true);
  assert.equal(saved.length, 1); assert.equal(retired.length, 1);
});

test('with agency memory available, business facts cannot be saved into the personal-only legacy path', async () => {
  const saved = [], legacy = [{ id: 'old', scope: 'ACCOUNT', entity: 'Cuenta Faro', topic: 'acuerdo', status: 'ACTIVE', author: 'Persona', revision: 1 }];
  const knowledge = { save: async (_user, value) => { saved.push(value); return { ...value, id: 'personal', revision: 1 }; }, list: async () => legacy };
  const tools = createKnowledgeTools(knowledge, { personalOnly: true });
  const remember = tool(tools, 'recordar_aprendizaje');
  assert.deepEqual(remember.parameters.properties.scope.enum, ['PERSONAL']);
  const input = { entity: 'Persona ficticia', topic: 'comunicación', text: 'Prefiere primero la conclusión y después el detalle.', kind: 'CONFIRMED', validFrom: '2026-10-26', validUntil: null, request: { intent: 'TEACH' } };
  for (const scope of ['ACCOUNT', 'AGENCY']) {
    await assert.rejects(() => remember.run({ ...input, scope }, ctx), /guardar_en_memoria/);
  }
  assert.equal(saved.length, 0, 'executor enforces the boundary even if the model ignores the schema');
  assert.equal((await remember.run({ ...input, scope: 'PERSONAL' }, ctx)).data.saved, true);
  const remembered = await tool(tools, 'consultar_aprendizajes').run({ consulta: 'Faro' }, ctx);
  assert.equal(remembered.data[0].id, 'old', 'historical business facts remain readable');
  assert.deepEqual(tool(createKnowledgeTools(knowledge), 'recordar_aprendizaje').parameters.properties.scope.enum, ['AGENCY', 'ACCOUNT', 'PERSONAL'], 'the isolated research service without agency memory remains compatible');
});

test('recording binds the canonical account and retains dated human provenance without storing the raw message', async () => {
  let written;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => account }, client: { findUnique: async () => ({ id: 'c-faro', name: 'Cuenta Faro' }), findMany: async () => [{ id: 'c-faro', name: 'Cuenta Faro' }] } }, repository: { record: async value => { written = value; return { fact: { id: 'saved' }, replaced: [] }; } } });
  await service.record(user, args, ctx);
  assert.equal(written.clientId, 'c-faro');
  assert.equal(written.fact.fuentes[0].fecha, '2026-10-26');
  assert.equal(written.fact.fuentes[0].turno, ctx.selectionTurn);
  assert.match(written.fact.fuentes[0].huellaMensaje, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(written).includes(ctx.question), false);
  await assert.rejects(() => service.record(user, { ...args, entidad: 'Otra Cuenta' }, ctx), { code: 'BRIA_FACT_ENTITY_MISMATCH' });
});

test('unlinked exact names resolve once; ambiguity never chooses a client silently', async () => {
  let clients = [{ id: 'c-faro', name: 'Cuenta Faro' }], written;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => account }, client: { findMany: async () => clients } }, repository: { record: async value => { written = value; return { fact: { id: 'saved' }, replaced: [] }; } } });
  await service.record(user, { ...args, clientId: null }, ctx);
  assert.equal(written.clientId, 'c-faro');
  clients = [...clients, { id: 'other', name: 'Cuenta Faro' }];
  await assert.rejects(() => service.record(user, { ...args, clientId: null }, ctx), { code: 'BRIA_FACT_CLIENT_AMBIGUOUS' });
});

test('consult revalidates current visibility before returning remembered facts', async () => {
  let calls = 0;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => (++calls === 1 ? account : { ...account, role: 'PROJECT_MANAGER' }) } }, repository: { search: async () => [{ id: 'private', entity: 'Cuenta Faro', purpose: 'direccion', sensitivity: 'restringida', statement: 'Dirección privada', certainty: 'CONFIRMADO' }], openQuestions: async () => [] } });
  const result = await service.consult(user, { consulta: 'criterios', entidad: 'Cuenta Faro' });
  assert.deepEqual(result.hechos, []);
});

test('batch context does not inherit an unlinked fact when a homonym is outside the requested subset', async () => {
  let selected;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => account }, client: { findMany: async () => [
    { id: 'c-faro', name: 'Cuenta Faro' }, { id: 'other-faro', name: 'Cuenta Faro' }, { id: 'unique', name: 'Cuenta Sol' }
  ] } }, repository: { searchClients: async (_access, clients) => { selected = clients; return []; } } });
  await service.contextForClients(user, [{ id: 'c-faro', name: 'Cuenta Faro' }, { id: 'unique', name: 'Cuenta Sol' }]);
  assert.equal(selected.find(client => client.id === 'c-faro').ambiguous, true);
  assert.equal(selected.find(client => client.id === 'unique').ambiguous, false);
});

test('a correction cannot supersede another subject or erase an earlier period', () => {
  const before = { entity: 'Cuenta Faro', entityType: 'cliente', clientId: 'c-faro', validFrom: '2026-09-01', validUntil: '2026-09-30' };
  assert.match(facts.factReplacementProblem({ ...before, validFrom: '2026-11-01', validUntil: '2026-11-30' }, before, 'c-faro'), /periodo/i);
  assert.match(facts.factReplacementProblem({ ...before, entity: 'Otra cuenta' }, before, 'c-other'), /sujeto|cuenta/i);
  assert.match(facts.factReplacementProblem({ ...before, entity: 'Otro sujeto', clientId: null }, { ...before, clientId: null }, null), /sujeto|cuenta/i);
  assert.equal(facts.factReplacementProblem({ ...before, entity: 'Cuenta Faro actualizada' }, before, 'c-faro'), null, 'a native account identity survives a renamed label');
  assert.equal(facts.factReplacementProblem({ ...before, validFrom: '2026-08-01', validUntil: '2026-12-31' }, before, 'c-faro'), null);
  assert.match(facts.factReplacementProblem({ ...before }, { ...before, validUntil: null }, 'c-faro'), /periodo/i, 'a bounded month cannot retire an open-ended agreement');
});

test('fact validation retains server provenance but never arbitrary source properties', () => {
  const validated = facts.validateFact({ ...args, fuentes: [{ tipo: 'equipo', ref: 'Conversación', fecha: '2026-10-26', turno: 'chat:4', huellaMensaje: 'a'.repeat(64), body: ctx.question }] });
  assert.equal(validated.sources[0].turno, 'chat:4');
  assert.equal(validated.sources[0].huellaMensaje, 'a'.repeat(64));
  assert.equal('body' in validated.sources[0], false);
});

test('a lesson extracted from conversation is visibly distinct from a team-confirmed memory', () => {
  const row = { ...facts.validateFact(args), origin: 'CONVERSACION', actorName: 'Persona ficticia', asOf: '2026-10-26' };
  const shown = facts.presentFact(row);
  assert.match(shown.origen, /conversaci[oó]n/i);
  assert.doesNotMatch(shown.origen, /Confirmado por|Lectura del negocio/);
});

test('a correction of Bria interpretation can become the first remembered fact', async () => {
  let received;
  const save = tool(createAgencyFactTools({ record: async (_user, data) => { received = data; return { fact: { id: 'first', entity: data.entidad }, replaced: [] }; } }), 'guardar_en_memoria');
  const result = await save.run({ ...args, request: { intent: 'CORRECT' } }, { ...ctx });
  assert.equal(result.data.saved, true);
  assert.deepEqual(received.reemplaza, []);
});

test('teaching a new fact cannot silently replace one, and replacements need a consulted revision', async () => {
  let writes = 0;
  const save = tool(createAgencyFactTools({ record: async () => { writes++; return { fact: { id: 'new' }, replaced: [] }; } }), 'guardar_en_memoria');
  await assert.rejects(() => save.run({ ...args, request: { intent: 'TEACH' }, reemplaza: [{ id: 'old', revision: 1 }] }, ctx), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run({ ...args, request: { intent: 'CORRECT' }, reemplaza: [{ id: 'old' }] }, { ...ctx }), /revisi[oó]n/i);
  assert.equal(writes, 0);
});

test('retrying the same structured fact reuses the persistent record instead of filling context with duplicates', async () => {
  const rows = [], events = [];
  const db = { release() {}, async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) || /pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (sql.startsWith('INSERT INTO bria_memory.agency_facts(')) {
      const row = { id: values[1], workspace: values[0], client_id: values[2], entity: values[3], entity_key: values[4], entity_type: values[5], topic: values[6], statement: values[7], certainty: values[8], purpose: values[9], sensitivity: values[10], valid_from: values[11], valid_until: values[12], sources: JSON.parse(values[15]), origin: values[16], digest: values[17], revision: 1, status: 'ACTIVE' };
      rows.push(row); return { rows: [row] };
    }
    if (sql.startsWith('INSERT INTO bria_memory.agency_fact_events(')) { events.push(values); return { rows: [] }; }
    if (sql.includes('f.digest=')) return { rows: rows.filter(row => row.workspace === values[0] && row.digest === values[1] && row.client_id === values[2]) };
    throw new Error(`Unexpected fixture query: ${sql.slice(0, 80)}`);
  } };
  const repo = createBriaAgencyFactRepository({ pool: { connect: async () => db }, workspace: 'fictitious' });
  const input = { actor: { ref: 'u', name: 'Persona' }, access: facts.factAccess(user), user, fact: args, clientId: 'c-faro' };
  const first = await repo.record(input);
  const second = await repo.record({ ...input, fact: { ...args, fuentes: [{ tipo: 'equipo', ref: 'Otro turno' }] } });
  assert.equal(second.fact.id, first.fact.id);
  assert.equal(rows.length, 1);
  assert.equal(events.length, 1);
  await repo.record({ ...input, fact: { ...args, certeza: 'PROPUESTA' } });
  await repo.record({ ...input, fact: { ...args, desde: '2026-12-01', hasta: '2026-12-31' } });
  assert.equal(rows.length, 3, 'a different certainty or period remains distinct');
});
