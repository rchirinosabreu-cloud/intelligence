import pg from 'pg';

// La aprobación del cliente con su marca (Rodny, 20 de octubre de 2026): el cliente aprueba por WhatsApp en
// 13 de los 14 grupos y la plataforma no guardaba quién, cuándo ni por dónde. Una columna aditiva que nace
// vacía: ninguna pieza existente cambia; las nuevas la reciben del portal, del editor o de quien marque la
// aprobación que llegó por fuera.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows } = await client.query(`SELECT to_regclass('public."ContentItem"') AS table;`);
  if (!rows?.[0]?.table) {
    console.log('[Parrillas] La tabla ContentItem todavía no existe; no hay nada que ajustar.');
  } else {
    await client.query(`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "clientApproval" JSONB;`);
    console.log('[Parrillas] Columna de aprobación del cliente lista en ContentItem.');
  }
} catch (error) {
  console.error('[Parrillas] Failed to ensure the client approval schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
