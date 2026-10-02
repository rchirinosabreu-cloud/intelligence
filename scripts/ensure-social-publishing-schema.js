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
  await client.query(`CREATE INDEX IF NOT EXISTS "SocialPublication_status_scheduledAt_idx" ON "SocialPublication"("status", "scheduledAt");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "SocialPublication_status_nextAttemptAt_idx" ON "SocialPublication"("status", "nextAttemptAt");`);

  // Varias cuentas por cliente (Rodny, 2 de octubre de 2026): PromoGroup y Endova comparten parrilla, y
  // Foobespain, Wine & Wonder y Wine Summit también. Antes un cliente tenía una cuenta por red y una
  // pieza una fila por red; ahora la unicidad es por cuenta. Aditivo: no se borra ninguna fila. Primero
  // se crea la regla nueva y después se suelta la vieja, para que nunca falte una.
  await client.query(`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "socialPageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`);
  await client.query(`ALTER TABLE "ClientSocialAccount" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE;`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientSocialAccount_clientId_platform_externalId_key" ON "ClientSocialAccount"("clientId", "platform", "externalId");`);
  await client.query(`DROP INDEX IF EXISTS "ClientSocialAccount_clientId_platform_key";`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SocialPublication_contentItemId_socialAccountId_key" ON "SocialPublication"("contentItemId", "socialAccountId");`);
  await client.query(`DROP INDEX IF EXISTS "SocialPublication_contentItemId_platform_key";`);
  // La cuenta que sale por defecto es la primera que se conectó. Un cliente sin ninguna marcada (todos
  // los de antes de este cambio) recibe la marca en su página más antigua, una sola vez.
  await client.query(`
    UPDATE "ClientSocialAccount" account SET "isPrimary" = TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM "ClientSocialAccount" other WHERE other."clientId" = account."clientId" AND other."isPrimary"
    )
    AND account."pageId" IS NOT DISTINCT FROM (
      SELECT first."pageId" FROM "ClientSocialAccount" first
      WHERE first."clientId" = account."clientId"
      ORDER BY first."connectedAt" ASC, first."id" ASC LIMIT 1
    );
  `);

  // Cifras de Meta para los informes (Rodny, 2 de octubre de 2026): la cuenta publicitaria de la que
  // sale la pauta de un cliente y las palabras que distinguen sus campañas, porque una cuenta puede
  // llevar las de varios clientes. Tabla nueva; va aquí porque es parte de la misma conexión con Meta.
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientAdAccount" (
      "id" TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
      "adAccountId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "currency" TEXT,
      "campaignFilter" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "connectedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientAdAccount_clientId_adAccountId_key" ON "ClientAdAccount"("clientId", "adAccountId");`);
  console.log('[Social publishing] publishTime column, ClientSocialAccount, SocialPublication and ClientAdAccount tables ready (several accounts per client).');
} catch (error) {
  console.error('[Social publishing] Failed to ensure the social publishing schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
