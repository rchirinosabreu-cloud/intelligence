import pg from 'pg';

// Préstamos a terceros en Cartera (20 de octubre de 2026): una cuenta por cobrar de clase
// PRESTAMO puede no tener cliente (un colaborador, un socio), dice a quién se le prestó y queda
// ligada al egreso que sacó el dinero. Aditivo e idempotente; `DROP NOT NULL` no toca datos.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "AccountsReceivable" ALTER COLUMN "clientId" DROP NOT NULL;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CLIENTE';`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "counterpartyType" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "counterpartyName" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "loanRecordId" TEXT;`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AccountsReceivable_loanRecordId_key" ON "AccountsReceivable"("loanRecordId");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AccountsReceivable_kind_idx" ON "AccountsReceivable"("kind");`);
  await client.query(`
    DO $$ BEGIN
      ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_loanRecordId_fkey"
        FOREIGN KEY ("loanRecordId") REFERENCES "FinancialRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  console.log('[Receivable loans] clientId nullable, kind, counterparty and loanRecordId ready.');
} catch (error) {
  console.error('[Receivable loans] Failed to ensure the loans schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
