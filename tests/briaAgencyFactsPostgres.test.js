import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';
import { factAccess } from '../src/lib/briaAgencyFacts.js';

const connectionString = briaTestDatabaseUrl();
const admin = { id: 'u-admin', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const pm = { id: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true } };
const fact = (id, over = {}) => ({ id, entidad: 'Cuenta ficticia', tipoEntidad: 'cliente', fichaNativa: 'Cuenta ficticia', tema: 'acuerdo', afirmacion: `Hecho ficticio ${id} sobre el contrato de la cuenta.`, certeza: 'VIGENTE_DE_HECHO', desde: '2026-09-11', hasta: null, fuentes: [{ tipo: 'drive', ref: 'Documento ficticio', fecha: '2026-09-01' }], proposito: 'operacion', sensibilidad: 'normal', observadoEl: '2026-10-07', ...over });
const question = { id: 'ficticia-d01', entidad: 'Cuenta ficticia', pregunta: '¿Hay contrato para octubre?', porQueImporta: 'Para comparar.', quienResponde: 'Dirección', hechosRelacionados: ['ficticia-001'], prioridad: 'alta', proposito: 'operacion' };

test('real PostgreSQL: the reading imports once, the team corrects without deleting, and money stays hidden from a PM', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 3 });
  const workspace = `test:${randomUUID()}`;
  const reader = { ref: 'lectura-del-negocio', name: 'Lectura del negocio' };
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-agency-facts.sql', import.meta.url), 'utf8'));
    const repo = createBriaAgencyFactRepository({ pool, workspace });
    const links = new Map([['Cuenta ficticia', { clientId: 'client-1' }]]);
    const reading = [fact('ficticia-001'), fact('ficticia-002', { proposito: 'financiero', sensibilidad: 'restringida', tema: 'cobro', afirmacion: 'La cuenta ficticia debe 1.000.000 desde agosto.' }), fact('ficticia-003', { proposito: 'direccion', tema: 'riesgo', afirmacion: 'Riesgo ficticio de dirección.' })];

    const dry = await repo.importReading({ facts: reading, questions: [question], links, asOf: '2026-10-07', actor: reader, dryRun: true });
    assert.equal(dry.create, 3);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bria_memory.agency_facts WHERE workspace=$1', [workspace])).rows[0].n, 0, 'a simulation writes nothing');

    assert.equal((await repo.importReading({ facts: reading, questions: [question], links, asOf: '2026-10-07', actor: reader })).create, 3);
    const again = await repo.importReading({ facts: reading, questions: [question], links, asOf: '2026-10-07', actor: reader });
    assert.deepEqual([again.create, again.update, again.unchanged], [0, 0, 3]);

    // Who sees what is decided in the query, before the limit.
    assert.deepEqual((await repo.search(factAccess(pm), { clientId: 'client-1', limit: 1 })).map((f) => f.id), ['ficticia-001']);
    assert.equal((await repo.search(factAccess(admin), { clientId: 'client-1' })).length, 3);
    assert.equal((await repo.search(factAccess(pm), { query: 'contrato cuenta ficticia' }))[0].id, 'ficticia-001');
    const asked = await repo.openQuestions(factAccess(pm), { clientId: 'client-1' });
    assert.equal(asked[0].question, '¿Hay contrato para octubre?');

    // The PM corrects the account in conversation: the old fact is superseded, not deleted, and the question closes.
    const old = (await repo.search(factAccess(pm), { clientId: 'client-1' }))[0];
    const saved = await repo.record({ actor: { ref: 'u-pm', name: 'Camila' }, access: factAccess(pm), user: pm, fact: { entidad: 'Cuenta ficticia', tema: 'acuerdo', afirmacion: 'Hay contrato firmado de octubre a diciembre de 2026.', certeza: 'CONFIRMADO', proposito: 'operacion' }, replaces: [{ id: old.id, revision: old.revision }], answersQuestion: 'ficticia-d01' });
    assert.equal(saved.fact.clientId, 'client-1', 'inherits the account of what it replaces');
    const now = await repo.search(factAccess(pm), { clientId: 'client-1' });
    assert.deepEqual(now.map((f) => f.id), [saved.fact.id]);
    assert.equal(now[0].origin, 'EQUIPO');
    assert.equal((await repo.history(factAccess(pm), old.id))[0].action, 'SUPERSEDE');
    assert.equal((await repo.openQuestions(factAccess(pm), { clientId: 'client-1' })).length, 0);

    // A stale correction is refused; a PM cannot write money or agency-wide facts.
    await assert.rejects(() => repo.record({ actor: { ref: 'u-pm', name: 'Camila' }, access: factAccess(pm), user: pm, fact: { entidad: 'Cuenta ficticia', tema: 'acuerdo', afirmacion: 'Otra versión.', proposito: 'operacion' }, replaces: [{ id: old.id, revision: old.revision }] }), { status: 409 });
    await assert.rejects(() => repo.record({ actor: { ref: 'u-pm', name: 'Camila' }, access: factAccess(pm), user: pm, fact: { entidad: 'Cuenta ficticia', tema: 'cobro', afirmacion: 'Ya pagó.', proposito: 'financiero' } }), { status: 403 });
    await assert.rejects(() => repo.record({ actor: { ref: 'u-pm', name: 'Camila' }, access: factAccess(pm), user: pm, fact: { entidad: 'Brain Studio', tipoEntidad: 'agencia', tema: 'proceso', afirmacion: 'Regla general ficticia.', proposito: 'operacion' } }), { status: 403 });

    // A new reading never brings back what the team replaced.
    const changed = await repo.importReading({ facts: [fact('ficticia-001', { afirmacion: 'La lectura cambió de opinión.' }), ...reading.slice(1)], questions: [question], links, asOf: '2026-10-20', actor: reader });
    assert.equal(changed.keptByTeam, 1);
    assert.deepEqual((await repo.search(factAccess(pm), { clientId: 'client-1' })).map((f) => f.id), [saved.fact.id]);

    const retired = await repo.retire({ actor: { ref: 'u-pm', name: 'Camila' }, access: factAccess(pm), user: pm, id: saved.fact.id, revision: 1 });
    assert.equal(retired.status, 'RETIRED');
    assert.equal((await repo.search(factAccess(pm), { clientId: 'client-1' })).length, 0);
    assert.ok((await repo.history(factAccess(pm), saved.fact.id)).length >= 2, 'history survives retirement');
  } finally {
    await pool.query('DELETE FROM bria_memory.agency_fact_events WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.agency_facts WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.agency_questions WHERE workspace=$1', [workspace]);
    await pool.end();
  }
});
