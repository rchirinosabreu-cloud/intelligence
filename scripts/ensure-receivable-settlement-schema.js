import pg from 'pg';

// Cierre de deuda sin dinero (20 de octubre de 2026): acuerdo por menor valor, canje,
// compensación o condonación. Es una fila de abono con `kind` distinto de PAGO y sin ingreso;
// la obligación queda SALDADO (en cero, pero no todo entró como dinero). Aditivo e idempotente.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'SALDADO';`);
  await client.query(`ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PAGO';`);
  await client.query(`ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "detail" JSONB;`);
  console.log('[Receivable settlement] SALDADO, kind and detail ready.');
} catch (error) {
  console.error('[Receivable settlement] Failed to ensure the settlement schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
