import pg from 'pg';

// Semáforo de servicios (4 de octubre de 2026): tabla aditiva e idempotente con una fila por
// comprobación. No guarda credenciales ni contenido; se purga a los 30 días desde el propio servicio.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ServiceHealthCheck" (
      "id" TEXT PRIMARY KEY,
      "serviceId" TEXT NOT NULL,
      "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL,
      "critical" BOOLEAN NOT NULL DEFAULT false,
      "latencyMs" INTEGER,
      "message" TEXT,
      "errorCode" TEXT
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ServiceHealthCheck_checkedAt_idx" ON "ServiceHealthCheck"("checkedAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ServiceHealthCheck_serviceId_checkedAt_idx" ON "ServiceHealthCheck"("serviceId", "checkedAt");`);
  console.log('[ServiceHealth] ServiceHealthCheck table ready.');
} catch (error) {
  console.error('[ServiceHealth] Failed to ensure the service health schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
