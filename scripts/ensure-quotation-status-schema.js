import pg from 'pg';

// El estado «Reemplazada» de una cotización (Elisa, 13 de noviembre de 2026: «si se hace un primer borrador y luego
// se edita y se emite, debería quedar solo la que se emite»). Cuando se emite una cotización, los otros borradores
// de la misma oportunidad pasan a REEMPLAZADA: se conservan con su historial y salen de la lista.
//
// Un valor nuevo de un enum es aditivo: ninguna fila cambia y nada que lea los estados de antes se entera.
// `ADD VALUE IF NOT EXISTS` es idempotente, así que esto puede correr en cada arranque.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query(`SELECT to_regtype('"QuotationStatus"') AS type;`);
  if (!rows?.[0]?.type) {
    console.log('[Cotizaciones] El enum QuotationStatus todavía no existe; no hay nada que ajustar.');
  } else {
    // Fuera de transacción a propósito: PostgreSQL no deja usar un valor de enum recién añadido dentro
    // de la misma transacción que lo creó.
    await client.query(`ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'REEMPLAZADA';`);
    console.log('[Cotizaciones] Estado REEMPLAZADA listo en QuotationStatus.');
  }
} catch (error) {
  console.error('[Cotizaciones] Failed to ensure the replaced quotation status:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
