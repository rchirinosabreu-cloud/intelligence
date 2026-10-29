import pg from 'pg';

// Avisos de cierre mensual y renovación (punto 5 de la solicitud de Elisa, 29 de octubre de 2026): una tabla aditiva e
// idempotente con lo ya avisado. La fila única impide avisar dos veces el mismo paso del mismo mes.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ContractCycleAlert" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "contractId" TEXT NOT NULL,
      "cycleKey" TEXT NOT NULL,
      step TEXT NOT NULL,
      "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE("contractId", "cycleKey", step)
    );
    CREATE INDEX IF NOT EXISTS "ContractCycleAlert_contract_idx" ON "ContractCycleAlert"("contractId");`);
  console.log('[Contract cycle alerts] table ready.');
} catch (error) {
  console.error('[Contract cycle alerts] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
