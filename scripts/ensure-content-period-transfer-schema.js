import pg from 'pg';
import { pathToFileURL } from 'node:url';

export async function ensureContentPeriodTransferSchema(db) {
  await db.query(`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "autoCreatedForTransfer" BOOLEAN NOT NULL DEFAULT false`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentItemPeriodChange" (
    "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL, "actorId" TEXT,
    "fromPlanId" TEXT NOT NULL, "toPlanId" TEXT NOT NULL,
    "previousDate" TIMESTAMP(3) NOT NULL, "nextDate" TIMESTAMP(3) NOT NULL,
    "fromYear" INTEGER NOT NULL, "fromMonth" INTEGER NOT NULL,
    "toYear" INTEGER NOT NULL, "toMonth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS "ContentItemPeriodChange_itemId_createdAt_idx" ON "ContentItemPeriodChange" ("itemId", "createdAt")`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be supplied explicitly.');
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await db.connect(); await ensureContentPeriodTransferSchema(db); console.log('[Parrillas] Traslados de período preparados.'); }
  catch (error) { console.error('[Parrillas] No se pudo preparar el traslado:', error.message); process.exitCode = 1; }
  finally { await db.end(); }
}
