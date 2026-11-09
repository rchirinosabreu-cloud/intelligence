import pg from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function ensureTaskCardOrderSchema(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS "TaskCardOrder" (
    "taskId" TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "memberId" TEXT NOT NULL DEFAULT '',
    status "TaskStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL CHECK ("sortOrder" >= 0),
    revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY ("taskId", "memberId")
  );`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureTaskCardOrderSchema(client); console.log('[Orden de tarjetas] Esquema aditivo listo.'); }
  catch (error) { console.error('[Orden de tarjetas]', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
