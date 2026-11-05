import pg from 'pg';

// Aditivo: ninguna ficha, propuesta, cuenta o contrato anterior se reescribe. El reloj de formalizaciones
// recupera fichas faltantes a partir de sus propuestas aprobadas; una lectura de Operación nunca escribe.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ProjectOperation" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "formalizationId" TEXT NOT NULL UNIQUE REFERENCES "ProjectFormalization"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      "clientId" TEXT NOT NULL REFERENCES "Client"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      title TEXT NOT NULL,
      modality TEXT CHECK (modality IN ('MENSUAL', 'PUNTUAL', 'MIXTO')),
      "startDate" TEXT,
      "endDate" TEXT,
      "projectManagerId" TEXT REFERENCES "TeamMember"(id) ON DELETE SET NULL ON UPDATE CASCADE,
      "sourceSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("sourceSnapshot") = 'object'),
      deliverables JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(deliverables) = 'array'),
      notes TEXT NOT NULL DEFAULT '',
      "productionDays" INTEGER CHECK ("productionDays" BETWEEN 0 AND 3650),
      "productionHours" DOUBLE PRECISION CHECK ("productionHours" BETWEEN 0 AND 100000),
      "reportRequired" BOOLEAN,
      "reviewStatus" TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK ("reviewStatus" IN ('PENDIENTE', 'REVISADO')),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
      "reviewedAt" TIMESTAMPTZ,
      "reviewedById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ("startDate" IS NULL OR "startDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'),
      CHECK ("endDate" IS NULL OR "endDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'),
      CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate")
    );
    CREATE INDEX IF NOT EXISTS "ProjectOperation_client_created_idx" ON "ProjectOperation"("clientId", "createdAt");
    CREATE INDEX IF NOT EXISTS "ProjectOperation_manager_idx" ON "ProjectOperation"("projectManagerId");
  `);
  console.log('[Project operations] schema ready.');
} catch (error) {
  console.error('[Project operations] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
