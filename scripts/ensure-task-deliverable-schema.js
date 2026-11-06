import pg from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function ensureTaskDeliverableSchema(client) {
  await client.query(`
    ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deliverableRevision" INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS "TaskDeliverable" (
      "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "storageKey" TEXT NOT NULL, "storageArea" TEXT NOT NULL DEFAULT 'LEGACY', "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
      "size" BIGINT NOT NULL CHECK ("size" > 0 AND "size" <= 2147483648), "position" INTEGER NOT NULL CHECK ("position" >= 0),
      "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "TaskDeliverable" ADD COLUMN IF NOT EXISTS "storageArea" TEXT NOT NULL DEFAULT 'LEGACY';
    CREATE UNIQUE INDEX IF NOT EXISTS "TaskDeliverable_storageArea_storageKey_key" ON "TaskDeliverable"("storageArea", "storageKey");
    DROP INDEX IF EXISTS "TaskDeliverable_storageKey_key";
    CREATE INDEX IF NOT EXISTS "TaskDeliverable_taskId_position_idx" ON "TaskDeliverable"("taskId", "position");
    CREATE TABLE IF NOT EXISTS "TaskDeliverableEvent" (
      "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
      "revision" INTEGER NOT NULL, "action" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
      "cycleId" TEXT, "files" JSONB NOT NULL, "previousFiles" JSONB NOT NULL,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TaskDeliverableEvent_taskId_requestId_key" ON "TaskDeliverableEvent"("taskId", "requestId");
    CREATE UNIQUE INDEX IF NOT EXISTS "TaskDeliverableEvent_taskId_revision_key" ON "TaskDeliverableEvent"("taskId", "revision");
    CREATE TABLE IF NOT EXISTS "TaskDeliverableCleanup" (
      "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "storageArea" TEXT NOT NULL DEFAULT 'LEGACY',
      "attempts" INTEGER NOT NULL DEFAULT 0, "lastErrorCode" TEXT,
      "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "TaskDeliverableCleanup" ADD COLUMN IF NOT EXISTS "storageArea" TEXT NOT NULL DEFAULT 'LEGACY';
    CREATE UNIQUE INDEX IF NOT EXISTS "TaskDeliverableCleanup_storageArea_storageKey_key" ON "TaskDeliverableCleanup"("storageArea", "storageKey");
    DROP INDEX IF EXISTS "TaskDeliverableCleanup_storageKey_key";
    CREATE INDEX IF NOT EXISTS "TaskDeliverableCleanup_nextAttemptAt_idx" ON "TaskDeliverableCleanup"("nextAttemptAt");
    CREATE OR REPLACE FUNCTION brainstudio_task_deliverable_cleanup() RETURNS trigger LANGUAGE plpgsql AS $cleanup$
    BEGIN
      INSERT INTO "TaskDeliverableCleanup" ("id", "taskId", "storageKey", "storageArea", "nextAttemptAt")
      VALUES (gen_random_uuid()::text, OLD."taskId", OLD."storageKey", OLD."storageArea", CURRENT_TIMESTAMP)
      ON CONFLICT ("storageArea", "storageKey") DO UPDATE SET "nextAttemptAt" = LEAST("TaskDeliverableCleanup"."nextAttemptAt", CURRENT_TIMESTAMP);
      RETURN OLD;
    END $cleanup$;
    DO $install$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = '"TaskDeliverable"'::regclass AND tgname = 'task_deliverable_cleanup_before_delete' AND NOT tgisinternal) THEN
        CREATE TRIGGER task_deliverable_cleanup_before_delete BEFORE DELETE ON "TaskDeliverable"
          FOR EACH ROW EXECUTE FUNCTION brainstudio_task_deliverable_cleanup();
      END IF;
    END $install$;
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureTaskDeliverableSchema(client); console.log('[Entregas de tarea] Esquema aditivo listo.'); }
  catch (error) { console.error('[Entregas de tarea] No se pudo preparar el esquema:', error.code || 'UNKNOWN'); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
