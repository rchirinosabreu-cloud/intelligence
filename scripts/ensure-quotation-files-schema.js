import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Aditivo: la tabla de adjuntos de las propuestas (27 de noviembre de 2026). No toca cotizaciones existentes.
export async function ensureQuotationFilesSchema(client) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('quotation-files-schema'))");
    await client.query(`CREATE TABLE IF NOT EXISTS "QuotationFile" (
      id TEXT PRIMARY KEY, "storageKey" TEXT NOT NULL, name TEXT NOT NULL, "mimeType" TEXT NOT NULL,
      size INTEGER NOT NULL, "uploadedById" TEXT, "quotationId" TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "attachedAt" TIMESTAMPTZ(6)
    )`);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "QuotationFile_storageKey_key" ON "QuotationFile" ("storageKey")');
    await client.query('CREATE INDEX IF NOT EXISTS "QuotationFile_quotationId_idx" ON "QuotationFile" ("quotationId")');
    await client.query('CREATE INDEX IF NOT EXISTS "QuotationFile_createdAt_idx" ON "QuotationFile" ("createdAt")');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureQuotationFilesSchema(client); console.log('[Cotizaciones] Esquema de adjuntos listo.'); }
  finally { await client.end(); }
}
