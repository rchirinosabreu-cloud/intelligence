import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Conserva filas y pagos. Amplía la clave de la liquidación para admitir varios
// períodos de servicio dentro del mismo mes contable; lo anterior sigue MONTHLY.
export async function ensurePayrollPeriods(client) {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE "PayrollTransaction"
      ADD COLUMN IF NOT EXISTS "periodKey" TEXT NOT NULL DEFAULT 'MONTHLY',
      ADD COLUMN IF NOT EXISTS "serviceStart" DATE,
      ADD COLUMN IF NOT EXISTS "serviceEnd" DATE,
      ADD COLUMN IF NOT EXISTS "periodDetails" JSONB,
      ADD COLUMN IF NOT EXISTS "creationRequestId" TEXT,
      ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "voidReason" TEXT`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollTransaction_contractId_month_year_periodKey_key" ON "PayrollTransaction" ("contractId", month, year, "periodKey")`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollTransaction_creationRequestId_key" ON "PayrollTransaction" ("creationRequestId")`);
    await client.query(`DROP INDEX IF EXISTS "PayrollTransaction_contractId_month_year_key"`);
    await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "loanCollaboratorId" TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS "AccountsReceivable_loanCollaboratorId_idx" ON "AccountsReceivable" ("loanCollaboratorId")`);
    await client.query(`ALTER TABLE "PayrollAdjustment"
      ADD COLUMN IF NOT EXISTS "receivablePaymentId" TEXT,
      ADD COLUMN IF NOT EXISTS "requestId" TEXT,
      ADD COLUMN IF NOT EXISTS "detail" JSONB,
      ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
      ADD COLUMN IF NOT EXISTS "reversedById" TEXT`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollAdjustment_receivablePaymentId_key" ON "PayrollAdjustment" ("receivablePaymentId")`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollAdjustment_requestId_key" ON "PayrollAdjustment" ("requestId")`);
    await client.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollAdjustment_transactionId_fkey' AND conrelid = '"PayrollAdjustment"'::regclass AND confdeltype <> 'r') THEN
      ALTER TABLE "PayrollAdjustment" DROP CONSTRAINT "PayrollAdjustment_transactionId_fkey";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollAdjustment_transactionId_fkey' AND conrelid = '"PayrollAdjustment"'::regclass) THEN
      ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PayrollTransaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF; END $$`);
    for (const [table, column, target] of [['AccountsReceivable', 'loanCollaboratorId', 'FinancialCollaborator'], ['PayrollAdjustment', 'receivablePaymentId', 'ReceivablePayment']]) {
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${table}_${column}_fkey' AND conrelid = '"${table}"'::regclass) THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${target}"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF; END $$`);
    }
    await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollTransaction_service_dates_check' AND conrelid = '"PayrollTransaction"'::regclass) THEN
      ALTER TABLE "PayrollTransaction" ADD CONSTRAINT "PayrollTransaction_service_dates_check" CHECK (("serviceStart" IS NULL AND "serviceEnd" IS NULL) OR ("serviceStart" IS NOT NULL AND "serviceEnd" IS NOT NULL AND "serviceEnd" >= "serviceStart"));
    END IF; END $$`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensurePayrollPeriods(client); console.log('[Payroll periods] Schema ready; historical payments unchanged.'); }
  catch (error) { console.error('[Payroll periods]', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
