import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive markers for the retention sweep. Existing attachments stay ACTIVE,
// so nothing is backdated into a purged state and no historical row is lost:
// the row survives a purge on purpose, to explain the missing file.
export async function ensureTaskAttachmentRetentionSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20260918, 1)');
    await client.query(`
      ALTER TABLE "TaskAttachment"
        ADD COLUMN IF NOT EXISTS "purgeState" TEXT NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMPTZ;
    `);
    // Only the sweep reads this, and only for rows it may still act on.
    await client.query(`
      CREATE INDEX IF NOT EXISTS "TaskAttachment_purge_idx"
        ON "TaskAttachment" ("purgeState");
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[Task attachment retention schema] Rollback failed:', rollbackError.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await ensureTaskAttachmentRetentionSchema(client);
    console.log('[Task attachment retention schema] Ready; existing attachments remain ACTIVE.');
  } catch (error) {
    console.error('[Task attachment retention schema] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
