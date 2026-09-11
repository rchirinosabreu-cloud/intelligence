import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive only. No old task/completedAt values are changed and no historical awards are emitted.
export async function ensureRecognitionsSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20260910, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "RecognitionAward" (
        "id" TEXT PRIMARY KEY, "dedupeKey" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL,
        "ruleVersion" INTEGER NOT NULL DEFAULT 1, "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "taskId" TEXT, "planId" TEXT, "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "dayKey" TEXT NOT NULL, "weekKey" TEXT NOT NULL, "evidence" JSONB NOT NULL,
        "seenAt" TIMESTAMPTZ, "leaseToken" TEXT, "leaseUntil" TIMESTAMPTZ);
      CREATE INDEX IF NOT EXISTS "RecognitionAward_recipientId_seenAt_occurredAt_idx" ON "RecognitionAward"("recipientId", "seenAt", "occurredAt");
      CREATE INDEX IF NOT EXISTS "RecognitionAward_taskId_idx" ON "RecognitionAward"("taskId");
      CREATE INDEX IF NOT EXISTS "RecognitionAward_planId_idx" ON "RecognitionAward"("planId");
      CREATE TABLE IF NOT EXISTS "RecognitionTaskState" (
        "taskId" TEXT PRIMARY KEY, "originalDueDate" TIMESTAMPTZ, "firstCompletedAt" TIMESTAMPTZ,
        "recipientId" TEXT, "dayKey" TEXT, "weekKey" TEXT);
      CREATE INDEX IF NOT EXISTS "RecognitionTaskState_dayKey_idx" ON "RecognitionTaskState"("dayKey");
      CREATE INDEX IF NOT EXISTS "RecognitionTaskState_recipientId_dayKey_idx" ON "RecognitionTaskState"("recipientId", "dayKey");
      CREATE INDEX IF NOT EXISTS "RecognitionTaskState_recipientId_weekKey_idx" ON "RecognitionTaskState"("recipientId", "weekKey");
      CREATE TABLE IF NOT EXISTS "RecognitionDebtState" (
        "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "taskIds" TEXT[] NOT NULL DEFAULT '{}', "blocked" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE IF NOT EXISTS "RecognitionPlanState" (
        "planId" TEXT PRIMARY KEY, "approvedIds" TEXT[] NOT NULL DEFAULT '{}', "awarded" BOOLEAN NOT NULL DEFAULT false);
    `);
    // Preserve known previous completions, including a task currently reopened, without awarding them.
    await client.query(`INSERT INTO "RecognitionTaskState" ("taskId", "originalDueDate", "firstCompletedAt", "recipientId", "dayKey", "weekKey")
      SELECT t.id, t."dueDate" AT TIME ZONE 'UTC', c.at, m."userId",
        to_char(c.at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'),
        to_char(date_trunc('week', c.at AT TIME ZONE 'America/Bogota'), 'YYYY-MM-DD')
      FROM "Task" t LEFT JOIN "TeamMember" m ON m.id = t."assigneeId"
      LEFT JOIN LATERAL (SELECT min(value) AS at FROM (
        SELECT t."completedAt" AT TIME ZONE 'UTC' AS value
        UNION ALL SELECT w."closedAt" AT TIME ZONE 'UTC' FROM "TaskWorkCycle" w WHERE w."taskId" = t.id AND w."closeReason" = 'COMPLETED'
      ) dates) c ON true
      ON CONFLICT ("taskId") DO NOTHING`);
    await client.query(`INSERT INTO "RecognitionPlanState" ("planId", "approvedIds", "awarded")
      SELECT p.id, coalesce(array_agg(i.id) FILTER (WHERE i.status = 'APROBADO'), '{}'),
        count(i.id) > 0 AND bool_and(i.status = 'APROBADO')
      FROM "ContentPlan" p LEFT JOIN "ContentItem" i ON i."planId" = p.id AND i."deletedAt" IS NULL
      GROUP BY p.id ON CONFLICT ("planId") DO NOTHING`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('[Recognition schema] Rollback failed:', e.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try { await client.connect(); await ensureRecognitionsSchema(client); console.log('[Recognition schema] Ready; no historical awards emitted.'); }
  catch (error) { console.error('[Recognition schema] Failed:', error.message); process.exitCode = 1; }
  finally { await client.end(); }
}
