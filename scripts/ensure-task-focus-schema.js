import pg from 'pg';

// Compromiso con hora en el deadline (21 de septiembre de 2026): columna aditiva e idempotente en Task.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "focusDeadlineAt" TIMESTAMP(3);`);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "Task_assigneeId_focusDeadlineAt_idx"
    ON "Task"("assigneeId", "focusDeadlineAt");
  `);
  console.log('[Task focus] focusDeadlineAt column and index ready.');
} catch (error) {
  console.error('[Task focus] Failed to ensure the focus deadline schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
