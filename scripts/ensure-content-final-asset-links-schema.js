import pg from 'pg';

// Pieza final por enlace de Drive (24 de septiembre de 2026): columnas aditivas y soltar el NOT NULL
// de lo que solo tiene sentido en un archivo guardado por nosotros. Una fila existente no cambia:
// sigue teniendo su `storageKey`, su tipo y su peso, y las columnas nuevas nacen vacías.
//
// `DROP NOT NULL` es idempotente en PostgreSQL y no toca ningún dato. El índice único de `storageKey`
// admite varios NULL, así que las filas de enlace conviven con las de archivo sin chocar entre ellas.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query(`SELECT to_regclass('public."ContentItemFinalAsset"') AS table;`);
  if (!rows?.[0]?.table) {
    console.log('[Pieza final] La tabla ContentItemFinalAsset todavía no existe; no hay nada que ajustar.');
  } else {
    await client.query(`ALTER TABLE "ContentItemFinalAsset" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;`);
    await client.query(`ALTER TABLE "ContentItemFinalAsset" ADD COLUMN IF NOT EXISTS "externalProvider" TEXT;`);
    await client.query(`ALTER TABLE "ContentItemFinalAsset" ADD COLUMN IF NOT EXISTS "externalFileId" TEXT;`);

    await client.query(`ALTER TABLE "ContentItemFinalAsset" ALTER COLUMN "storageKey" DROP NOT NULL;`);
    await client.query(`ALTER TABLE "ContentItemFinalAsset" ALTER COLUMN "mimeType" DROP NOT NULL;`);
    await client.query(`ALTER TABLE "ContentItemFinalAsset" ALTER COLUMN "size" DROP NOT NULL;`);

    console.log('[Pieza final] Columnas de enlace listas en ContentItemFinalAsset.');
  }
} catch (error) {
  console.error('[Pieza final] Failed to ensure the final asset link schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
