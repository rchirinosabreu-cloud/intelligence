import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260906)');
  await client.query(`
    DO $$
    DECLARE review_column_existed BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ContentPlan' AND column_name = 'briaReviewState'
      ) INTO review_column_existed;

      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewState" TEXT NOT NULL DEFAULT 'PENDING';
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewRequestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewStartedAt" TIMESTAMP(3);
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewError" TEXT;
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewLeaseToken" TEXT;
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewAttempts" INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewNextAttemptAt" TIMESTAMPTZ;
      ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "briaReviewCheckpoint" JSONB;

      IF NOT review_column_existed THEN
        UPDATE "ContentPlan"
        SET "briaReviewState" = 'IDLE', "briaReviewRequestedAt" = NULL
        WHERE "deletedAt" IS NULL;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "ContentPlanReview" (
      "id" TEXT PRIMARY KEY,
      "planId" TEXT NOT NULL,
      "revisionHash" TEXT NOT NULL,
      "analysisHash" TEXT NOT NULL,
      "promptVersion" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'RUNNING',
      "trigger" TEXT NOT NULL DEFAULT 'AUTOMATIC',
      "summary" TEXT,
      "verdict" TEXT,
      "score" INTEGER,
      "coverage" INTEGER,
      "dimensions" JSONB,
      "findingsSnapshot" JSONB,
      "evidenceSnapshot" JSONB,
      "model" TEXT,
      "requestId" TEXT,
      "requestedById" TEXT,
      "errorMessage" TEXT,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContentPlanReview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "ContentPlanReviewFinding" (
      "id" TEXT PRIMARY KEY,
      "planId" TEXT NOT NULL,
      "itemId" TEXT,
      "lastReviewId" TEXT NOT NULL,
      "fingerprint" TEXT NOT NULL,
      "subjectHash" TEXT NOT NULL,
      "ruleKey" TEXT NOT NULL,
      "field" TEXT,
      "category" TEXT NOT NULL,
      "severity" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "recommendation" TEXT NOT NULL,
      "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "actionReason" TEXT,
      "lastActionById" TEXT,
      "lastActionAt" TIMESTAMP(3),
      "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt" TIMESTAMP(3),
      "dismissedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContentPlanReviewFinding_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ContentPlanReviewFinding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ContentPlanReviewFinding_lastReviewId_fkey" FOREIGN KEY ("lastReviewId") REFERENCES "ContentPlanReview"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    ALTER TABLE "ContentPlanReviewFinding" ADD COLUMN IF NOT EXISTS "verification" JSONB;

    CREATE UNIQUE INDEX IF NOT EXISTS "ContentPlanReview_planId_analysisHash_key" ON "ContentPlanReview"("planId", "analysisHash");
    CREATE INDEX IF NOT EXISTS "ContentPlanReview_planId_createdAt_idx" ON "ContentPlanReview"("planId", "createdAt");
    CREATE INDEX IF NOT EXISTS "ContentPlanReview_status_createdAt_idx" ON "ContentPlanReview"("status", "createdAt");
    CREATE UNIQUE INDEX IF NOT EXISTS "ContentPlanReviewFinding_planId_fingerprint_key" ON "ContentPlanReviewFinding"("planId", "fingerprint");
    CREATE INDEX IF NOT EXISTS "ContentPlanReviewFinding_planId_status_severity_idx" ON "ContentPlanReviewFinding"("planId", "status", "severity");
    CREATE INDEX IF NOT EXISTS "ContentPlanReviewFinding_itemId_idx" ON "ContentPlanReviewFinding"("itemId");
    CREATE INDEX IF NOT EXISTS "ContentPlanReviewFinding_lastReviewId_idx" ON "ContentPlanReviewFinding"("lastReviewId");
    ALTER TABLE "ContentPlanReview" ADD COLUMN IF NOT EXISTS "scope" JSONB;
    CREATE INDEX IF NOT EXISTS "ContentPlan_briaReviewState_briaReviewRequestedAt_idx" ON "ContentPlan"("briaReviewState", "briaReviewRequestedAt");
    CREATE INDEX IF NOT EXISTS "ContentPlan_briaReviewState_briaReviewStartedAt_idx" ON "ContentPlan"("briaReviewState", "briaReviewStartedAt");
  `);
  await client.query('COMMIT');
  console.log('[Bria content reviews schema] Shared review history ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[Bria content reviews schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
