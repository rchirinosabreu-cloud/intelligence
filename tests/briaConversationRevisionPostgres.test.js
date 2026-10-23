import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';

const connectionString = briaTestDatabaseUrl();
test('PostgreSQL rechaza la aprobación anterior y solo ejecuta una vez dos confirmaciones simultáneas de la revisión actual', { skip: !connectionString }, async () => {
  const database = new pg.Pool({ connectionString, max: 4 });
  const schema = `bria_revision_${randomUUID().replaceAll('-', '')}`;
  // Solo tablas laterales en un esquema desechable; no depende de las tablas de negocio ni de Prisma.
  const sql = statement => statement.replaceAll('bria_memory', schema);
  const pool = {
    query: (statement, values) => database.query(sql(statement), values),
    connect: async () => {
      const client = await database.connect();
      return { query: (statement, values) => client.query(sql(statement), values), release: () => client.release() };
    }
  };
  let created = false, calls = 0;
  try {
    await database.query(`CREATE SCHEMA ${schema}`); created = true;
    await pool.query(await readFile(new URL('../scripts/sql/bria-conversations.sql', import.meta.url), 'utf8'));
    const actor = { ref: 'owner', role: 'ADMIN' }, repository = createBriaConversationRepository({ pool, workspace: 'revision-test' });
    const chat = await repository.create(actor);
    await repository.append(actor, chat.id, 0, 'Prepara', { answer: 'Mover al lunes' });
    await repository.append(actor, chat.id, 1, 'Cambia la fecha', { answer: 'Mover al viernes' });
    const execute = async () => { calls++; return { answer: 'Listo' }; };
    await assert.rejects(repository.append(actor, chat.id, 1, 'Confirmar', execute), { status: 409, code: 'BRIA_CONVERSATION_STALE' });
    assert.equal(calls, 0);
    const confirmed = await Promise.allSettled([
      repository.append(actor, chat.id, 2, 'Confirmar', execute),
      repository.append(actor, chat.id, 2, 'Confirmar', execute)
    ]);
    assert.equal(confirmed.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(confirmed.find(result => result.status === 'rejected').reason.code, 'BRIA_CONVERSATION_STALE');
    assert.equal(calls, 1);
    assert.equal((await repository.get(actor, chat.id)).revision, 3);
  } finally {
    if (created) await database.query(`DROP SCHEMA ${schema} CASCADE`);
    await database.end();
  }
});
