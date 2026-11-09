import pg from 'pg';
import { pathToFileURL } from 'node:url';
export async function ensurePartyRoles(db) {
  await db.query(`ALTER TABLE "ThirdParty" ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`);
  await db.query(`ALTER TABLE "ThirdParty" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT REFERENCES "ThirdParty"(id) ON DELETE RESTRICT`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await db.connect(); await ensurePartyRoles(db); console.log('[Party roles] Ready; no identities or balances changed.'); }
  catch (error) { console.error('[Party roles]', error.message); process.exitCode = 1; }
  finally { await db.end(); }
}
