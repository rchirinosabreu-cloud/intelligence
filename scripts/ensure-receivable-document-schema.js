import pg from 'pg';

// Cuenta de cobro (22 de septiembre de 2026): columnas y tabla aditivas e idempotentes.
// Una obligación existente sigue siendo válida sin documento: las importadas del Excel
// no tienen número ni líneas, y emitir una cuenta de cobro es lo que se los pone.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "number" INTEGER;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "issuedById" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "concept" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "servicePeriod" TEXT;`);
  await client.query(`ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "pdfStorageKey" TEXT;`);
  // Dos cuentas de cobro no pueden llevar el mismo número. Índice completo y con el
  // nombre que genera Prisma para `@unique`: en PostgreSQL los nulos no chocan entre
  // sí, así que las obligaciones sin emitir conviven, y un `prisma db push` futuro no
  // encuentra un índice distinto del que declara el esquema.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AccountsReceivable_number_key"
    ON "AccountsReceivable"("number");
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ReceivableItem" (
      "id" TEXT PRIMARY KEY,
      "receivableId" TEXT NOT NULL REFERENCES "AccountsReceivable"("id") ON DELETE CASCADE,
      "description" TEXT NOT NULL,
      "amount" DECIMAL(14,2) NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "ReceivableItem_receivableId_sortOrder_idx"
    ON "ReceivableItem"("receivableId", "sortOrder");
  `);
  // Identidad del tercero: el nombre legal y el documento con los que el cliente
  // aparece en una cuenta de cobro. Se escriben una vez en su ficha.
  await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "legalName" TEXT;`);
  await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "documentType" TEXT;`);
  await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;`);
  console.log('[Cuenta de cobro] Columnas del documento, índice de número, tabla de líneas e identidad del tercero listos.');
} catch (error) {
  console.error('[Cuenta de cobro] Failed to ensure the receivable document schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
