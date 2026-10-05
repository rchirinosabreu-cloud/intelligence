import pg from 'pg';

// Colaboradores de una tarea (Rodny, 5 de octubre de 2026): tabla aditiva e idempotente.
// Una tarea existente no tiene colaboradores, así que al desplegar nada cambia: el
// responsable sigue siendo uno y su reloj sigue siendo el de siempre.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS "TaskCollaborator" (
      "id" TEXT PRIMARY KEY,
      "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "memberId" TEXT NOT NULL REFERENCES "TeamMember"("id") ON DELETE CASCADE,
      "addedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Con los nombres que genera Prisma, para que un `db push` futuro no vea índices distintos.
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "TaskCollaborator_taskId_memberId_key" ON "TaskCollaborator"("taskId", "memberId");`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TaskCollaborator_memberId_idx" ON "TaskCollaborator"("memberId");`);
  // Cada tramo de tiempo dice si es del responsable o de un colaborador. Las sesiones que ya
  // existen nacen en `false`: eran todas del responsable, así que el historial no cambia.
  await client.query(`ALTER TABLE "TaskWorkSession" ADD COLUMN IF NOT EXISTS "isCollaborator" BOOLEAN NOT NULL DEFAULT false;`);
  console.log('[Colaboradores] Tabla TaskCollaborator lista.');
} catch (error) {
  console.error('[Colaboradores] Failed to ensure the task collaborators schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
