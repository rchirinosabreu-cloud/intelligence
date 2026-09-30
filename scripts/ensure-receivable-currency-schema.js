import pg from 'pg';

// Cuentas de cobro en dólares (30 de septiembre de 2026): columnas aditivas e idempotentes.
// La moneda del documento arranca en COP para todo lo existente, que es lo que siempre fue.
// La TRM solo se llena en las cuentas en dólares; el valor en cartera sigue en pesos.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'COP';`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(65,30);`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "exchangeRateSource" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "exchangeRateDate" TEXT;`);
  // El valor en dólares de una cuenta en dólares que aún no se emite (30 de septiembre de 2026).
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "foreignAmount" DECIMAL(65,30);`);
  console.log('[Receivable currency] currency and exchange rate columns ready.');
} catch (error) {
  console.error('[Receivable currency] Failed to ensure the currency schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
