import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Aditivo: no se infieren aperturas ni se distribuyen anuncios históricos.
export async function ensureAnnouncementDeliverySchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('announcement-delivery-schema'))");
    await client.query(`ALTER TABLE "GlobalAnnouncement"
      ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "requestId" TEXT,
      ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6)`);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "GlobalAnnouncement_requestId_key" ON "GlobalAnnouncement" ("requestId")');
    await client.query(`CREATE TABLE IF NOT EXISTS "AnnouncementDelivery" (
      id TEXT PRIMARY KEY, "announcementId" TEXT NOT NULL REFERENCES "GlobalAnnouncement"(id) ON DELETE RESTRICT,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
      "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "openedAt" TIMESTAMPTZ(6), "openedRevision" INTEGER, "dismissedAt" TIMESTAMPTZ(6)
    )`);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementDelivery_announcementId_userId_key" ON "AnnouncementDelivery" ("announcementId", "userId")');
    await client.query('CREATE INDEX IF NOT EXISTS "AnnouncementDelivery_userId_createdAt_idx" ON "AnnouncementDelivery" ("userId", "createdAt")');
    await client.query(`CREATE TABLE IF NOT EXISTS "AnnouncementEvent" (
      id TEXT PRIMARY KEY, "announcementId" TEXT NOT NULL REFERENCES "GlobalAnnouncement"(id) ON DELETE RESTRICT,
      "actorId" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
      action TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT,
      "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS "AnnouncementEvent_announcementId_createdAt_idx" ON "AnnouncementEvent" ("announcementId", "createdAt")');
    await client.query('CREATE INDEX IF NOT EXISTS "AnnouncementEvent_actorId_idx" ON "AnnouncementEvent" ("actorId")');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureAnnouncementDeliverySchema(client); console.log('[Anuncios] Esquema listo.'); }
  finally { await client.end(); }
}
