import pg from 'pg';

// Registro central de uso de IA (27 de septiembre de 2026): tabla aditiva e idempotente.
// Sin contenido de prompts ni respuestas; se purga a los 365 días desde el propio servicio.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
      "id" TEXT PRIMARY KEY,
      "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "actorId" TEXT,
      "clientId" TEXT,
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL,
      "flow" TEXT NOT NULL,
      "route" TEXT,
      "outcome" TEXT NOT NULL,
      "statusCode" INTEGER,
      "durationMs" INTEGER,
      "inputTokens" INTEGER,
      "outputTokens" INTEGER,
      "errorCode" TEXT
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageEvent_occurredAt_idx" ON "AiUsageEvent"("occurredAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageEvent_actorId_occurredAt_idx" ON "AiUsageEvent"("actorId", "occurredAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "AiUsageEvent_clientId_occurredAt_idx" ON "AiUsageEvent"("clientId", "occurredAt");`);
  console.log('[AI usage] AiUsageEvent table ready.');
} catch (error) {
  console.error('[AI usage] Failed to ensure the AI usage schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
