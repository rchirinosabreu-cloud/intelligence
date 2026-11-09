import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { SHARED_TEST_DATABASE_URL } from './support/sharedTaskSandbox.js';
import { ensureTaskCardOrderSchema } from '../scripts/ensure-task-card-order-schema.js';

test('ensure aditivo e idempotente: conserva tarea legada, distingue personas y restringe posiciones inválidas', async () => {
  const db = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  const schema = `card_order_${randomUUID().replaceAll('-', '')}`;
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}"`);
    await db.query('CREATE TYPE "TaskStatus" AS ENUM (\'PENDIENTE\',\'EN_CURSO\',\'DEVUELTA\',\'REALIZADA\')');
    await db.query('CREATE TABLE "Task" (id text PRIMARY KEY, history text)');
    await db.query('INSERT INTO "Task" VALUES (\'legacy\',\'Historia preservada\')');
    await ensureTaskCardOrderSchema(db);
    await db.query('INSERT INTO "TaskCardOrder" ("taskId", "memberId", status, "sortOrder") VALUES (\'legacy\',\'ana\',\'PENDIENTE\',0),(\'legacy\',\'bea\',\'PENDIENTE\',1)');
    await ensureTaskCardOrderSchema(db);
    assert.equal((await db.query('SELECT * FROM "TaskCardOrder"')).rowCount, 2);
    assert.equal((await db.query('SELECT history FROM "Task"')).rows[0].history, 'Historia preservada');
    for (const [taskId, memberId, sortOrder, expected] of [['legacy','ana',2,'23505'],['legacy','carlos',-1,'23514'],['missing','ana',0,'23503']]) {
      await db.query('SAVEPOINT invalid');
      await assert.rejects(db.query('INSERT INTO "TaskCardOrder" ("taskId","memberId",status,"sortOrder") VALUES ($1,$2,\'PENDIENTE\',$3)', [taskId,memberId,sortOrder]), e => e.code === expected);
      await db.query('ROLLBACK TO SAVEPOINT invalid');
    }
    await db.query('DELETE FROM "TaskCardOrder" WHERE "memberId"=\'ana\'');
    assert.equal((await db.query('SELECT * FROM "Task"')).rowCount, 1);
    assert.equal((await db.query('SELECT "memberId" FROM "TaskCardOrder"')).rows[0].memberId, 'bea');
  } finally { await db.query('ROLLBACK'); await db.end(); }
});
