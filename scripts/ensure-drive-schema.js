import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20260902)');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "DriveFolder" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "parentId" TEXT,
      "createdById" TEXT,
      "deletedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "DriveFile" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "subtitle" TEXT,
      "mimeType" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "storageProvider" TEXT NOT NULL DEFAULT 'RAILWAY',
      "storageKey" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'UPLOAD',
      "category" TEXT NOT NULL DEFAULT 'GENERAL',
      "metadata" JSONB,
      "folderId" TEXT,
      "uploadedById" TEXT,
      "deletedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "DriveFile_storageKey_key"
      ON "DriveFile"("storageKey");
    CREATE INDEX IF NOT EXISTS "DriveFolder_parentId_deletedAt_name_idx"
      ON "DriveFolder"("parentId", "deletedAt", "name");
    CREATE INDEX IF NOT EXISTS "DriveFolder_deletedAt_updatedAt_idx"
      ON "DriveFolder"("deletedAt", "updatedAt");
    CREATE INDEX IF NOT EXISTS "DriveFile_folderId_deletedAt_name_idx"
      ON "DriveFile"("folderId", "deletedAt", "name");
    CREATE INDEX IF NOT EXISTS "DriveFile_deletedAt_updatedAt_idx"
      ON "DriveFile"("deletedAt", "updatedAt");
    CREATE INDEX IF NOT EXISTS "DriveFile_source_category_idx"
      ON "DriveFile"("source", "category");

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriveFolder_parentId_fkey') THEN
        ALTER TABLE "DriveFolder" ADD CONSTRAINT "DriveFolder_parentId_fkey"
          FOREIGN KEY ("parentId") REFERENCES "DriveFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriveFile_folderId_fkey') THEN
        ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_folderId_fkey"
          FOREIGN KEY ("folderId") REFERENCES "DriveFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await client.query('COMMIT');
  console.log('[Drive schema] File manager storage ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[Drive schema] Failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
