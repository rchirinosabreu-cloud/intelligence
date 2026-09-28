import pg from 'pg';

// Verificación en dos pasos (27 de septiembre de 2026): columnas aditivas e idempotentes en
// User. El secreto va cifrado con ENCRYPTION_KEY; los códigos de respaldo, solo como huella.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaPendingSecret" TEXT;`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3);`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaLastUsedStep" INTEGER;`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaRecoveryCodes" JSONB;`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaLockedUntil" TIMESTAMP(3);`);
  console.log('[User MFA] mfa columns ready.');
} catch (error) {
  console.error('[User MFA] Failed to ensure the MFA schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
