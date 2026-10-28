import pg from 'pg';

// Áreas del equipo (28 de octubre de 2026): una columna aditiva e idempotente en TeamMember. Nace vacía y
// `memberAreas` deduce el área del cargo escrito mientras nadie la elija, así que desplegar esto no cambia a
// quién le llega nada.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "areas" TEXT[] NOT NULL DEFAULT '{}';`);
  console.log('[Team areas] column ready.');
} catch (error) {
  console.error('[Team areas] Failed to ensure the schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
