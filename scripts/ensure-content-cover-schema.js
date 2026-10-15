import pg from 'pg';

// Portada de un video (Rodny, 15 de octubre de 2026: «a veces los videos que se publican necesitan
// portadas»). Cuatro columnas aditivas que nacen vacías, así que ninguna parrilla existente cambia:
// una pieza sin portada publica exactamente como hasta ahora y Meta elige su propio fotograma.
//
// Va aparte de `ContentItemFinalAsset` a propósito: el orden de esa tabla es el orden del carrusel que
// sale publicado, y meter ahí una portada lo desordenaría.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query(`SELECT to_regclass('public."ContentItem"') AS table;`);
  if (!rows?.[0]?.table) {
    console.log('[Parrillas] La tabla ContentItem todavía no existe; no hay nada que ajustar.');
  } else {
    await client.query(`
      ALTER TABLE "ContentItem"
        ADD COLUMN IF NOT EXISTS "coverKey" TEXT,
        ADD COLUMN IF NOT EXISTS "coverName" TEXT,
        ADD COLUMN IF NOT EXISTS "coverMimeType" TEXT,
        ADD COLUMN IF NOT EXISTS "coverSize" INTEGER;`);
    console.log('[Parrillas] Columnas de portada listas en ContentItem.');
  }
} catch (error) {
  console.error('[Parrillas] Failed to ensure the content cover schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
