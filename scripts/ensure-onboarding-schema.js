import pg from 'pg';
import { pathToFileURL } from 'node:url';

export async function ensureOnboardingSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20260914, 2)');
    // Existing accounts stay excluded. Only explicit new-account provisioning opts in.
    // Constant default: additive, no destructive reset of users or their guide history.
    await client.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingEligible" BOOLEAN NOT NULL DEFAULT false');
    await client.query(`CREATE TABLE IF NOT EXISTS "UserGuideProgress" (
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "guideId" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
      "status" TEXT NOT NULL CHECK ("status" IN ('COMPLETED', 'SKIPPED')),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("userId", "guideId", "version")
    )`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => console.error('[Onboarding schema] Rollback failed:', rollbackError.message));
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try { await client.connect(); await ensureOnboardingSchema(client); console.log('[Onboarding schema] Ready; existing users and history unchanged.'); }
  catch (error) { console.error('[Onboarding schema] Failed:', error.message); process.exitCode = 1; }
  finally { await client.end(); }
}
