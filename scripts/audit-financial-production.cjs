require('dotenv').config();

const { Client } = require('pg');
const crypto = require('node:crypto');
const fs = require('node:fs');

async function query(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows;
}

async function main() {
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('No hay una URL de base de datos configurada');
  }

  const workbookPath = process.argv[2] || null;
  let workbookAudit = null;
  if (workbookPath) {
    const buffer = fs.readFileSync(workbookPath);
    const { parseFinancialImportWorkbook } = await import('../src/services/financialImportService.js');
    const preview = parseFinancialImportWorkbook(buffer, {
      filename: workbookPath,
      actualThroughMonth: 8,
    });
    workbookAudit = {
      sourceHash: crypto.createHash('sha256').update(buffer).digest('hex'),
      sourceSheet: preview.sourceSheet,
      entries: preview.entries.length,
      incomeByMonth: preview.totals.monthly.calculated.income,
      expenseByMonth: preview.totals.monthly.calculated.expense,
      operatingExpenseByMonth: preview.totals.monthly.calculated.operatingExpense,
      investmentByMonth: preview.totals.monthly.calculated.investment,
      financingByMonth: preview.totals.monthly.calculated.financing,
      warnings: preview.warnings,
    };
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN READ ONLY');

    const v2Columns = await query(
      client,
      `SELECT COUNT(*)::int AS columns
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('FinancialRecord', 'origin'),
           ('FinancialRecord', 'scenario'),
           ('FinancialRecord', 'status'),
           ('AccountsReceivable', 'origin')
         )`,
    );
    const hasV2Schema = v2Columns[0]?.columns === 4;

    const payrollDuplicates = await query(
      client,
      `SELECT "contractId", month, year, COUNT(*)::int AS count
       FROM "PayrollTransaction"
       GROUP BY "contractId", month, year
       HAVING COUNT(*) > 1
       ORDER BY count DESC`,
    );
    const payrollTotals = await query(
      client,
      `SELECT COUNT(*)::int AS payroll_transactions,
              COUNT(DISTINCT "contractId")::int AS contracts
       FROM "PayrollTransaction"`,
    );
    const financialTotals = await query(
      client,
      `SELECT COUNT(*)::int AS financial_records,
              COUNT(*) FILTER (WHERE "importBatchId" IS NOT NULL)::int AS imported_records,
              COUNT(*) FILTER (WHERE "clientId" IS NULL)::int AS records_without_client
       FROM "FinancialRecord"`,
    );
    const receivableTotals = await query(
      client,
      `SELECT COUNT(*)::int AS receivables,
              COALESCE(SUM(amount), 0)::text AS receivable_total
       FROM "AccountsReceivable"`,
    );
    const activeBatches = await query(
      client,
      `SELECT id, "sourceFilename", "sourceHash", "importedAt"
       FROM "FinancialImportBatch"
       WHERE year = 2026 AND status = 'IMPORTED'
       ORDER BY "importedAt" DESC NULLS LAST, "createdAt" DESC
       LIMIT 1`,
    );
    const activeBatch = activeBatches[0] || null;
    const receivablesByBatch = await query(
      client,
      `SELECT COALESCE(ar."importBatchId", '(sin lote)') AS import_batch_id,
              COALESCE(fib."sourceFilename", '(sin lote)') AS source_filename,
              COUNT(*)::int AS receivables,
              COALESCE(SUM(ar.amount), 0)::text AS total
       FROM "AccountsReceivable" ar
       LEFT JOIN "FinancialImportBatch" fib ON fib.id = ar."importBatchId"
       GROUP BY ar."importBatchId", fib."sourceFilename"
       ORDER BY receivables DESC`,
    );
    const unbatchedReceivables = await query(
      client,
      `SELECT ar.id, c.name AS client, ar.amount::text, ar.period, ar.status,
              ar.notes, ar.comments, ar."createdAt"
       FROM "AccountsReceivable" ar
       JOIN "Client" c ON c.id = ar."clientId"
       WHERE ar."importBatchId" IS NULL
       ORDER BY ar."createdAt", c.name`,
    );
    const payrollContractsByBatch = await query(
      client,
      `SELECT COALESCE(pc."importBatchId", '(sin lote)') AS import_batch_id,
              COALESCE(fib."sourceFilename", '(sin lote)') AS source_filename,
              COUNT(*)::int AS contracts
       FROM "PayrollContract" pc
       LEFT JOIN "FinancialImportBatch" fib ON fib.id = pc."importBatchId"
       GROUP BY pc."importBatchId", fib."sourceFilename"
       ORDER BY contracts DESC`,
    );
    const unbatchedRecordGroups = await query(
      client,
      `SELECT COALESCE("sourceSheet", '(manual)') AS source_sheet,
              COUNT(*)::int AS records,
              COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::text AS income,
              COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense
       FROM "FinancialRecord"
       WHERE "importBatchId" IS NULL
       GROUP BY COALESCE("sourceSheet", '(manual)')
       ORDER BY records DESC`,
    );
    const unbatchedRecordProfile = await query(
      client,
      `SELECT year, category, type,
              COUNT(*)::int AS records,
              MIN("createdAt") AS first_created_at,
              MAX("createdAt") AS last_created_at,
              MIN(description) AS sample_description
       FROM "FinancialRecord"
       WHERE "importBatchId" IS NULL
       GROUP BY year, category, type
       ORDER BY year, category, type`,
    );
    const importedMonthlyTotals = activeBatch
      ? await query(
          client,
          `SELECT month,
                  COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::text AS income,
                  COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense
           FROM "FinancialRecord"
           WHERE "importBatchId" = $1
           GROUP BY month
           ORDER BY month`,
          [activeBatch.id],
        )
      : [];
    const recordClassifications = hasV2Schema
      ? await query(
          client,
          `SELECT origin, scenario, status, COUNT(*)::int AS records,
                  COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::text AS income,
                  COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense
           FROM "FinancialRecord"
           GROUP BY origin, scenario, status
           ORDER BY origin, scenario, status`,
        )
      : [];
    const receivableClassifications = hasV2Schema
      ? await query(
          client,
          `SELECT origin, COUNT(*)::int AS receivables,
                  COALESCE(SUM(amount), 0)::text AS total
           FROM "AccountsReceivable"
           GROUP BY origin
           ORDER BY origin`,
        )
      : [];

    console.log(
      JSON.stringify(
        {
          payrollDuplicates,
          payroll: payrollTotals[0],
          financialRecords: financialTotals[0],
          receivables: receivableTotals[0],
          activeImport: activeBatch,
          receivablesByBatch,
          unbatchedReceivables,
          payrollContractsByBatch,
          unbatchedRecordGroups,
          unbatchedRecordProfile,
          importedMonthlyTotals,
          recordClassifications,
          receivableClassifications,
          workbook: workbookAudit,
        },
        null,
        2,
      ),
    );

    await client.query('ROLLBACK');
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
