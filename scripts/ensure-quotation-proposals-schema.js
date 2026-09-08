import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive rollout only: preserve historical quotations and every existing column.
// A short lock timeout prevents this startup step from blocking live requests.
export async function ensureQuotationProposalsSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(20260908, 1)');
    await client.query('ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "proposal_details" JSONB');
    const { rows } = await client.query(`SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Quotation' AND column_name = 'proposal_details'`);
    if (rows[0]?.data_type !== 'jsonb' || rows[0]?.is_nullable !== 'YES') {
      throw new Error('Quotation.proposal_details must be nullable JSONB; refusing automatic conversion.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[Quotation schema] Rollback failed:', rollbackError.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await client.connect();
    await ensureQuotationProposalsSchema(client);
    console.log('[Quotation schema] Optional proposal details ready.');
  } catch (error) {
    console.error('[Quotation schema] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(error => console.error('[Quotation schema] Disconnect failed:', error.message));
  }
}
