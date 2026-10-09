import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
try {
  await pool.query(await readFile(new URL('./sql/bria-knowledge.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('./sql/bria-conversations.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('./sql/bria-agency-facts.sql', import.meta.url), 'utf8'));
  console.log('[Bria] Memoria, conversaciones y memoria de la agencia disponibles.');
}
finally { await pool.end(); }
