import pg from 'pg';

// Formalización de proyectos (punto 3 de la solicitud de Elisa, 29 de octubre de 2026): dos tablas aditivas e
// idempotentes. `ProjectFormalization`, una por cotización aprobada, y `ProjectFormalizationDocument`, el contrato
// firmado o su soporte, que nunca se borra.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ProjectFormalization" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "quotationId" TEXT NOT NULL UNIQUE,
      "clientId" TEXT,
      "advanceReceivableId" TEXT,
      status TEXT NOT NULL DEFAULT 'PENDIENTE',
      "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "requestedById" TEXT,
      "exceptionAt" TIMESTAMPTZ,
      "exceptionById" TEXT,
      "exceptionByName" TEXT,
      "exceptionReason" TEXT,
      "exceptionConditions" TEXT,
      "exceptionPaymentDate" TEXT,
      "enabledAt" TIMESTAMPTZ,
      "projectManagerNotified" BOOLEAN NOT NULL DEFAULT false,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ProjectFormalization_status_idx" ON "ProjectFormalization"(status);
    CREATE INDEX IF NOT EXISTS "ProjectFormalization_client_idx" ON "ProjectFormalization"("clientId");
    CREATE TABLE IF NOT EXISTS "ProjectFormalizationDocument" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "formalizationId" TEXT NOT NULL,
      "storageKey" TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      "uploadedById" TEXT,
      "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "ProjectFormalizationDocument_formalization_idx" ON "ProjectFormalizationDocument"("formalizationId", "uploadedAt");
    -- Contrato, otrosí o anexo, y anular con motivo (29 de octubre de 2026). Lo ya subido era un contrato.
    ALTER TABLE "ProjectFormalizationDocument" ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'CONTRATO';
    ALTER TABLE "ProjectFormalizationDocument" ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE "ProjectFormalizationDocument" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMPTZ;
    ALTER TABLE "ProjectFormalizationDocument" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
    ALTER TABLE "ProjectFormalizationDocument" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;`);
  console.log('[Project formalization] tables ready.');
} catch (error) {
  console.error('[Project formalization] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
