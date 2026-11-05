import pg from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function ensureTaskParticipationSchema(client) {
  await client.query(`ALTER TABLE "Task"
    ADD COLUMN IF NOT EXISTS "sharedProgress" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "assigneeStatus" "TaskStatus",
    ADD COLUMN IF NOT EXISTS "assigneeCompletedAt" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "assigneeReturnedAt" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "assigneeReturnCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "assigneeRevision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "assigneeBaselineWorkMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "rosterVersion" INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "TaskCollaborator"
    ADD COLUMN IF NOT EXISTS "status" "TaskStatus",
    ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "returnCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "baselineWorkMs" DOUBLE PRECISION NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "Task_assigneeStatus_assigneeCompletedAt_idx" ON "Task"("assigneeStatus", "assigneeCompletedAt");
    CREATE INDEX IF NOT EXISTS "TaskCollaborator_status_completedAt_idx" ON "TaskCollaborator"("status", "completedAt");
    CREATE TABLE IF NOT EXISTS "TaskParticipationArchive" (
      "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL,
      "currentTaskId" TEXT REFERENCES "Task"("id") ON DELETE SET NULL,
      "memberId" TEXT NOT NULL, "userId" TEXT, "memberName" TEXT, "role" TEXT NOT NULL, "status" "TaskStatus" NOT NULL,
      "completedAt" TIMESTAMPTZ(3), "returnedAt" TIMESTAMPTZ(3), "returnCount" INTEGER NOT NULL DEFAULT 0,
      "revision" INTEGER NOT NULL DEFAULT 0, "baselineWorkMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "removedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    DO $archive_relation$
    DECLARE old_fk record;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"TaskParticipationArchive"'::regclass
        AND attname = 'currentTaskId' AND NOT attisdropped) THEN
        ALTER TABLE "TaskParticipationArchive" ADD COLUMN "currentTaskId" TEXT;
      END IF;
      -- Migración inicial, incluso si Prisma ya agregó la columna. Una vez protegido, no vuelve a
      -- enlazar archivos que quedaron NULL al borrar la tarea, ni siquiera si se reutiliza su ID.
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = '"TaskParticipationArchive"'::regclass
        AND tgname = 'brainstudio_audit_immutable' AND NOT tgisinternal) THEN
        UPDATE "TaskParticipationArchive" AS archive SET "currentTaskId" = archive."taskId"
          WHERE archive."currentTaskId" IS NULL AND EXISTS (SELECT 1 FROM "Task" WHERE id = archive."taskId");
      END IF;
      FOR old_fk IN SELECT constraint_row.conname FROM pg_constraint AS constraint_row
        JOIN pg_attribute AS attribute ON attribute.attrelid = constraint_row.conrelid
          AND attribute.attnum = ANY(constraint_row.conkey)
        WHERE constraint_row.conrelid = '"TaskParticipationArchive"'::regclass
          AND constraint_row.contype = 'f' AND attribute.attname = 'taskId'
      LOOP
        EXECUTE format('ALTER TABLE "TaskParticipationArchive" DROP CONSTRAINT %I', old_fk.conname);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"TaskParticipationArchive"'::regclass
        AND conname = 'TaskParticipationArchive_currentTaskId_fkey') THEN
        ALTER TABLE "TaskParticipationArchive" ADD CONSTRAINT "TaskParticipationArchive_currentTaskId_fkey"
          FOREIGN KEY ("currentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL;
      END IF;
    END $archive_relation$;
    CREATE INDEX IF NOT EXISTS "TaskParticipationArchive_taskId_memberId_idx" ON "TaskParticipationArchive"("taskId", "memberId");
    CREATE INDEX IF NOT EXISTS "TaskParticipationArchive_currentTaskId_idx" ON "TaskParticipationArchive"("currentTaskId");
    CREATE INDEX IF NOT EXISTS "TaskParticipationArchive_userId_completedAt_idx" ON "TaskParticipationArchive"("userId", "completedAt");
    ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "isRework" BOOLEAN NOT NULL DEFAULT false;`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await ensureTaskParticipationSchema(client);
    console.log('[Participaciones] Esquema aditivo listo; historial conservado.');
  } catch (error) {
    console.error('[Participaciones]', error.message);
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
