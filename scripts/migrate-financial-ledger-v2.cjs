require('dotenv').config();

const { Client } = require('pg');

const applyChanges = process.argv.includes('--apply');
const DEMO_START = new Date('2026-07-15T08:22:00.000Z');
const DEMO_END = new Date('2026-07-15T08:23:00.000Z');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta configurada');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    const columns = await client.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('FinancialRecord', 'origin'),
           ('FinancialRecord', 'scenario'),
           ('FinancialRecord', 'status'),
           ('AccountsReceivable', 'origin')
         )`,
    );
    if (columns.rowCount !== 4) {
      throw new Error('El esquema financiero v2 aun no esta aplicado. Ejecuta prisma db push antes de esta migracion.');
    }

    const batchResult = await client.query(
      `SELECT id, summary
       FROM "FinancialImportBatch"
       WHERE year = 2026 AND status = 'IMPORTED'
       ORDER BY "importedAt" DESC NULLS LAST, "createdAt" DESC
       LIMIT 1`,
    );
    const activeBatch = batchResult.rows[0];
    if (!activeBatch) throw new Error('No existe un lote financiero 2026 activo.');

    const actualThroughMonth = Number(activeBatch.summary?.actualThroughMonth) || 8;
    const candidates = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE fr."importBatchId" = $1)::int AS active_import_records,
         COUNT(*) FILTER (
           WHERE fr."importBatchId" IS NULL
             AND fr.year IS NULL
             AND fr."sourceSheet" IS NULL
             AND fr."createdAt" >= $2
             AND fr."createdAt" < $3
         )::int AS demo_records
       FROM "FinancialRecord" fr`,
      [activeBatch.id, DEMO_START, DEMO_END],
    );
    const receivableCandidates = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE "importBatchId" = $1)::int AS active_import_receivables,
         COUNT(*) FILTER (
           WHERE "importBatchId" IS NULL
             AND "createdAt" >= $2
             AND "createdAt" < $3
         )::int AS demo_receivables
       FROM "AccountsReceivable"`,
      [activeBatch.id, DEMO_START, DEMO_END],
    );

    const plan = {
      mode: applyChanges ? 'APPLY' : 'DRY_RUN',
      activeBatchId: activeBatch.id,
      actualThroughMonth,
      ...candidates.rows[0],
      ...receivableCandidates.rows[0],
    };

    if (applyChanges) {
      await client.query(
        `UPDATE "FinancialRecord"
         SET origin = 'IMPORT'::"FinancialRecordOrigin",
             status = 'POSTED'::"FinancialRecordStatus",
             scenario = CASE
               WHEN month <= $2 THEN 'ACTUAL'::"FinancialScenario"
               ELSE 'FORECAST'::"FinancialScenario"
             END,
             "isProjection" = month > $2,
             "postedAt" = CASE WHEN month <= $2 THEN COALESCE("postedAt", date) ELSE NULL END
         WHERE "importBatchId" = $1`,
        [activeBatch.id, actualThroughMonth],
      );
      await client.query(
        `UPDATE "AccountsReceivable"
         SET origin = 'IMPORT'::"FinancialRecordOrigin"
         WHERE "importBatchId" = $1`,
        [activeBatch.id],
      );
      await client.query(
        `UPDATE "FinancialRecord"
         SET origin = 'SYSTEM'::"FinancialRecordOrigin",
             status = 'VOIDED'::"FinancialRecordStatus",
             "voidReason" = 'Datos demo previos al libro financiero operativo',
             "voidedAt" = COALESCE("voidedAt", CURRENT_TIMESTAMP)
         WHERE "importBatchId" IS NULL
           AND year IS NULL
           AND "sourceSheet" IS NULL
           AND "createdAt" >= $1
           AND "createdAt" < $2`,
        [DEMO_START, DEMO_END],
      );
      await client.query(
        `UPDATE "AccountsReceivable"
         SET origin = 'SYSTEM'::"FinancialRecordOrigin"
         WHERE "importBatchId" IS NULL
           AND "createdAt" >= $1
           AND "createdAt" < $2`,
        [DEMO_START, DEMO_END],
      );
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
