import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive rollout only: the catalog keeps its plain-text description and gains an
// optional rich version edited in the catalog modal. Nothing is dropped or rewritten.
export async function ensureServiceCatalogSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(20260919, 1)');
    await client.query('ALTER TABLE "ServiceCatalog" ADD COLUMN IF NOT EXISTS "description_html" TEXT');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[ServiceCatalog schema] Rollback failed:', rollbackError.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await client.connect();
    await ensureServiceCatalogSchema(client);
    console.log('[ServiceCatalog schema] Rich description column ready.');
  } catch (error) {
    console.error('[ServiceCatalog schema] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(error => console.error('[ServiceCatalog schema] Disconnect failed:', error.message));
  }
}
