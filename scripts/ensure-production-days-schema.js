import pg from 'pg';

// Jornadas de producción con evidencia (reunión de Rodny con su jefe, 10 de noviembre de 2026). Aditivo e idempotente,
// encadenado en `npm start`: no toca ningún dato existente. Una fila por evento de Producción ligado a un cliente; el
// evento sigue siendo del calendario y su sincronización con Google no cambia.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ProductionDay" (
      "id" TEXT PRIMARY KEY,
      "eventId" TEXT UNIQUE REFERENCES "OperationalEvent"("id") ON DELETE SET NULL,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "date" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "evidenceUrl" TEXT,
      "evidenceNote" TEXT,
      "evidenceAt" TIMESTAMPTZ(3),
      "evidenceById" TEXT,
      "evidenceByName" TEXT,
      "linkedById" TEXT,
      "linkedByName" TEXT,
      "remindedAt" TIMESTAMPTZ(3),
      "reminders" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ProductionDay_clientId_date_idx" ON "ProductionDay"("clientId", "date");`);
  // 11 de noviembre de 2026: cada jornada crea su pendiente en Gestión, y una jornada puede no ser de un cliente.
  await client.query(`ALTER TABLE "ProductionDay" ALTER COLUMN "clientId" DROP NOT NULL;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "taskId" TEXT UNIQUE REFERENCES "Task"("id") ON DELETE SET NULL;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "autoStartedAt" TIMESTAMPTZ(3);`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "autoEndedAt" TIMESTAMPTZ(3);`);
  // 12 de noviembre de 2026: lo que traía el Excel de jornadas (lugar, guion) y la carga de su historial.
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "location" TEXT;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "scriptUrl" TEXT;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "responsibleName" TEXT;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "scheduleText" TEXT;`);
  await client.query(`ALTER TABLE "ProductionDay" ADD COLUMN IF NOT EXISTS "importKey" TEXT UNIQUE;`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ProductionDay_date_idx" ON "ProductionDay"("date");`);
  console.log('[ensure-production-days-schema] Listo.');
} catch (error) {
  console.error('[ensure-production-days-schema] Error:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
