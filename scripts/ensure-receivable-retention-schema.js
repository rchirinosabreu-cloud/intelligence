import pg from 'pg';

// Retenciones en cartera (22 de octubre de 2026): la retención es un `kind` más de
// `ReceivablePayment` (texto, sin cambio de esquema); lo nuevo es dónde se guarda su certificado.
// Aditivo e idempotente.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ReceivablePaymentDocument" (
      "id" TEXT PRIMARY KEY,
      "paymentId" TEXT NOT NULL REFERENCES "ReceivablePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "storageKey" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "sha256" TEXT NOT NULL,
      "uploadedById" TEXT,
      "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "voidedAt" TIMESTAMPTZ,
      "voidReason" TEXT,
      "voidedById" TEXT
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ReceivablePaymentDocument_storageKey_key" ON "ReceivablePaymentDocument"("storageKey");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ReceivablePaymentDocument_paymentId_uploadedAt_idx" ON "ReceivablePaymentDocument"("paymentId", "uploadedAt");`);
  console.log('[Receivable retention] ReceivablePaymentDocument ready.');
} catch (error) {
  console.error('[Receivable retention] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
