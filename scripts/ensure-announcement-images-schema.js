import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Aditivo: la tabla de imágenes de los anuncios. No toca anuncios existentes.
export async function ensureAnnouncementImagesSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('announcement-images-schema'))");
    await client.query(`CREATE TABLE IF NOT EXISTS "AnnouncementImage" (
      id TEXT PRIMARY KEY, "storageKey" TEXT NOT NULL, name TEXT NOT NULL, "mimeType" TEXT NOT NULL,
      size INTEGER NOT NULL, "uploadedById" TEXT, scope TEXT, "announcementId" TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "attachedAt" TIMESTAMPTZ(6), "purgedAt" TIMESTAMPTZ(6)
    )`);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementImage_storageKey_key" ON "AnnouncementImage" ("storageKey")');
    await client.query('CREATE INDEX IF NOT EXISTS "AnnouncementImage_scope_announcementId_idx" ON "AnnouncementImage" (scope, "announcementId")');
    await client.query('CREATE INDEX IF NOT EXISTS "AnnouncementImage_createdAt_idx" ON "AnnouncementImage" ("createdAt")');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureAnnouncementImagesSchema(client); console.log('[Anuncios] Esquema de imágenes listo.'); }
  finally { await client.end(); }
}
