import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ensureContentPeriodTransferSchema } from '../scripts/ensure-content-period-transfer-schema.js';
import { ensureAuditImmutability, AUDIT_TABLES } from '../src/lib/auditImmutability.js';
import { assertSharedTaskDatabase, SHARED_TEST_DATABASE_URL } from './support/sharedTaskSandbox.js';

test('esquema aditivo e historial de traslados inmutable, sin borrar evidencia al retirar la parrilla', async () => {
  assertSharedTaskDatabase(process.env.DATABASE_URL);
  assert.equal(process.env.NODE_ENV, 'test');
  const db = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  const scratch = `period_transfer_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await db.connect();
  try {
    const identity = (await db.query('SELECT current_database() AS database, current_user AS username, inet_server_port() AS port')).rows[0];
    assert.deepEqual(identity, { database: 'shared_tasks_demo', username: 'shared_tasks_test', port: 55451 });
    await db.query(`CREATE SCHEMA ${scratch}`);
    await db.query(`SET search_path TO ${scratch}, public`);
    await db.query('CREATE TABLE "ContentPlan" (id TEXT PRIMARY KEY)');
    await db.query('INSERT INTO "ContentPlan" VALUES (\'original\')');
    await ensureContentPeriodTransferSchema(db); await ensureContentPeriodTransferSchema(db);
    assert.equal((await db.query('SELECT "autoCreatedForTransfer" FROM "ContentPlan"')).rows[0].autoCreatedForTransfer, false);
    await ensureAuditImmutability(db, { tables: AUDIT_TABLES.filter(t => t.name === 'ContentItemPeriodChange').map(t => ({ ...t, schema: scratch })), functionSchema: scratch });
    await db.query(`INSERT INTO "ContentItemPeriodChange" (id,"itemId","fromPlanId","toPlanId","previousDate","nextDate","fromYear","fromMonth","toYear","toMonth")
      VALUES ('event','piece','original','next','2026-10-15','2026-11-15',2026,10,2026,11)`);
    for (const sql of ['UPDATE "ContentItemPeriodChange" SET "toMonth"=12', 'DELETE FROM "ContentItemPeriodChange"', 'TRUNCATE "ContentItemPeriodChange"']) {
      await assert.rejects(db.query(sql), /no se puede modificar ni borrar/);
    }
    await db.query('DELETE FROM "ContentPlan"');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "ContentItemPeriodChange"')).rows[0].count, 1);
  } finally {
    await db.query('SET search_path TO public');
    await db.query(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`);
    await db.end();
  }
});
