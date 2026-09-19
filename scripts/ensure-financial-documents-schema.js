import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive only. Supporting documents are evidence: the table is created once, rows are never
// removed here and nothing cascades from FinancialRecord (a document outlives its movement).
export async function ensureFinancialDocumentsSchema(client) {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query('SELECT pg_advisory_xact_lock(20260919, 2)');
        await client.query(`CREATE TABLE IF NOT EXISTS "FinancialRecordDocument" (
            id TEXT PRIMARY KEY,
            "recordId" TEXT NOT NULL REFERENCES "FinancialRecord"(id),
            "storageKey" TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            "mimeType" TEXT NOT NULL,
            size INTEGER NOT NULL CHECK (size > 0),
            sha256 TEXT NOT NULL,
            "uploadedById" TEXT,
            "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "voidedAt" TIMESTAMPTZ,
            "voidReason" TEXT,
            "voidedById" TEXT
        )`);
        await client.query('CREATE INDEX IF NOT EXISTS "FinancialRecordDocument_recordId_uploadedAt_idx" ON "FinancialRecordDocument"("recordId", "uploadedAt")');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => console.error('[Financial documents schema] Rollback failed:', rollbackError.message));
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
        await client.connect();
        await ensureFinancialDocumentsSchema(client);
        console.log('[Financial documents schema] Ready; existing movements preserved.');
    } catch (error) {
        console.error('[Financial documents schema] Failed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}
