import pg from 'pg';

// Avisos de cartera (28 de octubre de 2026): dos tablas aditivas e idempotentes. `CollectionAlert` guarda lo ya avisado
// (la fila única impide avisar dos veces) y `CollectionSetting` los plazos que cambia un administrador; sin fila, rigen
// los acordados con Rodny (`DEFAULT_COLLECTION_SETTINGS`).
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "CollectionAlert" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "subjectId" TEXT NOT NULL,
      kind TEXT NOT NULL,
      cycle TEXT NOT NULL,
      step INTEGER NOT NULL,
      "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE("subjectId", cycle, step)
    );
    CREATE INDEX IF NOT EXISTS "CollectionAlert_subject_idx" ON "CollectionAlert"("subjectId");
    CREATE TABLE IF NOT EXISTS "CollectionSetting" (
      id TEXT PRIMARY KEY DEFAULT 'global',
      enabled BOOLEAN NOT NULL DEFAULT false,
      "paymentTermDays" INTEGER NOT NULL DEFAULT 15,
      "monthlyAlertCount" INTEGER NOT NULL DEFAULT 2,
      "oneOffFirstAlertDays" INTEGER NOT NULL DEFAULT 15,
      "repeatDays" INTEGER NOT NULL DEFAULT 7,
      "updatedById" TEXT,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  console.log('[Collection alerts] tables ready.');
} catch (error) {
  console.error('[Collection alerts] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
