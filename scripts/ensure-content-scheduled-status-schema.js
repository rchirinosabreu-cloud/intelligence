import pg from 'pg';

// El estado «Programado» de una pieza (Rodny, 15 de octubre de 2026).
//
// Entre «Realizado» y «Publicado» faltaba decir «ya está programada en Meta y espera su hora». Sin ese
// estado, quien programaba movía su pendiente «Publicar» a realizado con la certeza de que iba a salir,
// el espejo pendiente→pieza la dejaba en PUBLICADO y, al llegar la hora, el publicador la encontraba
// publicada y canceló las dos redes: el reel no salió y el aviso culpaba a la pieza.
//
// Un valor nuevo de un enum es aditivo: ninguna fila cambia y nada que lea los estados de antes se
// entera. `ADD VALUE IF NOT EXISTS` es idempotente, así que esto puede correr en cada arranque.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query(`SELECT to_regtype('"ContentItemStatus"') AS type;`);
  if (!rows?.[0]?.type) {
    console.log('[Parrillas] El enum ContentItemStatus todavía no existe; no hay nada que ajustar.');
  } else {
    // Fuera de transacción a propósito: PostgreSQL no deja usar un valor de enum recién añadido dentro
    // de la misma transacción que lo creó.
    await client.query(`ALTER TYPE "ContentItemStatus" ADD VALUE IF NOT EXISTS 'PROGRAMADO';`);
    console.log('[Parrillas] Estado PROGRAMADO listo en ContentItemStatus.');
  }
} catch (error) {
  console.error('[Parrillas] Failed to ensure the scheduled content status:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
