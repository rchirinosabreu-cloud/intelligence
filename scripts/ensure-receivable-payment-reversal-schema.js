import pg from 'pg';

// Reversión de abonos de cartera (21 de septiembre de 2026): columnas aditivas e idempotentes.
// El abono revertido se conserva como evidencia; deja de sumar porque las consultas filtran reversedAt.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);`);
  await client.query(`ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;`);
  await client.query(`ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "reversedById" TEXT;`);
  console.log('[Receivable payment reversal] reversedAt, reversalReason and reversedById columns ready.');
} catch (error) {
  console.error('[Receivable payment reversal] Failed to ensure the reversal schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
