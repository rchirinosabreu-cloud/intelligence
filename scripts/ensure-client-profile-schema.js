import pg from 'pg';

// Ficha completa del cliente (30 de septiembre de 2026): contacto y ubicación, columnas
// aditivas, opcionales e idempotentes. Las fichas que ya existen quedan con esos campos
// vacíos; nada se rellena por suposición.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  for (const column of ['contactName', 'email', 'phone', 'address', 'city', 'country']) {
    await client.query(`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "${column}" TEXT;`);
  }
  console.log('[Client profile] contact and location columns ready.');
} catch (error) {
  console.error('[Client profile] Failed to ensure the client profile schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
