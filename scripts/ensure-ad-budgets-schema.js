import pg from 'pg';

// Pautas (reunión del 6 de noviembre de 2026): tablas nuevas, aditivas e idempotentes. No toca ninguna tabla existente ni
// carga datos: los presupuestos los escribe el equipo desde la pantalla.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "AdBudget" (
      id TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      brand TEXT,
      platform TEXT NOT NULL DEFAULT 'META',
      kind TEXT NOT NULL DEFAULT 'MENSUAL',
      status TEXT NOT NULL DEFAULT 'ACTIVA',
      currency TEXT NOT NULL DEFAULT 'COP',
      amount DECIMAL(14,2) NOT NULL,
      "cutDay" INTEGER,
      objective TEXT,
      payer TEXT NOT NULL DEFAULT 'POR_DEFINIR',
      "responsibleId" TEXT REFERENCES "TeamMember"(id) ON DELETE SET NULL ON UPDATE CASCADE,
      "startDate" TEXT,
      "endDate" TEXT,
      notes TEXT,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "AdBudget_clientId_idx" ON "AdBudget"("clientId");
    CREATE INDEX IF NOT EXISTS "AdBudget_responsibleId_idx" ON "AdBudget"("responsibleId");

    CREATE TABLE IF NOT EXISTS "AdBudgetCycle" (
      id TEXT PRIMARY KEY,
      "budgetId" TEXT NOT NULL REFERENCES "AdBudget"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      "cycleKey" TEXT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      spent DECIMAL(14,2),
      "spentAsOf" TEXT,
      "carryOverManual" DECIMAL(14,2),
      "carryOverReason" TEXT,
      "carryOverById" TEXT,
      "closedAt" TIMESTAMPTZ(3),
      "closedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "AdBudgetCycle_budgetId_cycleKey_key" ON "AdBudgetCycle"("budgetId", "cycleKey");

    CREATE TABLE IF NOT EXISTS "AdSpendReading" (
      id TEXT PRIMARY KEY,
      "cycleId" TEXT NOT NULL REFERENCES "AdBudgetCycle"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      "readOn" TEXT NOT NULL,
      spent DECIMAL(14,2) NOT NULL,
      "isFinal" BOOLEAN NOT NULL DEFAULT false,
      note TEXT,
      "recordedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "AdSpendReading_cycleId_createdAt_idx" ON "AdSpendReading"("cycleId", "createdAt");

    CREATE TABLE IF NOT EXISTS "AdCampaign" (
      id TEXT PRIMARY KEY,
      "budgetId" TEXT NOT NULL REFERENCES "AdBudget"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      name TEXT NOT NULL,
      link TEXT,
      objective TEXT,
      status TEXT NOT NULL DEFAULT 'POR_ACTIVAR',
      "startDate" TEXT,
      "endDate" TEXT,
      planned DECIMAL(14,2),
      notes TEXT,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "AdCampaign_budgetId_idx" ON "AdCampaign"("budgetId");

    CREATE TABLE IF NOT EXISTS "AdBudgetEvent" (
      id TEXT PRIMARY KEY,
      "budgetId" TEXT NOT NULL,
      "clientId" TEXT,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      before JSONB,
      after JSONB,
      "actorId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "AdBudgetEvent_budgetId_createdAt_idx" ON "AdBudgetEvent"("budgetId", "createdAt");

    CREATE TABLE IF NOT EXISTS "AdBudgetAlert" (
      id TEXT PRIMARY KEY,
      "budgetId" TEXT NOT NULL REFERENCES "AdBudget"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      "cycleKey" TEXT NOT NULL,
      step TEXT NOT NULL,
      "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "AdBudgetAlert_budgetId_cycleKey_step_key" ON "AdBudgetAlert"("budgetId", "cycleKey", step);`);
  console.log('[Ad budgets] tables ready.');
} catch (error) {
  console.error('[Ad budgets] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
