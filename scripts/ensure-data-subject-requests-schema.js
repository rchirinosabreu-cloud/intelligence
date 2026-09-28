import pg from 'pg';

// Consultas y reclamos de titulares (Ley 1581), 27 de septiembre de 2026: tabla aditiva e
// idempotente. Las fechas legales van como texto 'YYYY-MM-DD' (día de Bogotá).
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "DataSubjectRequest" (
      "id" TEXT PRIMARY KEY,
      "consecutive" SERIAL NOT NULL,
      "type" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "requesterName" TEXT NOT NULL,
      "requesterDocument" TEXT,
      "contactEmail" TEXT,
      "contactPhone" TEXT,
      "description" TEXT NOT NULL,
      "receivedOn" TEXT NOT NULL,
      "extendedOn" TEXT,
      "extensionReason" TEXT,
      "incompleteRequestedOn" TEXT,
      "completedOn" TEXT,
      "legendAddedOn" TEXT,
      "respondedOn" TEXT,
      "responseSummary" TEXT,
      "responseEvidence" TEXT,
      "notes" TEXT,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "DataSubjectRequest_consecutive_key" ON "DataSubjectRequest"("consecutive");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "DataSubjectRequest_status_receivedOn_idx" ON "DataSubjectRequest"("status", "receivedOn");`);
  console.log('[Data requests] DataSubjectRequest table ready.');
} catch (error) {
  console.error('[Data requests] Failed to ensure the data subject request schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
