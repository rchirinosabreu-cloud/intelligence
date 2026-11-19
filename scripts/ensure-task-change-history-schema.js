import pg from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// El historial de cada tarea (Rodny, 19 de noviembre de 2026): quién cambió qué y cuándo. Solo se agregan filas
// (catálogo de auditoría inmutable). Sin llave hacia Task, como TaskDeliverableEvent: la historia sobrevive a la tarea.
export async function ensureTaskChangeHistorySchema(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS "TaskChangeEvent" (
    id TEXT PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    kind TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  await client.query('CREATE INDEX IF NOT EXISTS "TaskChangeEvent_taskId_occurredAt_idx" ON "TaskChangeEvent" ("taskId", "occurredAt");');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); await ensureTaskChangeHistorySchema(client); console.log('[Historial de tareas] Esquema aditivo listo.'); }
  catch (error) { console.error('[Historial de tareas]', error.message); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
}
