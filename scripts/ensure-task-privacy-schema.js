import pg from 'pg';

// Pendientes privados (23 de septiembre de 2026): columna y tabla aditivas e
// idempotentes. Una tarea existente sigue siendo pública —`isPrivate` nace en `false`—
// así que nada de lo que hay hoy cambia de visibilidad al desplegar.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "TaskViewer" (
      "id" TEXT PRIMARY KEY,
      "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Con el nombre que genera Prisma para `@@unique`, para que un `db push` futuro no
  // encuentre un índice distinto del que declara el esquema.
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "TaskViewer_taskId_userId_key" ON "TaskViewer"("taskId", "userId");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TaskViewer_userId_idx" ON "TaskViewer"("userId");`);
  console.log('[Pendientes privados] Columna isPrivate y tabla TaskViewer listas.');
} catch (error) {
  console.error('[Pendientes privados] Failed to ensure the task privacy schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
