import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Nullable observation markers preserve the legacy counters without backdating a clean period.
export async function ensureQualityStreakSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20260914, 1)');
    await client.query(`
      ALTER TABLE "SystemStreak"
        ADD COLUMN IF NOT EXISTS "cleanSinceAt" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "trackingStartedAt" TIMESTAMPTZ;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[Quality streak schema] Rollback failed:', rollbackError.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await ensureQualityStreakSchema(client);
    console.log('[Quality streak schema] Ready; legacy history preserved.');
  } catch (error) {
    console.error('[Quality streak schema] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
