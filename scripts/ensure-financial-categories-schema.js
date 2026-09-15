import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive only. Historical reclassification is an explicit, audited ledger edit.
export async function ensureFinancialCategoriesSchema(client) {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query('SELECT pg_advisory_xact_lock(20260914, 2)');
        await client.query(`ALTER TYPE "FinancialCategory" ADD VALUE IF NOT EXISTS 'DONACION'`);
        await client.query(`ALTER TYPE "FinancialCategory" ADD VALUE IF NOT EXISTS 'SIEMBRA'`);
        // Commit enum values before the application can use them.
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => console.error('[Financial categories schema] Rollback failed:', rollbackError.message));
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
        await client.connect();
        await ensureFinancialCategoriesSchema(client);
        console.log('[Financial categories schema] Ready; existing categories and movements preserved.');
    } catch (error) {
        console.error('[Financial categories schema] Failed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}
