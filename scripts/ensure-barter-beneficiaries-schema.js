import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Solo añade vínculos. No deduce beneficiarios ni reaplica canjes históricos.
export async function ensureBarterBeneficiaries(client) {
  await client.query('BEGIN');
  try {
    await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "barterPaymentId" TEXT, ADD COLUMN IF NOT EXISTS "beneficiaryThirdPartyId" TEXT`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AccountsReceivable_barterPaymentId_key" ON "AccountsReceivable" ("barterPaymentId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "AccountsReceivable_beneficiaryThirdPartyId_idx" ON "AccountsReceivable" ("beneficiaryThirdPartyId")`);
    for (const [column, target] of [['barterPaymentId', 'ReceivablePayment'], ['beneficiaryThirdPartyId', 'ThirdParty']]) {
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountsReceivable_${column}_fkey' AND conrelid = '"AccountsReceivable"'::regclass) THEN
        ALTER TABLE "AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${target}"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF; END $$`);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureBarterBeneficiaries(client); console.log('[Barter beneficiaries] Schema ready; no historical data changed.'); }
  catch (error) { console.error('[Barter beneficiaries]', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
