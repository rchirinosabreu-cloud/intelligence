import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';
import { createBriaAgencyFactService } from '../src/services/briaAgencyFactService.js';
import { createAgencyFactTools } from '../src/services/briaAgencyFactTools.js';
import { factAccess } from '../src/lib/briaAgencyFacts.js';

const connectionString = briaTestDatabaseUrl();
const user = { id: 'u-memory-test', userId: 'u-memory-test', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 0 };
test('real PostgreSQL: memory survives service restart, keeps earlier obligations and supersedes only the corrected scope', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const workspace = `memory:${randomUUID()}`, clientId = randomUUID();
  const actor = { ref: user.id, name: 'Persona ficticia' };
  const nativeClient = { id: clientId, name: 'Cuenta Faro ficticia', isArchived: false };
  const db = { user: { findUnique: async () => ({ ...user, teamMember: { name: actor.name, isActive: true } }) }, client: { findUnique: async () => nativeClient, findMany: async () => [nativeClient] } };
  const repo = () => createBriaAgencyFactRepository({ pool, workspace });
  const service = () => createBriaAgencyFactService({ repository: repo(), db });
  const save = () => createAgencyFactTools(service()).find(tool => tool.name === 'guardar_en_memoria');
  const base = { request: { intent: 'TEACH' }, entidad: nativeClient.name, clientId, tipoEntidad: 'cliente', tema: 'acuerdo', afirmacion: 'Septiembre conserva dos entregas comprometidas.', certeza: 'CONFIRMADO', proposito: 'operacion', desde: '2026-09-01', hasta: '2026-09-30', reemplaza: [], respondeDuda: null };
  const context = { user, question: 'Septiembre tiene dos entregas pendientes. Octubre no fue contratado.', memoryIntent: 'GUARDAR', today: '2026-10-26', selectionTurn: 'fictitious-chat:1' };
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-agency-facts.sql', import.meta.url), 'utf8'));
    await pool.query('INSERT INTO "Client"(id,name,slug) VALUES($1,$2,$3)', [clientId, nativeClient.name, `faro-${clientId}`]);
    const september = await save().run(base, context);
    const octoberArgs = { ...base, afirmacion: 'Octubre fue exploratorio; no hubo encargo confirmado.', desde: '2026-10-01', hasta: '2026-10-31' };
    // Two independent service instances/retries preserve one fact and one original event.
    const october = await Promise.all([save().run(octoberArgs, context), save().run(octoberArgs, context)]);
    assert.equal(october[0].data.hecho.id, october[1].data.hecho.id);
    const restarted = service();
    const read = await restarted.consult(user, { clientId, consulta: 'compromisos' });
    assert.equal(read.hechos.length, 2);
    const persisted = await repo().get(factAccess(user), october[0].data.hecho.id);
    assert.equal(persisted.sources[0].turno, context.selectionTurn);
    assert.match(persisted.sources[0].huellaMensaje, /^[a-f0-9]{64}$/);
    assert.equal(persisted.sources[0].fecha, '2026-10-26');
    assert.equal((await repo().history(factAccess(user), persisted.id)).length, 1);
    const correction = { ...octoberArgs, request: { intent: 'CORRECT' }, afirmacion: 'Se confirmó finalmente el alcance de octubre.', reemplaza: [{ id: persisted.id, revision: persisted.revision }] };
    const newContext = { ...context, question: 'Al final sí acordamos octubre; conserva septiembre como estaba.', memoryIntent: 'CORREGIR', selectionTurn: 'fictitious-chat:3' };
    const saved = await save().run(correction, newContext);
    const current = await service().consult(user, { clientId, consulta: 'compromisos' });
    assert.deepEqual(current.hechos.map(row => row.id).sort(), [september.data.hecho.id, saved.data.hecho.id].sort());
    assert.equal((await repo().get(factAccess(user), persisted.id)).status, 'SUPERSEDED');
    await assert.rejects(() => save().run({ ...correction, reemplaza: [{ id: september.data.hecho.id, revision: 1 }] }, newContext), { code: 'BRIA_FACT_REPLACEMENT_SCOPE' });
    await assert.rejects(() => save().run(correction, newContext), { code: 'BRIA_FACT_CHANGED' });
    assert.equal((await service().consult(user, { clientId, consulta: 'compromisos' })).hechos.length, 2);
    // A delayed retry still carries the original human turn. It cannot undo a
    // correction made in a newer conversation by creating the old fact again.
    await assert.rejects(() => save().run(octoberArgs, context), { code: 'BRIA_FACT_CHANGED' });
    assert.equal((await service().consult(user, { clientId, consulta: 'compromisos' })).hechos.length, 2);
    const raw = { entidad: 'Otro sujeto', tipoEntidad: 'cliente', tema: 'acuerdo', afirmacion: 'Nueva afirmación.', certeza: 'CONFIRMADO', proposito: 'operacion' };
    await assert.rejects(() => repo().record({ actor, access: factAccess(user), user, fact: raw, replaces: [{ id: september.data.hecho.id, revision: 1 }] }), { code: 'BRIA_FACT_REPLACEMENT_SCOPE' });
    // A genuinely new teaching may confirm the same content again. Its source
    // identifies another turn even when the person repeats the same words.
    const laterContext = { ...context, selectionTurn: 'another-fictitious-chat:1' };
    const confirmedAgain = await save().run(octoberArgs, laterContext);
    assert.notEqual(confirmedAgain.data.hecho.id, persisted.id);
    const newest = await repo().get(factAccess(user), confirmedAgain.data.hecho.id);
    assert.equal(newest.status, 'ACTIVE');
    await repo().retire({ actor, access: factAccess(user), user, id: newest.id, revision: newest.revision });
    await assert.rejects(() => save().run(octoberArgs, laterContext), { code: 'BRIA_FACT_CHANGED' });
  } finally {
    await pool.query('DELETE FROM bria_memory.agency_fact_events WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.agency_facts WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.agency_questions WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
    await pool.end();
  }
});
