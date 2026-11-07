import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Aditivo: los pagos antiguos siguen siendo PAGO; las compensaciones antiguas de
// Cartera siguen intactas. No vincula, migra ni reaplica importes históricos.
export async function ensureFinancialOffsets(client) {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE "PayablePayment"
      ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PAGO',
      ADD COLUMN IF NOT EXISTS "offsetReceivablePaymentId" TEXT,
      ADD COLUMN IF NOT EXISTS "offsetRequestId" TEXT`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayablePayment_offsetReceivablePaymentId_key" ON "PayablePayment" ("offsetReceivablePaymentId")`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayablePayment_offsetRequestId_key" ON "PayablePayment" ("offsetRequestId")`);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayablePayment_offsetReceivablePaymentId_fkey' AND conrelid = '"PayablePayment"'::regclass) THEN
        ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_offsetReceivablePaymentId_fkey" FOREIGN KEY ("offsetReceivablePaymentId") REFERENCES "ReceivablePayment"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayablePayment_offset_shape_check' AND conrelid = '"PayablePayment"'::regclass) THEN
        ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_offset_shape_check" CHECK (
          (kind = 'PAGO' AND "offsetReceivablePaymentId" IS NULL AND "offsetRequestId" IS NULL) OR
          (kind = 'COMPENSACION' AND "offsetReceivablePaymentId" IS NOT NULL AND "offsetRequestId" IS NOT NULL AND "accountId" IS NULL AND "financialRecordId" IS NULL AND amount > 0)
        );
      END IF;
    END $$`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureFinancialOffsets(client); console.log('[Financial offsets] Schema ready; historical balances unchanged.'); }
  catch (error) { console.error('[Financial offsets]', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
