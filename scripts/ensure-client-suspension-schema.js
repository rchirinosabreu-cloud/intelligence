import pg from 'pg';

// Suspensión de un cliente por cartera (punto 7 de la solicitud de Elisa; su respuesta del 30 de octubre de 2026).
// Aditivo e idempotente, encadenado en `npm start`: no toca ningún dato existente y nadie queda suspendido al desplegar.
//
// Una fila por suspensión, nunca se borra: levantarla la cierra con su motivo. El índice único parcial es la cerradura
// —un cliente no puede tener dos suspensiones abiertas— y hace que dos pulsaciones a la vez no creen dos.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientSuspension" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "fromCycle" TEXT NOT NULL,
      "suspendedOn" TEXT NOT NULL,
      "authorizedBy" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdById" TEXT,
      "createdByName" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "liftedAt" TIMESTAMPTZ(3),
      "liftedById" TEXT,
      "liftedByName" TEXT,
      "liftKind" TEXT,
      "liftReason" TEXT
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "ClientSuspension_clientId_createdAt_idx" ON "ClientSuspension"("clientId", "createdAt");`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientSuspension_open_key" ON "ClientSuspension"("clientId") WHERE "liftedAt" IS NULL;`);
  console.log('[ensure-client-suspension-schema] Listo.');
} catch (error) {
  console.error('[ensure-client-suspension-schema] Error:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
