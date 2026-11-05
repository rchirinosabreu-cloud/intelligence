import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AUDIT_TABLES, AUDIT_PURGE_SQL, ensureAuditImmutability } from '../src/lib/auditImmutability.js';
import { assertSharedTaskDatabase } from './support/sharedTaskSandbox.js';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';

const script = new URL('../scripts/ensure-task-participation-schema.js', import.meta.url);
const source = await readFile(script, 'utf8');
const loadEnsure = async () => {
  assert.match(source, /export async function ensureTaskParticipationSchema/, 'el esquema se puede verificar en una conexión aislada sin arrancar el CLI');
  return (await import(script.href)).ensureTaskParticipationSchema;
};

test('el instalador de participaciones se puede importar sin conectar la base del entorno', async () => {
  assert.equal(typeof await loadEnsure(), 'function');
  assert.match(source, /import\.meta\.url === pathToFileURL/);
});

const sharedTarget = process.env.SHARED_ARCHIVE_TEST_DATABASE_URL;
if (sharedTarget) assertSharedTaskDatabase(sharedTarget);
const connectionString = sharedTarget || briaTestDatabaseUrl();

for (const columnAlreadyPresent of [false, true]) test(`PostgreSQL: el archivo sobrevive al borrado de tarea (${columnAlreadyPresent ? 'columna creada previamente por Prisma' : 'migración inicial'})`, { skip: !connectionString }, async () => {
  const ensure = await loadEnsure();
  const client = new pg.Client({ connectionString });
  const schema = `task_archive_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE','EN_CURSO','REALIZADA','DEVUELTA');
      CREATE TABLE "Task" (id TEXT PRIMARY KEY);
      CREATE TABLE "TaskCollaborator" (id TEXT PRIMARY KEY);
      CREATE TABLE "TaskWorkSession" (id TEXT PRIMARY KEY);
      CREATE TABLE "TaskParticipationArchive" (
        id TEXT PRIMARY KEY, "taskId" TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
        ${columnAlreadyPresent ? '"currentTaskId" TEXT,' : ''}
        "memberId" TEXT NOT NULL, "userId" TEXT, "memberName" TEXT, role TEXT NOT NULL, status "TaskStatus" NOT NULL,
        "completedAt" TIMESTAMPTZ(3), "returnedAt" TIMESTAMPTZ(3), "returnCount" INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 0, "baselineWorkMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "removedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "Task" VALUES ('legacy'), ('current');
      INSERT INTO "TaskParticipationArchive" (id,"taskId","memberId",role,status,revision,"baselineWorkMs")
        VALUES ('archive','legacy','ana','COLLABORATOR','REALIZADA',8,123000)`);
    await ensure(client);
    const archived = (await client.query('SELECT * FROM "TaskParticipationArchive" WHERE id=$1', ['archive'])).rows[0];
    assert.equal(archived.taskId, 'legacy'); assert.equal(archived.currentTaskId, 'legacy');
    assert.equal(archived.revision, 8); assert.equal(archived.baselineWorkMs, 123000);
    const spec = AUDIT_TABLES.find(row => row.name === 'TaskParticipationArchive');
    assert.ok(spec); assert.deepEqual(spec.nullableRefs, ['currentTaskId']); assert.equal(spec.retention, null);
    const protectedTable = { ...spec, schema };
    await ensureAuditImmutability(client, { tables: [protectedTable], functionSchema: schema });
    await ensure(client);
    await client.query('DELETE FROM "Task" WHERE id=$1', ['legacy']);
    const kept = (await client.query('SELECT * FROM "TaskParticipationArchive" WHERE id=$1', ['archive'])).rows[0];
    assert.deepEqual(kept, { ...archived, currentTaskId: null });
    const rejected = /no se puede modificar ni borrar/;
    await assert.rejects(client.query('UPDATE "TaskParticipationArchive" SET status=$1', ['PENDIENTE']), rejected);
    await assert.rejects(client.query('UPDATE "TaskParticipationArchive" SET "taskId"=$1', ['current']), rejected);
    await assert.rejects(client.query('DELETE FROM "TaskParticipationArchive"'), rejected);
    await assert.rejects(client.query('TRUNCATE "TaskParticipationArchive"'), rejected);
    await client.query('BEGIN'); await client.query(AUDIT_PURGE_SQL);
    await assert.rejects(client.query('DELETE FROM "TaskParticipationArchive"'), rejected);
    await client.query('ROLLBACK');
    // Reiniciar después de borrar (incluso si alguien reutilizara el ID) no vuelve a ligar un archivo protegido.
    await client.query('INSERT INTO "Task" VALUES ($1)', ['legacy']);
    await ensure(client);
    assert.equal((await client.query('SELECT "currentTaskId" FROM "TaskParticipationArchive" WHERE id=$1', ['archive'])).rows[0].currentTaskId, null);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
