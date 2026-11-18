import pg from 'pg';

// Ficha de marca del cliente (Rodny, 18 de noviembre de 2026): dos tablas nuevas, aditivas e idempotentes.
// No toca ninguna tabla existente ni carga datos: las fichas las escribe el equipo desde la pantalla o el
// importador de manuales (`scripts/import-client-brands.js`, que simula si no se le confirma).
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "ClientBrand" (
      id TEXT PRIMARY KEY,
      "clientId" TEXT NOT NULL REFERENCES "Client"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      tagline TEXT,
      voice TEXT,
      "usageNotes" TEXT,
      "manualUrl" TEXT,
      "canvaUrl" TEXT,
      "logosUrl" TEXT,
      colors JSONB NOT NULL DEFAULT '[]'::jsonb,
      fonts JSONB NOT NULL DEFAULT '[]'::jsonb,
      links JSONB NOT NULL DEFAULT '[]'::jsonb,
      source TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ClientBrand_clientId_key" ON "ClientBrand"("clientId");

    CREATE TABLE IF NOT EXISTS "ClientBrandFile" (
      id TEXT PRIMARY KEY,
      "brandId" TEXT NOT NULL REFERENCES "ClientBrand"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      kind TEXT NOT NULL,
      label TEXT,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      "mimeType" TEXT,
      size INTEGER,
      "storageArea" TEXT NOT NULL DEFAULT 'PLATFORM',
      "createdById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deletedAt" TIMESTAMP(3),
      "deletedById" TEXT
    );
    CREATE INDEX IF NOT EXISTS "ClientBrandFile_brandId_deletedAt_idx" ON "ClientBrandFile"("brandId", "deletedAt");
  `);
  console.log('[Marcas] Tablas de la ficha de marca listas.');
} catch (error) {
  console.error('[Marcas] Failed to ensure the client brand schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
