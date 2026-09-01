import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260903)');
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS "BriaMemorySource" (
      "id" TEXT PRIMARY KEY,
      "sourceKind" TEXT NOT NULL,
      "sourceRecordId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "subtitle" TEXT,
      "sourceUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "contentHash" TEXT,
      "clientId" TEXT,
      "sourceUpdatedAt" TIMESTAMP(3),
      "indexedAt" TIMESTAMP(3),
      "deletedAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "BriaMemoryChunk" (
      "id" TEXT PRIMARY KEY,
      "sourceId" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "section" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "contentHash" TEXT NOT NULL,
      "tokenEstimate" INTEGER NOT NULL,
      "embeddingModel" TEXT NOT NULL,
      "embedding" vector(1536),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "BriaMemorySource_sourceKind_sourceRecordId_key"
      ON "BriaMemorySource"("sourceKind", "sourceRecordId");
    CREATE INDEX IF NOT EXISTS "BriaMemorySource_status_deletedAt_indexedAt_idx"
      ON "BriaMemorySource"("status", "deletedAt", "indexedAt");
    CREATE INDEX IF NOT EXISTS "BriaMemorySource_clientId_deletedAt_idx"
      ON "BriaMemorySource"("clientId", "deletedAt");
    CREATE INDEX IF NOT EXISTS "BriaMemorySource_sourceKind_sourceUpdatedAt_idx"
      ON "BriaMemorySource"("sourceKind", "sourceUpdatedAt");
    CREATE UNIQUE INDEX IF NOT EXISTS "BriaMemoryChunk_sourceId_position_key"
      ON "BriaMemoryChunk"("sourceId", "position");
    CREATE INDEX IF NOT EXISTS "BriaMemoryChunk_sourceId_section_idx"
      ON "BriaMemoryChunk"("sourceId", "section");
    CREATE INDEX IF NOT EXISTS "BriaMemoryChunk_content_fts_idx"
      ON "BriaMemoryChunk" USING GIN (to_tsvector('spanish', "content"));

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BriaMemorySource_clientId_fkey') THEN
        ALTER TABLE "BriaMemorySource" ADD CONSTRAINT "BriaMemorySource_clientId_fkey"
          FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BriaMemoryChunk_sourceId_fkey') THEN
        ALTER TABLE "BriaMemoryChunk" ADD CONSTRAINT "BriaMemoryChunk_sourceId_fkey"
          FOREIGN KEY ("sourceId") REFERENCES "BriaMemorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await client.query('COMMIT');
  console.log('[Bria memory schema] Traceable hybrid memory ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[Bria memory schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
