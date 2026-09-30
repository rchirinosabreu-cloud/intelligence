import pg from 'pg';

// Publicación automática en Instagram y Facebook (29 de septiembre de 2026): columna aditiva en
// ContentItem (hora de Bogotá) y dos tablas nuevas, cuentas conectadas y cola de publicación.
// Idempotente: se encadena en `npm start`.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "publishTime" TEXT;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientSocialAccount" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "platform" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "pageId" TEXT,
      "encryptedToken" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "connectedById" TEXT,
      "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastError" TEXT,
      "lastCheckedAt" TIMESTAMP(3),
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientSocialAccount_clientId_platform_key" ON "ClientSocialAccount"("clientId", "platform");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "ClientSocialAccount_platform_externalId_idx" ON "ClientSocialAccount"("platform", "externalId");`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "SocialPublication" (
      "id" TEXT PRIMARY KEY,
      "contentItemId" TEXT NOT NULL REFERENCES "ContentItem"("id") ON DELETE CASCADE,
      "socialAccountId" TEXT NOT NULL REFERENCES "ClientSocialAccount"("id") ON DELETE CASCADE,
      "platform" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
      "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "nextAttemptAt" TIMESTAMPTZ(3),
      "leaseToken" TEXT,
      "leaseAt" TIMESTAMPTZ(3),
      "publishRequestedAt" TIMESTAMPTZ(3),
      "externalMediaId" TEXT,
      "permalink" TEXT,
      "error" TEXT,
      "diagnostics" JSONB,
      "requestedById" TEXT,
      "publishedAt" TIMESTAMP(3),
      "cancelledAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "publishRequestedAt" TIMESTAMPTZ(3);`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SocialPublication_contentItemId_platform_key" ON "SocialPublication"("contentItemId", "platform");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "SocialPublication_status_scheduledAt_idx" ON "SocialPublication"("status", "scheduledAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "SocialPublication_status_nextAttemptAt_idx" ON "SocialPublication"("status", "nextAttemptAt");`);
  console.log('[Social publishing] publishTime column, ClientSocialAccount and SocialPublication tables ready.');
} catch (error) {
  console.error('[Social publishing] Failed to ensure the social publishing schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
