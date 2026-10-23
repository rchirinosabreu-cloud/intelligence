import pg from 'pg';

// Corregir el tiempo de una sesión (Rodny, 23 de octubre de 2026): columnas aditivas e idempotentes. Nada se borra:
// la sesión guarda su tiempo original la primera vez que un administrador la corrige. Las de quién, cuándo y por qué
// ya estaban en el esquema; se aseguran por si una base las perdió. Las sesiones que ya existen no cambian.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "originalDurationMs" DOUBLE PRECISION;`);
  await client.query(`ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "correctedAt" TIMESTAMP(3);`);
  await client.query(`ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "correctedById" TEXT;`);
  await client.query(`ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "correctionReason" TEXT;`);
  console.log('[Corrección de tiempo] Columnas de TaskWorkSession listas.');
} catch (error) {
  console.error('[Corrección de tiempo] Failed to ensure the work correction schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
