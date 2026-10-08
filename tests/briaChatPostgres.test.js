import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';
import { drainBriaChatPurges } from '../src/services/briaChatPurge.js';
const connectionString = briaTestDatabaseUrl();

test('PostgreSQL hard delete cascades private bytes and turns, keeps learning, retries failed bucket deletion', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 3 }), workspace = `test:${randomUUID()}`, actor = { ref: 'owner', name: 'Prueba', role: 'ADMIN', accountIds: [] };
  let fail = true, purged = 0;
  const storage = { put: async (_workspace, _actor, id, file) => ({ storage_key: `bria-chat/${'a'.repeat(24)}/${'b'.repeat(24)}/${id}/${file.id}/original`, original_sha256: 'a'.repeat(64), size_bytes: file.buffer.length }), purgePrefix: async () => { if (fail) throw Error('offline'); purged++; } };
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-knowledge.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../scripts/sql/bria-conversations.sql', import.meta.url), 'utf8'));
    const learning = createBriaKnowledgeRepository({ pool, workspace });
    const saved = await learning.save({ actor, learning: { scope: 'PERSONAL', entity: 'Prueba', topic: 'Regla', text: 'Aprendizaje independiente.', kind: 'CONFIRMED', validFrom: '2026-10-07', validUntil: null } });
    const repository = createBriaConversationRepository({ pool, workspace, storage, requireStorage: true });
    const chat = await repository.create(actor);
    await repository.append(actor, chat.id, 0, 'Pregunta ficticia', { answer: 'Respuesta ficticia' }, [{ id: randomUUID(), name: 'fixture.txt', buffer: Buffer.from('evidencia privada'), mime: 'text/plain', text: 'evidencia privada', status: 'READ' }]);
    await assert.rejects(() => repository.remove({ ...actor, ref: 'other' }, chat.id, 1), { status: 404 });
    await assert.rejects(() => repository.remove(actor, chat.id, 0), { status: 409 });
    assert.deepEqual(await repository.remove(actor, chat.id, 1), { deleted: true, filesPending: true });
    assert.equal(await repository.get(actor, chat.id), null);
    for (const table of ['conversation_turns', 'conversation_attachments']) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM bria_memory.${table} WHERE conversation_id=$1`, [chat.id])).rows[0].n, 0);
    assert.equal((await learning.list(actor)).find(row => row.id === saved.id).text, 'Aprendizaje independiente.');
    assert.equal((await pool.query('SELECT attempts FROM bria_memory.conversation_purges WHERE id=$1', [chat.id])).rows[0].attempts, 1);
    fail = false; assert.equal(await drainBriaChatPurges({ pool, storage, id: chat.id }), true); assert.equal(purged, 1);
    await assert.rejects(() => repository.append(actor, chat.id, 1, 'Late', { answer: 'No' }), { status: 404 });
  } finally {
    await pool.query('DELETE FROM bria_memory.conversations WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.conversation_purges WHERE workspace=$1', [workspace]);
    await pool.query('DELETE FROM bria_memory.learning_events WHERE learning_id IN(SELECT id FROM bria_memory.learnings WHERE workspace=$1)', [workspace]);
    await pool.query('DELETE FROM bria_memory.learnings WHERE workspace=$1', [workspace]);
    await pool.end();
  }
});
