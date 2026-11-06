import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ensureTaskDeliverableSchema } from '../scripts/ensure-task-deliverable-schema.js';
import { ensureAuditImmutability, AUDIT_TABLES, AUDIT_PURGE_SQL } from '../src/lib/auditImmutability.js';
import { assertSharedTaskDatabase, SHARED_TEST_DATABASE_URL } from './support/sharedTaskSandbox.js';

test('PostgreSQL: ambas historias son inmutables y borrar la tarea encola archivos sin borrar su historia', async () => {
  assertSharedTaskDatabase(process.env.DATABASE_URL);
  assert.equal(process.env.NODE_ENV, 'test');
  const client = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  const scratch = `task_delivery_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await client.connect();
  try {
    const identity = (await client.query('SELECT current_database() AS database, current_user AS username, inet_server_port() AS port')).rows[0];
    assert.deepEqual(identity, { database: 'shared_tasks_demo', username: 'shared_tasks_test', port: 55451 });
    await client.query(`CREATE SCHEMA ${scratch}`);
    await client.query(`SET search_path TO ${scratch}, public`);
    await client.query('CREATE TABLE "Task" (id TEXT PRIMARY KEY)');
    await ensureTaskDeliverableSchema(client);
    await ensureTaskDeliverableSchema(client);
    await client.query('CREATE TABLE "ContentItemDeliveryChange" (LIKE public."ContentItemDeliveryChange" INCLUDING DEFAULTS)');
    const tables = AUDIT_TABLES.filter(spec => ['TaskDeliverableEvent', 'ContentItemDeliveryChange'].includes(spec.name)).map(spec => ({ ...spec, schema: scratch }));
    const installed = await ensureAuditImmutability(client, { tables, functionSchema: scratch });
    assert.equal(installed.protected.length, 2);
    assert.deepEqual((await ensureAuditImmutability(client, { tables, functionSchema: scratch })).changed, []);
    await client.query('INSERT INTO "Task"(id) VALUES ($1)', ['task']);
    await client.query('INSERT INTO "TaskDeliverable"(id,"taskId","storageKey",name,"mimeType",size,position,"authorId","authorName") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      ['file', 'task', 'task-deliverables/task/files/file', 'master.mov', 'video/quicktime', 2147483648, 0, 'actor', 'Persona ficticia']);
    await client.query('INSERT INTO "TaskDeliverableEvent"(id,"taskId","requestId","requestHash",revision,action,"actorId","actorName",files,"previousFiles") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      ['event', 'task', randomUUID(), 'hash', 1, 'DELIVERED', 'actor', 'Persona ficticia', JSON.stringify([{ name: 'master.mov', size: 2147483648 }]), '[]']);
    await client.query('INSERT INTO "ContentItemDeliveryChange"(id,"contentItemId",revision,action,"actorId","actorName",files,"previousFiles") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      ['content-event', 'piece', 1, 'DELIVERED', 'actor', 'Persona ficticia', '[]', '[]']);
    const rejected = /no se puede modificar ni borrar/;
    for (const { name } of tables) {
      await assert.rejects(client.query(`UPDATE "${name}" SET "actorName"='Otra persona'`), rejected);
      await assert.rejects(client.query(`DELETE FROM "${name}"`), rejected);
      await assert.rejects(client.query(`TRUNCATE "${name}"`), rejected);
      await client.query('BEGIN');
      await client.query(AUDIT_PURGE_SQL);
      await assert.rejects(client.query(`DELETE FROM "${name}"`), rejected, 'la marca de purga no concede retención inexistente');
      await client.query('ROLLBACK');
    }
    await client.query('DELETE FROM "Task" WHERE id=$1', ['task']);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "TaskDeliverable"')).rows[0].count, 0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "TaskDeliverableEvent"')).rows[0].count, 1);
    assert.deepEqual((await client.query('SELECT "taskId","storageKey" FROM "TaskDeliverableCleanup"')).rows, [{ taskId: 'task', storageKey: 'task-deliverables/task/files/file' }]);
    assert.equal((await client.query('SELECT "actorName" FROM "TaskDeliverableEvent"')).rows[0].actorName, 'Persona ficticia');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`);
    await client.end();
  }
});
