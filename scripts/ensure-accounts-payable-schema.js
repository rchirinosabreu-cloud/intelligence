import pg from 'pg';

// Terceros y cuentas por pagar (20 de octubre de 2026): a quién le debe Brain Studio, qué documento
// llegó y cómo se pagó. Pagar crea el egreso en Movimientos ligado al pago (`PayablePayment.
// financialRecordId`). Aditivo e idempotente: solo crea lo que no exista.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ThirdParty" (
      "id" TEXT PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "legalName" TEXT,
      "documentType" TEXT,
      "documentNumber" TEXT,
      "email" TEXT,
      "phone" TEXT,
      "bankName" TEXT,
      "bankAccountType" TEXT,
      "bankAccountNumber" TEXT,
      "teamMemberId" TEXT,
      "notes" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ThirdParty_kind_isActive_idx" ON "ThirdParty"("kind", "isActive");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ThirdParty_name_idx" ON "ThirdParty"("name");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ThirdParty_teamMemberId_idx" ON "ThirdParty"("teamMemberId");`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "AccountsPayable" (
      "id" TEXT PRIMARY KEY,
      "thirdPartyId" TEXT NOT NULL REFERENCES "ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "concept" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "amount" DECIMAL(65,30) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'COP',
      "documentNumber" TEXT,
      "receivedAt" TIMESTAMP(3) NOT NULL,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "dueDate" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'POR_PAGAR',
      "notes" TEXT,
      "voidedAt" TIMESTAMP(3),
      "voidReason" TEXT,
      "voidedById" TEXT,
      "createdById" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "AccountsPayable_thirdPartyId_idx" ON "AccountsPayable"("thirdPartyId");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AccountsPayable_status_dueDate_idx" ON "AccountsPayable"("status", "dueDate");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AccountsPayable_year_month_idx" ON "AccountsPayable"("year", "month");`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "PayablePayment" (
      "id" TEXT PRIMARY KEY,
      "payableId" TEXT NOT NULL REFERENCES "AccountsPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "accountId" TEXT REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "financialRecordId" TEXT REFERENCES "FinancialRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "amount" DECIMAL(65,30) NOT NULL,
      "paidAt" TIMESTAMP(3) NOT NULL,
      "reference" TEXT,
      "notes" TEXT,
      "createdById" TEXT,
      "reversedAt" TIMESTAMP(3),
      "reversalReason" TEXT,
      "reversedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "PayablePayment_financialRecordId_key" ON "PayablePayment"("financialRecordId");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "PayablePayment_payableId_paidAt_idx" ON "PayablePayment"("payableId", "paidAt");`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "AccountsPayableDocument" (
      "id" TEXT PRIMARY KEY,
      "payableId" TEXT NOT NULL REFERENCES "AccountsPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
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
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AccountsPayableDocument_storageKey_key" ON "AccountsPayableDocument"("storageKey");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AccountsPayableDocument_payableId_uploadedAt_idx" ON "AccountsPayableDocument"("payableId", "uploadedAt");`);
  console.log('[Accounts payable] ThirdParty, AccountsPayable, PayablePayment and AccountsPayableDocument ready.');
} catch (error) {
  console.error('[Accounts payable] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
