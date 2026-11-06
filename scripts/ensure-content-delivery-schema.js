import pg from 'pg';
import { pathToFileURL } from 'node:url';

/** Additive only. No environment file is loaded; the deployment or isolated test supplies the URL. */
export async function ensureContentDeliverySchema(client) {
  const { rows } = await client.query(`SELECT to_regclass('public."ContentItem"') AS table`);
  if (!rows[0]?.table) return;
  await client.query(`
    ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "finalAssetsRevision" INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS "ContentItemDeliveryUpload" (
      "id" TEXT PRIMARY KEY, "contentItemId" TEXT NOT NULL REFERENCES "ContentItem"("id") ON DELETE CASCADE,
      "requestId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "expectedRevision" INTEGER NOT NULL,
      "manifest" JSONB NOT NULL, "state" TEXT NOT NULL DEFAULT 'PENDING', "committedRevision" INTEGER,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ContentItemDeliveryUpload_contentItemId_requestId_key" ON "ContentItemDeliveryUpload"("contentItemId", "requestId");
    CREATE INDEX IF NOT EXISTS "ContentItemDeliveryUpload_state_expiresAt_idx" ON "ContentItemDeliveryUpload"("state", "expiresAt");
    CREATE TABLE IF NOT EXISTS "ContentItemDeliveryChange" (
      "id" TEXT PRIMARY KEY, "contentItemId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
      "action" TEXT NOT NULL, "actorId" TEXT, "actorName" TEXT, "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "files" JSONB NOT NULL, "previousFiles" JSONB NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ContentItemDeliveryChange_contentItemId_revision_key" ON "ContentItemDeliveryChange"("contentItemId", "revision");
    CREATE INDEX IF NOT EXISTS "ContentItemDeliveryChange_contentItemId_at_idx" ON "ContentItemDeliveryChange"("contentItemId", "at");
    CREATE TABLE IF NOT EXISTS "ContentAssetDeletion" (
      "id" TEXT PRIMARY KEY, "storageKey" TEXT NOT NULL, "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "attempts" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "ContentItemFinalAsset" ADD COLUMN IF NOT EXISTS "storageArea" TEXT NOT NULL DEFAULT 'LEGACY';
    ALTER TABLE "ContentItemDeliveryUpload" ADD COLUMN IF NOT EXISTS "storageArea" TEXT NOT NULL DEFAULT 'LEGACY';
    ALTER TABLE "ContentAssetDeletion" ADD COLUMN IF NOT EXISTS "storageArea" TEXT NOT NULL DEFAULT 'LEGACY';
    DROP INDEX IF EXISTS "ContentItemFinalAsset_storageKey_key";
    DROP INDEX IF EXISTS "ContentAssetDeletion_storageKey_key";
    CREATE UNIQUE INDEX IF NOT EXISTS "ContentItemFinalAsset_storageArea_storageKey_key" ON "ContentItemFinalAsset"("storageArea", "storageKey");
    CREATE UNIQUE INDEX IF NOT EXISTS "ContentAssetDeletion_storageArea_storageKey_key" ON "ContentAssetDeletion"("storageArea", "storageKey");
    CREATE INDEX IF NOT EXISTS "ContentAssetDeletion_availableAt_idx" ON "ContentAssetDeletion"("availableAt");
    CREATE OR REPLACE FUNCTION enqueue_content_asset_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE key TEXT; folder TEXT;
    BEGIN
      IF OLD."storageKey" IS NOT NULL THEN
        folder := regexp_replace(OLD."storageKey", '[^/]*$', '');
        FOREACH key IN ARRAY ARRAY[OLD."storageKey", folder || 'derived/' || OLD."id" || '-instagram.jpg', folder || 'derived/' || OLD."id" || '-facebook.jpg'] LOOP
          INSERT INTO "ContentAssetDeletion"("id", "storageKey", "storageArea") VALUES (gen_random_uuid()::text, key, OLD."storageArea") ON CONFLICT ("storageArea", "storageKey") DO NOTHING;
        END LOOP;
      END IF;
      RETURN OLD;
    END $$;
    DROP TRIGGER IF EXISTS content_asset_delete_cleanup ON "ContentItemFinalAsset";
    CREATE TRIGGER content_asset_delete_cleanup BEFORE DELETE ON "ContentItemFinalAsset" FOR EACH ROW EXECUTE FUNCTION enqueue_content_asset_deletion();
    CREATE OR REPLACE FUNCTION enqueue_content_upload_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE file JSONB; key TEXT;
    BEGIN
      FOR file IN SELECT * FROM jsonb_array_elements(OLD."manifest") LOOP
        FOREACH key IN ARRAY ARRAY[file->>'key', file->>'finalKey'] LOOP
          IF key IS NOT NULL THEN
            INSERT INTO "ContentAssetDeletion"("id", "storageKey", "storageArea", "availableAt")
              VALUES (gen_random_uuid()::text, key, OLD."storageArea", GREATEST(CURRENT_TIMESTAMP, OLD."expiresAt")) ON CONFLICT ("storageArea", "storageKey") DO NOTHING;
          END IF;
        END LOOP;
      END LOOP;
      RETURN OLD;
    END $$;
    DROP TRIGGER IF EXISTS content_upload_delete_cleanup ON "ContentItemDeliveryUpload";
    CREATE TRIGGER content_upload_delete_cleanup BEFORE DELETE ON "ContentItemDeliveryUpload" FOR EACH ROW EXECUTE FUNCTION enqueue_content_upload_deletion();
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be supplied explicitly.');
    await client.connect();
    await ensureContentDeliverySchema(client);
    console.log('[Parrillas] Esquema de entregas e historial preparado.');
  } catch (error) { console.error('[Parrillas] No se pudo preparar el esquema de entregas:', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
