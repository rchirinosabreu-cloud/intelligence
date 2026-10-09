import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

// Bóveda de accesos (9 de octubre de 2026): esquema aditivo `vault`, idempotente. No toca tablas operativas.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
try {
  await pool.query(await readFile(new URL('./sql/vault.sql', import.meta.url), 'utf8'));
  console.log('[Vault] Bóveda de accesos disponible.');
} finally { await pool.end(); }
