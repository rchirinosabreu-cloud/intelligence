import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Additive only. No changes to existing business tables, data or permissions.
export async function ensureAiGovernanceSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(20260923, 8)');
    for (const [name, statuses, extra] of [
      ['System', "'DRAFT','APPROVED','SUSPENDED'", ''],
      ['Risk', "'OPEN','MITIGATED'", ', "clientId" TEXT NOT NULL REFERENCES "Client"(id) ON DELETE RESTRICT, "systemId" TEXT NOT NULL REFERENCES "AiGovernanceSystem"(id) ON DELETE RESTRICT'],
      ['Authorization', "'DRAFT','APPROVED','REVOKED'", ', "clientId" TEXT NOT NULL REFERENCES "Client"(id) ON DELETE RESTRICT, "systemId" TEXT NOT NULL REFERENCES "AiGovernanceSystem"(id) ON DELETE RESTRICT, "riskId" TEXT NOT NULL REFERENCES "AiGovernanceRisk"(id) ON DELETE RESTRICT'],
      ['Incident', "'OPEN','CONTAINED','RECOVERED','CLOSED'", ', "clientId" TEXT REFERENCES "Client"(id) ON DELETE RESTRICT, "notificationDueAt" TIMESTAMPTZ NOT NULL']
    ]) {
      await client.query(`CREATE TABLE IF NOT EXISTS "AiGovernance${name}" (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (${statuses})),
        "ownerId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
        data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW() ${extra}
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS "AiGovernance${name}_ownerId_idx" ON "AiGovernance${name}"("ownerId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "AiGovernance${name}_createdAt_id_idx" ON "AiGovernance${name}"("createdAt", id)`);
      if (name !== 'System') await client.query(`CREATE INDEX IF NOT EXISTS "AiGovernance${name}_clientId_idx" ON "AiGovernance${name}"("clientId")`);
      if (['Risk', 'Authorization'].includes(name)) await client.query(`CREATE INDEX IF NOT EXISTS "AiGovernance${name}_systemId_idx" ON "AiGovernance${name}"("systemId")`);
    }
    await client.query('CREATE INDEX IF NOT EXISTS "AiGovernanceAuthorization_riskId_idx" ON "AiGovernanceAuthorization"("riskId")');
    await client.query('CREATE INDEX IF NOT EXISTS "AiGovernanceIncident_status_notificationDueAt_idx" ON "AiGovernanceIncident"(status,"notificationDueAt")');
    await client.query(`CREATE TABLE IF NOT EXISTS "AiGovernanceClientPolicy" (
      "clientId" TEXT PRIMARY KEY REFERENCES "Client"(id) ON DELETE RESTRICT,
      enabled BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 1,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS "AiGovernanceEvent" (
      id TEXT PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
      "actorId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT, action TEXT NOT NULL, reason TEXT NOT NULL,
      "before" JSONB, "after" JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS "AiGovernanceEvent_entityType_entityId_createdAt_idx" ON "AiGovernanceEvent"("entityType","entityId","createdAt")');
    await client.query('CREATE INDEX IF NOT EXISTS "AiGovernanceEvent_actorId_idx" ON "AiGovernanceEvent"("actorId")');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('[Governance schema] Rollback:', e.message));
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try { await client.connect(); await ensureAiGovernanceSchema(client); console.log('[Governance] Schema ready.'); }
  catch (error) { console.error('[Governance schema]', error.message); process.exitCode = 1; }
  finally { await client.end(); }
}
