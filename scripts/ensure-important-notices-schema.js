import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Avisos importantes (26 de octubre de 2026): la banda de abajo, uno a la vez. Solo crea lo que falta; nunca borra ni
// reescribe. Un aviso abierto por persona y oportunidad: el índice parcial lo asegura aunque dos relojes corran a la vez.
export async function ensureImportantNoticesSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20261026, 1)');
    await client.query(`
    CREATE TABLE IF NOT EXISTS "ImportantNotice" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('SEGUIMIENTO','IMPORTANTE')),
      "subjectId" TEXT NOT NULL,
      label TEXT NOT NULL,
      message TEXT NOT NULL,
      url TEXT,
      "notificationId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "snoozedUntil" TIMESTAMPTZ,
      "decidedAt" TIMESTAMPTZ,
      "resolvedAt" TIMESTAMPTZ,
      resolution TEXT
    );
    CREATE INDEX IF NOT EXISTS "ImportantNotice_user_open_idx" ON "ImportantNotice"("userId", "resolvedAt");
    CREATE INDEX IF NOT EXISTS "ImportantNotice_user_decided_idx" ON "ImportantNotice"("userId", "decidedAt");
    CREATE UNIQUE INDEX IF NOT EXISTS "ImportantNotice_one_open_idx" ON "ImportantNotice"("userId", "subjectId") WHERE "resolvedAt" IS NULL;`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[Avisos importantes] Rollback failed:', rollbackError.message));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await client.connect();
    await ensureImportantNoticesSchema(client);
    console.log('[Avisos importantes] Tabla lista.');
  } catch (error) {
    console.error('[Avisos importantes] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(error => console.error('[Avisos importantes] Disconnect failed:', error.message));
  }
}
