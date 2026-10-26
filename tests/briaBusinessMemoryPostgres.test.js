import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';
import { createBriaKnowledgeService } from '../src/services/briaKnowledgeService.js';

const connectionString = briaTestDatabaseUrl();
test('real PostgreSQL: old business learning remains available without migration or leaking personal memories', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 2 });
  const workspace = `legacy-memory:${randomUUID()}`, suffix = randomUUID();
  const admin = { ref: 'u-legacy', name: 'Persona ficticia', role: 'ADMIN', accountIds: [] };
  const clients = [{ id: `f-${suffix}`, name: `Faro ${suffix}`, slug: `faro-${suffix}` }, { id: `l-${suffix}`, name: `Luna ${suffix}`, slug: `luna-${suffix}` }];
  const duplicate = { id: `d-${suffix}`, name: clients[0].name, slug: `duplicada-${suffix}` };
  const base = { scope: 'ACCOUNT', entity: clients[0].id, topic: 'acuerdo', text: 'La entrega de octubre era exploratoria.', kind: 'CONFIRMED', validFrom: '2026-10-01', validUntil: '2026-10-31' };
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-knowledge.sql', import.meta.url), 'utf8'));
    for (const client of [...clients, duplicate]) await pool.query('INSERT INTO "Client"(id,name,slug) VALUES($1,$2,$3)', [client.id, client.name, client.slug]);
    const repository = createBriaKnowledgeRepository({ pool, workspace });
    const account = await repository.save({ actor: admin, learning: base });
    const proposal = await repository.save({ actor: admin, learning: { ...base, scope: 'AGENCY', entity: 'Brainstudio', topic: 'prioridades', kind: 'PROPOSAL' } });
    const slugAccount = await repository.save({ actor: admin, learning: { ...base, entity: clients[1].slug } });
    const ambiguous = await repository.save({ actor: admin, learning: { ...base, entity: clients[0].name } });
    const retired = await repository.save({ actor: admin, learning: { ...base, topic: 'retirado' } });
    await repository.revoke({ actor: admin, id: retired.id, expectedRevision: 1 });
    const personalIds = [];
    for (let i = 0; i < 9; i++) personalIds.push((await repository.save({ actor: admin, learning: { ...base, scope: 'PERSONAL', topic: `privado-${i}` } })).id);
    const count = () => pool.query('SELECT count(*)::int AS n FROM bria_memory.learning_events WHERE learning_id IN (SELECT id FROM bria_memory.learnings WHERE workspace=$1)', [workspace]);
    const before = (await count()).rows[0].n;
    // New service/repository instance: persisted old facts, no conversion to agency_facts.
    const restarted = createBriaKnowledgeService({ repository: createBriaKnowledgeRepository({ pool, workspace }), resolveActor: async () => admin });
    const result = await restarted.businessContext({}, clients);
    assert.deepEqual(result.accounts[0].learnings.map(row => row.id), [account.id]);
    assert.deepEqual(result.accounts[1].learnings.map(row => row.id), [slugAccount.id]);
    assert.equal(result.agency.learnings[0].id, proposal.id);
    assert.equal(result.agency.learnings[0].kind, 'PROPOSAL');
    assert.equal(result.accounts[0].learnings[0].validUntil, '2026-10-31');
    const adminRows = await repository.businessContext(admin, clients, 1);
    assert.equal(adminRows.length, 3, 'personal rows do not consume the per-account or agency limit');
    assert.equal(adminRows.some(row => row.id === ambiguous.id || row.id === retired.id || personalIds.includes(row.id)), false);
    const restricted = { ref: 'pm', role: 'PROJECT_MANAGER', accountIds: [clients[0].id] };
    assert.deepEqual((await repository.businessContext(restricted, clients, 1)).map(row => row.id).sort(), [account.id, proposal.id].sort());
    assert.deepEqual((await repository.getBusinessMany(restricted, [account.id, proposal.id, slugAccount.id, retired.id, ...personalIds])).map(row => row.id).sort(), [account.id, proposal.id].sort());
    assert.equal((await count()).rows[0].n, before, 'context reading writes no events or migrations');
  } finally {
    await pool.query('DELETE FROM bria_memory.learning_events WHERE learning_id IN (SELECT id FROM bria_memory.learnings WHERE workspace=$1)', [workspace]);
    await pool.query('DELETE FROM bria_memory.learnings WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM "Client" WHERE id=ANY($1::text[])', [[...clients, duplicate].map(row => row.id)]);
    await pool.end();
  }
});
