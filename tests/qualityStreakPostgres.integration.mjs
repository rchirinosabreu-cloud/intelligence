import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { ensureQualityStreakSchema } from '../scripts/ensure-quality-streak-schema.js';

// Exact dedicated local cluster only; never load .env or use the application's connection.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required; never load .env.');
const target = new URL(url);
if (target.hostname !== '127.0.0.1' || target.port !== '55448' || target.pathname !== '/recognition_test' || target.username !== 'recognition_test') {
  throw new Error('Refusing non-isolated quality streak database.');
}
const namespace = `quality_streak_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(url);
isolated.searchParams.set('schema', namespace);
process.env.DATABASE_URL = isolated.href;
process.env.NODE_ENV = 'test';
const sql = new pg.Client({ connectionString: url });
const db = new PrismaClient({ datasources: { db: { url: isolated.href } } });
globalThis.prisma = db;
const { recognitionTransaction } = await import('../src/services/recognitionService.js');
const { getQualityStreak, recordQualityStreakTransition } = await import('../src/services/qualityStreakService.js');
const { auditAndDeleteTask, updateTask } = await import('../src/services/nativeTaskService.js');
let client;

test.before(async () => {
  await sql.connect();
  const identity = (await sql.query('SELECT current_database() AS db, current_user AS username, inet_server_port() AS port')).rows[0];
  assert.deepEqual(identity, { db: 'recognition_test', username: 'recognition_test', port: 55448 });
  await sql.query(`CREATE SCHEMA "${namespace}"`);
  await sql.query(`SET search_path TO "${namespace}"`);
  // Generate DDL only; no db push, migrations, or modifications to another schema.
  let ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: isolated.href }, maxBuffer: 10 * 1024 * 1024,
  });
  ddl = ddl.replace(/CREATE SCHEMA IF NOT EXISTS "public";/, '');
  assert.doesNotMatch(ddl, /"public"\./);
  // Begin with the old SystemStreak table to exercise the real additive upgrade.
  ddl = ddl.replace(/CREATE TABLE "SystemStreak" \([\s\S]*?\n\);/, table => table.replace(/^\s+"(?:cleanSinceAt|trackingStartedAt)" TIMESTAMPTZ(?:\(\d+\))?,?\r?\n/gm, ''));
  const tables = new Set(['SystemStreak', 'User', 'TeamMember', 'Client', 'Task', 'DeletedTaskLog', 'TaskWorkCycle', 'TaskWorkSession', 'TaskComment', 'TaskAttachment', 'TaskCommentReaction', 'TaskFollower', 'RecognitionTaskState', 'RecognitionDebtState', 'RecognitionAward', 'RecognitionPlanState', 'OperationalTraceEvent', 'Notification', 'PushSubscription', 'ContentPlan', 'ContentItem']);
  for (const [statement] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g)) await sql.query(statement);
  for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) if (tables.has(name)) await sql.query(statement);
  for (const [statement, name] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]*;/g)) if (tables.has(name)) await sql.query(statement);
  for (const [statement, from, to] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY[^;]*?REFERENCES "([^"]+)"[^;]*;/g)) if (tables.has(from) && tables.has(to)) await sql.query(statement);
  client = await db.client.create({ data: { name: 'Quality streak isolated', slug: randomUUID() } });
});

test.after(async () => {
  await db.$disconnect();
  if (!/^quality_streak_[a-f0-9]{32}$/.test(namespace)) throw new Error('Unsafe test schema cleanup');
  // Only this test's freshly-created namespace is removed, never public or shared fixtures.
  await sql.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
  await sql.end();
});

const task = (status = 'DEVUELTA') => db.task.create({ data: { title: 'Devolución de prueba', clientId: client.id, status } });
const seedStreak = async (data = {}) => {
  await db.task.deleteMany();
  await db.deletedTaskLog.deleteMany();
  return db.systemStreak.upsert({ where: { id: 'global' }, create: { id: 'global', ...data }, update: {
    currentStreak: 3, highestStreak: 9, cleanSinceAt: null, trackingStartedAt: null,
    lastResetAt: new Date('2026-09-10T05:00:00Z'), lastIncrementedAt: new Date('2026-09-13T05:00:00Z'), ...data,
  } });
};

test('real additive bootstrap is idempotent and leaves counters, historical dates and completed tasks intact', async () => {
  await sql.query(`INSERT INTO "SystemStreak" ("id", "currentStreak", "highestStreak", "lastResetAt", "lastIncrementedAt", "updatedAt")
    VALUES ('global', 3, 9, '2026-09-10T05:00:00Z', '2026-09-13T05:00:00Z', '2026-09-14T12:00:00Z')`);
  const before = (await sql.query('SELECT * FROM "SystemStreak"')).rows[0];
  const completed = await db.task.create({ data: { title: 'Historical completion', clientId: client.id, status: 'REALIZADA', completedAt: new Date('2026-09-01T15:00:00Z') } });
  await ensureQualityStreakSchema(sql);
  await ensureQualityStreakSchema(sql);
  const after = (await sql.query('SELECT * FROM "SystemStreak"')).rows[0];
  assert.deepEqual(after, { ...before, cleanSinceAt: null, trackingStartedAt: null });
  assert.equal((await db.task.findUnique({ where: { id: completed.id } })).completedAt.toISOString(), '2026-09-01T15:00:00.000Z');
});

test('audited native deletion starts at zero, retains the historical record and stores its audit entry', async () => {
  await seedStreak();
  const returned = await task();
  const result = await auditAndDeleteTask(returned.id, 'Duplicado de prueba');
  assert.deepEqual(result, { success: true });
  assert.equal(await db.task.findUnique({ where: { id: returned.id } }), null);
  assert.equal(await db.deletedTaskLog.count({ where: { originalTaskId: returned.id } }), 1);
  const current = await getQualityStreak(db);
  assert.equal(current.currentStreakDays, 0);
  assert.equal(current.currentReturnedTasksCount, 0);
  assert.equal(current.maxStreak, 9);
  assert.ok((await db.systemStreak.findUnique({ where: { id: 'global' } })).cleanSinceAt);
});

test('concurrent read and deletion never restore the three stale days', async () => {
  const at = new Date('2026-09-14T15:00:00Z');
  await seedStreak({ trackingStartedAt: new Date('2026-09-10T05:00:00Z') });
  const returned = await task();
  await Promise.all([
    getQualityStreak(db, at),
    recognitionTransaction(db, async tx => {
      const before = await tx.task.findUnique({ where: { id: returned.id } });
      await tx.task.delete({ where: { id: returned.id } });
      await recordQualityStreakTransition(tx, before, null, at);
    }),
  ]);
  const current = await getQualityStreak(db, at);
  assert.equal(current.currentStreakDays, 0);
  assert.equal(current.currentReturnedTasksCount, 0);
  assert.equal((await db.systemStreak.findUnique({ where: { id: 'global' } })).cleanSinceAt.toISOString(), at.toISOString());
});

test('native reintegration of the last returned task starts a new clean period at zero', async () => {
  await seedStreak();
  const returned = await task();
  const user = await db.user.create({ data: { name: 'Actor de prueba', email: `${randomUUID()}@example.invalid`, password: 'not-a-login', role: 'EDITOR' } });
  const result = await updateTask(returned.id, { status: 'PENDIENTE', reintegrateReason: 'Ajuste revisado en prueba aislada' }, user.id);
  assert.equal(result.status, 'PENDIENTE');
  const current = await getQualityStreak(db);
  assert.equal(current.currentStreakDays, 0);
  assert.equal(current.currentReturnedTasksCount, 0);
  assert.equal(current.maxStreak, 9);
  assert.ok((await db.systemStreak.findUnique({ where: { id: 'global' } })).cleanSinceAt);
});

test('concurrent read and return commit a blocked zero streak instead of overwriting it with accumulated days', async () => {
  const at = new Date('2026-09-14T15:00:00Z');
  await seedStreak({ cleanSinceAt: new Date('2026-09-10T05:00:00Z'), trackingStartedAt: new Date('2026-09-10T05:00:00Z') });
  const pending = await task('PENDIENTE');
  await Promise.all([
    getQualityStreak(db, at),
    recognitionTransaction(db, async tx => {
      const before = await tx.task.findUnique({ where: { id: pending.id } });
      const after = await tx.task.update({ where: { id: pending.id }, data: { status: 'DEVUELTA', returnedAt: at } });
      await recordQualityStreakTransition(tx, before, after, at);
    }),
  ]);
  const current = await getQualityStreak(db, at);
  assert.equal(current.currentStreakDays, 0);
  assert.equal(current.currentReturnedTasksCount, 1);
  assert.equal((await db.systemStreak.findUnique({ where: { id: 'global' } })).cleanSinceAt, null);
});

test('a real database error saving the streak rolls back both the audited deletion and its audit log', async t => {
  await seedStreak();
  const returned = await task();
  await sql.query(`CREATE FUNCTION fail_streak_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated streak persistence failure'; END; $$;
    CREATE TRIGGER fail_streak_write BEFORE UPDATE ON "SystemStreak" FOR EACH ROW EXECUTE FUNCTION fail_streak_write();`);
  const logs = t.mock.method(console, 'error', () => {});
  try {
    await assert.rejects(auditAndDeleteTask(returned.id, 'Should roll back'), /Simulated streak persistence failure/);
    assert.equal((await db.task.findUnique({ where: { id: returned.id } })).status, 'DEVUELTA');
    assert.equal(await db.deletedTaskLog.count({ where: { originalTaskId: returned.id } }), 0);
    assert.equal((await db.systemStreak.findUnique({ where: { id: 'global' } })).currentStreak, 3);
    assert.ok(logs.mock.callCount() > 0);
  } finally {
    await sql.query('DROP TRIGGER fail_streak_write ON "SystemStreak"; DROP FUNCTION fail_streak_write();');
  }
});

test('the CI database suite also passes inside the isolated test namespace', async () => {
  await seedStreak();
  const childEnv = { ...process.env, TEST_DATABASE_URL: isolated.href, DATABASE_URL: isolated.href, NODE_ENV: 'test' };
  delete childEnv.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ['--test', 'tests/qualityStreak.test.js'], {
    encoding: 'utf8', env: childEnv,
    timeout: 30000,
  });
  assert.match(output, /pass 6\b/);
  assert.match(output, /fail 0\b/);
  assert.match(output, /skipped 0\b/);
});
