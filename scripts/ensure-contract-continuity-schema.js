import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Aditivo: ningún contrato existente se declara renovado o terminado por inferencia.
export async function ensureContractContinuitySchema(client) {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('contract-continuity-schema'))");
        await client.query(`ALTER TABLE "ClientContract"
            ADD COLUMN IF NOT EXISTS "renewalDecision" TEXT NOT NULL DEFAULT 'PENDIENTE',
            ADD COLUMN IF NOT EXISTS "renewalDecisionAt" TIMESTAMPTZ(3),
            ADD COLUMN IF NOT EXISTS "renewalDecisionById" TEXT,
            ADD COLUMN IF NOT EXISTS "renewalDecisionByName" TEXT,
            ADD COLUMN IF NOT EXISTS "renewalDecisionNote" TEXT`);
        await client.query(`CREATE TABLE IF NOT EXISTS "ClientContractDecision" (
            "id" TEXT PRIMARY KEY, "clientId" TEXT NOT NULL, "contractId" TEXT NOT NULL,
            "decision" TEXT NOT NULL, "previousDecision" TEXT NOT NULL, "endDate" TEXT NOT NULL,
            "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "note" TEXT,
            "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query('CREATE INDEX IF NOT EXISTS "ClientContractDecision_contractId_createdAt_idx" ON "ClientContractDecision" ("contractId", "createdAt")');
        await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try { await client.connect(); await ensureContractContinuitySchema(client); console.log('[Continuidad] Esquema listo.'); }
    finally { await client.end(); }
}
