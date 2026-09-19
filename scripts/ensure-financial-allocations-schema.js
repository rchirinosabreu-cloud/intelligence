import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive only. The breakdown table is created once; FinancialRecord rows are never rewritten here.
// It runs after ensure-financial-categories-schema.js because the category column uses that enum.
export async function ensureFinancialAllocationsSchema(client) {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query('SELECT pg_advisory_xact_lock(20260919, 1)');
        await client.query(`CREATE TABLE IF NOT EXISTS "FinancialRecordAllocation" (
            id TEXT PRIMARY KEY,
            "recordId" TEXT NOT NULL REFERENCES "FinancialRecord"(id) ON DELETE CASCADE,
            amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
            category "FinancialCategory" NOT NULL,
            description TEXT NOT NULL,
            counterparty TEXT,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
        await client.query('CREATE INDEX IF NOT EXISTS "FinancialRecordAllocation_recordId_sortOrder_idx" ON "FinancialRecordAllocation"("recordId", "sortOrder")');
        await client.query('CREATE INDEX IF NOT EXISTS "FinancialRecordAllocation_category_idx" ON "FinancialRecordAllocation"(category)');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => console.error('[Financial allocations schema] Rollback failed:', rollbackError.message));
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
        await client.connect();
        await ensureFinancialAllocationsSchema(client);
        console.log('[Financial allocations schema] Ready; existing movements preserved.');
    } catch (error) {
        console.error('[Financial allocations schema] Failed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}
