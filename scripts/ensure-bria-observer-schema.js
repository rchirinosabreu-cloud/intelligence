import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260904)');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "BriaObserverSignal" (
      "id" TEXT PRIMARY KEY,
      "dedupeKey" TEXT NOT NULL,
      "detectorKey" TEXT NOT NULL,
      "sourceKind" TEXT NOT NULL,
      "sourceRecordId" TEXT,
      "sourceUrl" TEXT,
      "clientId" TEXT,
      "category" TEXT NOT NULL,
      "severity" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "evidence" TEXT NOT NULL,
      "suggestedAction" TEXT,
      "confidence" DOUBLE PRECISION,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "metadata" JSONB,
      "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "reviewedAt" TIMESTAMP(3),
      "snoozedUntil" TIMESTAMP(3),
      "dismissedAt" TIMESTAMP(3),
      "resolvedAt" TIMESTAMP(3),
      "archivedAt" TIMESTAMPTZ,
      "archiveReason" TEXT,
      "lastActionById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "BriaObserverSignal" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;
    ALTER TABLE "BriaObserverSignal" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;

    CREATE TABLE IF NOT EXISTS "BriaObserverDetectorState" (
      "detectorKey" TEXT PRIMARY KEY,
      "activatedAt" TIMESTAMPTZ NOT NULL,
      "baselineArchivedAt" TIMESTAMPTZ,
      "lastScannedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "BriaObserverSignal_dedupeKey_key" ON "BriaObserverSignal"("dedupeKey");
    CREATE INDEX IF NOT EXISTS "BriaObserverSignal_status_severity_lastDetectedAt_idx" ON "BriaObserverSignal"("status", "severity", "lastDetectedAt");
    CREATE INDEX IF NOT EXISTS "BriaObserverSignal_detectorKey_status_idx" ON "BriaObserverSignal"("detectorKey", "status");
    CREATE INDEX IF NOT EXISTS "BriaObserverSignal_sourceKind_sourceRecordId_idx" ON "BriaObserverSignal"("sourceKind", "sourceRecordId");
    CREATE INDEX IF NOT EXISTS "BriaObserverSignal_clientId_status_idx" ON "BriaObserverSignal"("clientId", "status");
    CREATE INDEX IF NOT EXISTS "BriaObserverDetectorState_lastScannedAt_idx" ON "BriaObserverDetectorState"("lastScannedAt");
  `);
  await client.query('COMMIT');
  console.log('[Bria Observer schema] Persistent signal inbox ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[Bria Observer schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
