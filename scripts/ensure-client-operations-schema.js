import pg from 'pg';

// Operación de clientes (2 de octubre de 2026): la ficha operativa del cliente (descripción, Instagram,
// agencia, complejidad, project manager), su contrato y el informe entregado de cada mes. Todo aditivo e
// idempotente; se encadena en `npm start`. Nada se rellena por suposición: los clientes que ya existen
// quedan con estos campos vacíos hasta que alguien los llene o se corra la carga del Excel.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  for (const column of ['description', 'instagramUrl', 'agency', 'complexity']) {
    await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "${column}" TEXT;`);
  }
  await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "projectManagerId" TEXT REFERENCES "TeamMember"("id") ON DELETE SET NULL;`);
  await client.query(`CREATE INDEX IF NOT EXISTS "Client_projectManagerId_idx" ON "Client"("projectManagerId");`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientContract" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "serviceType" TEXT NOT NULL DEFAULT 'PARRILLA',
      "status" TEXT NOT NULL DEFAULT 'ACTIVO',
      "startDate" TEXT NOT NULL,
      "endDate" TEXT,
      "standBySince" TEXT,
      "cutDay" INTEGER NOT NULL DEFAULT 1,
      "deliverables" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "storiesPerWeek" INTEGER NOT NULL DEFAULT 0,
      "productionDays" INTEGER NOT NULL DEFAULT 0,
      "monthlyReport" BOOLEAN NOT NULL DEFAULT FALSE,
      "notes" TEXT,
      "source" TEXT NOT NULL DEFAULT 'MANUAL',
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ClientContract_clientId_startDate_idx" ON "ClientContract"("clientId", "startDate");`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientMonthlyReport" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "deliveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deliveredById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientMonthlyReport_clientId_year_month_key" ON "ClientMonthlyReport"("clientId", "year", "month");`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientObservation" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "text" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'MANUAL',
      "sourceLabel" TEXT,
      "authorId" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ClientObservation_clientId_createdAt_idx" ON "ClientObservation"("clientId", "createdAt");`);
  await client.query(`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "highlightedAction" TEXT;`);
  // «Ya se publicó» guarda aquí el estado anterior para poder deshacerlo.
  await client.query(`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "manualPublish" JSONB;`);
  console.log('[Client operations] profile columns, ClientContract, ClientMonthlyReport, ClientObservation and TeamMember.highlightedAction ready.');
} catch (error) {
  console.error('[Client operations] Failed to ensure the client operations schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
