import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260831)');
  await client.query(`
    ALTER TABLE "OperationalEvent"
      ADD COLUMN IF NOT EXISTS "isAllDay" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "captureWithFireflies" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "attendeeEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "attendeeResponses" JSONB,
      ADD COLUMN IF NOT EXISTS "googleConnectionId" TEXT,
      ADD COLUMN IF NOT EXISTS "googleSyncError" TEXT,
      ADD COLUMN IF NOT EXISTS "googleRecurrence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "requestId" TEXT,
      ADD COLUMN IF NOT EXISTS "requestHash" TEXT,
      ADD COLUMN IF NOT EXISTS "googleSyncAttempts" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "googleNextRetryAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "googleRecurringEventId" TEXT,
      ADD COLUMN IF NOT EXISTS "googleOriginalStartAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "googleTimeZone" TEXT,
      ADD COLUMN IF NOT EXISTS "googleCancelled" BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE "GoogleCalendarConnection"
      ADD COLUMN IF NOT EXISTS "syncVersion" INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS "OperationalEvent_requestId_key" ON "OperationalEvent"("requestId");
    CREATE INDEX IF NOT EXISTS "OperationalEvent_googleSyncStatus_googleNextRetryAt_idx"
      ON "OperationalEvent"("googleSyncStatus", "googleNextRetryAt");

    CREATE TABLE IF NOT EXISTS "GoogleCalendarEventLink" (
      "id" TEXT PRIMARY KEY,
      "operationalEventId" TEXT NOT NULL REFERENCES "OperationalEvent"("id") ON DELETE CASCADE,
      "connectionId" TEXT NOT NULL REFERENCES "GoogleCalendarConnection"("id") ON DELETE CASCADE,
      "calendarId" TEXT NOT NULL,
      "googleEventId" TEXT NOT NULL,
      "googleICalUID" TEXT,
      "googleEtag" TEXT,
      "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCalendarEventLink_connectionId_calendarId_googleEventId_key"
      ON "GoogleCalendarEventLink"("connectionId", "calendarId", "googleEventId");
    CREATE INDEX IF NOT EXISTS "GoogleCalendarEventLink_operationalEventId_idx"
      ON "GoogleCalendarEventLink"("operationalEventId");
    CREATE INDEX IF NOT EXISTS "GoogleCalendarEventLink_googleICalUID_idx"
      ON "GoogleCalendarEventLink"("googleICalUID");
    CREATE INDEX IF NOT EXISTS "OperationalEvent_googleConnectionId_googleCalendarId_googleEventId_idx"
      ON "OperationalEvent"("googleConnectionId", "googleCalendarId", "googleEventId");
  `);
  await client.query('COMMIT');
  console.log('[Calendar schema] Invitations and organizer support ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[Calendar schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
