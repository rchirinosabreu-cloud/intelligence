import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260901)');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "MeetingMinute" (
      "id" TEXT PRIMARY KEY,
      "source" TEXT NOT NULL DEFAULT 'FIREFLIES',
      "externalId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "meetingAt" TIMESTAMP(3) NOT NULL,
      "durationSeconds" INTEGER,
      "organizerEmail" TEXT,
      "participants" JSONB,
      "transcriptText" TEXT NOT NULL,
      "sourceSummary" JSONB,
      "executiveSummary" TEXT,
      "analysis" JSONB,
      "actionItems" JSONB,
      "observerSignals" JSONB,
      "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
      "errorMessage" TEXT,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "aiModel" TEXT,
      "aiRequestId" TEXT,
      "storageProvider" TEXT NOT NULL DEFAULT 'RAILWAY',
      "transcriptStorageKey" TEXT,
      "minuteStorageKey" TEXT,
      "summaryPdfStorageKey" TEXT,
      "analysisPdfStorageKey" TEXT,
      "processedAt" TIMESTAMP(3),
      "deletedAt" TIMESTAMP(3),
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "MeetingMinute_externalId_key"
      ON "MeetingMinute"("externalId");
    CREATE INDEX IF NOT EXISTS "MeetingMinute_status_meetingAt_idx"
      ON "MeetingMinute"("status", "meetingAt");
    CREATE INDEX IF NOT EXISTS "MeetingMinute_meetingAt_idx"
      ON "MeetingMinute"("meetingAt");
    CREATE INDEX IF NOT EXISTS "MeetingMinute_organizerEmail_idx"
      ON "MeetingMinute"("organizerEmail");
    ALTER TABLE "MeetingMinute"
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
    ALTER TABLE "MeetingMinute"
      ADD COLUMN IF NOT EXISTS "summaryPdfStorageKey" TEXT;
    ALTER TABLE "MeetingMinute"
      ADD COLUMN IF NOT EXISTS "analysisPdfStorageKey" TEXT;
    CREATE INDEX IF NOT EXISTS "MeetingMinute_deletedAt_meetingAt_idx"
      ON "MeetingMinute"("deletedAt", "meetingAt");
  `);
  await client.query('COMMIT');
  console.log('[MeetingMinute schema] Automatic minutes storage ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[MeetingMinute schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
