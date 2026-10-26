import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';
import { factAccess } from '../src/lib/briaAgencyFacts.js';

// This double exercises repository transaction control and persisted source
// identity offline. The companion PostgreSQL test verifies the actual SQL.
const fixture = () => {
  const rows = [], events = [], transactions = [];
  const db = { release() {}, async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) { transactions.push(sql); return { rows: [] }; }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.startsWith('INSERT INTO bria_memory.agency_facts(')) {
      const row = { id: values[1], workspace: values[0], client_id: values[2], entity: values[3], entity_key: values[4], entity_type: values[5], topic: values[6], statement: values[7], certainty: values[8], purpose: values[9], sensitivity: values[10], from_key: values[11], until_key: values[12], sources: JSON.parse(values[15]), origin: values[16], digest: values[17], actor_ref: values[18], actor_name: values[19], revision: 1, status: 'ACTIVE' };
      rows.push(row); return { rows: [row] };
    }
    if (sql.startsWith('INSERT INTO bria_memory.agency_fact_events(')) { events.push(values); return { rows: [] }; }
    if (sql.includes('f.digest=')) {
      return { rows: rows.filter(row => row.workspace === values[0] && row.digest === values[1] && row.client_id === values[2]
        && (!sql.includes("f.status='ACTIVE'") || row.status === 'ACTIVE')
        && (!sql.includes('f.actor_ref=$4') || row.actor_ref === values[3])
        && (!sql.includes('f.sources @>') || JSON.parse(values[4]).every(source => row.sources.some(stored => Object.entries(source).every(([key, value]) => stored[key] === value))))) };
    }
    throw new Error(`Unexpected fixture query: ${sql.slice(0, 100)}`);
  } };
  const user = { role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
  const source = { tipo: 'equipo', ref: 'Conversación ficticia', fecha: '2026-10-26', turno: 'fictional-chat:1', huellaMensaje: 'a'.repeat(64) };
  const input = { actor: { ref: 'u', name: 'Persona ficticia' }, access: factAccess(user), user, clientId: 'fictional-client', fact: { entidad: 'Cuenta ficticia', tema: 'acuerdo', afirmacion: 'Octubre no fue contratado.', certeza: 'CONFIRMADO', proposito: 'operacion', desde: '2026-10-01', hasta: '2026-10-31', fuentes: [source] } };
  return { repository: createBriaAgencyFactRepository({ pool: { connect: async () => db }, workspace: 'fictitious' }), rows, events, transactions, input, source };
};

for (const status of ['SUPERSEDED', 'RETIRED']) test(`a replay cannot recreate a ${status} fact from the same human turn`, async () => {
  const { repository, rows, events, transactions, input } = fixture();
  await repository.record(input);
  rows[0].status = status;
  rows[0].revision++;
  await assert.rejects(repository.record(input), { code: 'BRIA_FACT_CHANGED', status: 409 });
  assert.equal(rows.length, 1, 'the obsolete teaching must not be inserted again');
  assert.equal(events.length, 1, 'a rejected replay must not record a new confirmation');
  assert.equal(transactions.at(-1), 'ROLLBACK');
});

test('a new human turn may confirm the same content after a previous teaching was superseded', async () => {
  const { repository, rows, input, source } = fixture();
  const before = await repository.record(input);
  rows[0].status = 'SUPERSEDED';
  const after = await repository.record({ ...input, fact: { ...input.fact, fuentes: [{ ...source, turno: 'another-fictional-chat:1' }] } });
  assert.notEqual(after.fact.id, before.fact.id);
  assert.equal(after.fact.status, 'ACTIVE');
  assert.equal(rows.length, 2);
});
