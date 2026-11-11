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
  console.log('[ensure-production-days-schema] Listo.');
} catch (error) {
  console.error('[ensure-production-days-schema] Error:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
