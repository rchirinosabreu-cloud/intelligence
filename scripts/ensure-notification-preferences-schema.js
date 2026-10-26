import pg from 'pg';

// Avisos del equipo (26 de octubre de 2026): una columna aditiva e idempotente en User con
// lo que cada quien decidió. Nace vacía y `normalizeNotificationPreferences` la lee como
// «todo apagado», así que nadie empieza a recibir avisos por desplegar esto.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;`);
  console.log('[Notification preferences] column ready.');
} catch (error) {
  console.error('[Notification preferences] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
