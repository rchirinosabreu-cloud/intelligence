import pg from 'pg';

// Nueva ronda de revisión del cliente (Rodny, 5 de octubre de 2026): una columna aditiva y nada más.
// Nace vacía en todas las piezas, así que ninguna parrilla existente cambia de aspecto por desplegar
// esto. Las que ya estaban aprobadas siguen aprobadas: no podemos saber si el cliente las aprobó con
// material o sin él, y adivinarlo sería inventarle una decisión. Para esas está el botón «Pedir nueva
// revisión» del editor; de aquí en adelante se marca solo.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query(`SELECT to_regclass('public."ContentItem"') AS table;`);
  if (!rows?.[0]?.table) {
    console.log('[Parrillas] La tabla ContentItem todavía no existe; no hay nada que ajustar.');
  } else {
    await client.query(`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "revisionRequestedAt" TIMESTAMP(3);`);
    console.log('[Parrillas] Columna revisionRequestedAt lista en ContentItem.');
  }
} catch (error) {
  console.error('[Parrillas] Failed to ensure the content revision schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
