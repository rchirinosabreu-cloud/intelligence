import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Pagos de una liquidación de nómina (Rodny, 30 de septiembre de 2026): una nómina se paga por
// partes, cada una con su egreso. Aditivo e idempotente: crea la tabla y traslada cada pago
// antiguo —el único egreso que tenía una liquidación— a una fila propia, sin tocar el egreso
// ni la liquidación. Nunca borra nada.
export async function ensurePayrollPaymentsSchema(client) {
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query('SELECT pg_advisory_xact_lock(20260930, 1)');
        await client.query(`CREATE TABLE IF NOT EXISTS "PayrollPayment" (
            id TEXT PRIMARY KEY,
            "transactionId" TEXT NOT NULL REFERENCES "PayrollTransaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
            "accountId" TEXT REFERENCES "FinancialAccount"(id) ON DELETE SET NULL ON UPDATE CASCADE,
            "financialRecordId" TEXT REFERENCES "FinancialRecord"(id) ON DELETE SET NULL ON UPDATE CASCADE,
            amount DECIMAL(65,30) NOT NULL,
            "paidAt" TIMESTAMP(3) NOT NULL,
            reference TEXT,
            notes TEXT,
            "createdById" TEXT,
            "reversedAt" TIMESTAMP(3),
            "reversalReason" TEXT,
            "reversedById" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL
        )`);
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayment_financialRecordId_key" ON "PayrollPayment"("financialRecordId")');
        await client.query('CREATE INDEX IF NOT EXISTS "PayrollPayment_transactionId_paidAt_idx" ON "PayrollPayment"("transactionId", "paidAt")');
        await client.query('CREATE INDEX IF NOT EXISTS "PayrollPayment_accountId_paidAt_idx" ON "PayrollPayment"("accountId", "paidAt")');
        // El pago que ya tenía cada liquidación pagada pasa a ser su primer pago. El identificador
        // es fijo por liquidación, así que volver a correr esto no lo duplica.
        const { rowCount } = await client.query(`INSERT INTO "PayrollPayment"
            (id, "transactionId", "accountId", "financialRecordId", amount, "paidAt", reference, notes, "createdById", "createdAt", "updatedAt")
            SELECT 'payroll-payment-legacy:' || t.id, t.id, r."accountId", r.id, r.amount, COALESCE(t."paidAt", r.date),
                   r.reference, r.notes, r."createdById", r."createdAt", CURRENT_TIMESTAMP
            FROM "PayrollTransaction" t
            JOIN "FinancialRecord" r ON r.id = t."financialRecordId"
            WHERE r.status <> 'VOIDED'
              AND NOT EXISTS (SELECT 1 FROM "PayrollPayment" p WHERE p."financialRecordId" = r.id)
            ON CONFLICT (id) DO NOTHING`);
        await client.query('COMMIT');
        return { migratedPayments: rowCount || 0 };
    } catch (error) {
        await client.query('ROLLBACK').catch((rollbackError) => console.error('[Payroll payments schema] Rollback failed:', rollbackError.message));
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
        await client.connect();
        const { migratedPayments } = await ensurePayrollPaymentsSchema(client);
        console.log(`[Payroll payments schema] Ready; ${migratedPayments} earlier payment(s) moved to their own row.`);
    } catch (error) {
        console.error('[Payroll payments schema] Failed:', error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}
