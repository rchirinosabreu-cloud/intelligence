import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE INDEX IF NOT EXISTS "Task_creatorId_status_returnedAt_idx"
    ON "Task"("creatorId", "status", "returnedAt");
  `);
  console.log('[Returned task reminders] Polling index ready.');
} catch (error) {
  console.error('[Returned task reminders] Failed to create polling index:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
