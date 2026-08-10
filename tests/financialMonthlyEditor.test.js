import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialMonthlyLedger,
    updateFinancialMonthlySummary
} from '../src/controllers/financialController.js';

const makeResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

test('getFinancialMonthlyLedger returns editable official monthly rows from the active import batch', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        financialMonthlySummary: {
            findMany: async (args) => {
                assert.deepEqual(args.where, { year: 2026, importBatchId: 'batch-1' });
                return [{
                    id: 'summary-1',
                    year: 2026,
                    month: 1,
                    explicitIncome: 23006333,
                    explicitAdminCost: 18698907,
                    explicitOperatingExpense: 3452222,
                    explicitFinancing: 5174381,
                    explicitDebt: 6870000,
                    netResult: 855204
                }];
            }
        }
    };
    const res = makeResponse();

    await getFinancialMonthlyLedger({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.importBatchId, 'batch-1');
    assert.equal(res.payload.months.length, 12);
    assert.equal(res.payload.rows[0].key, 'explicitIncome');
    assert.equal(res.payload.rows[0].label, 'Ingresos');
    assert.equal(res.payload.rows[0].values.length, 12);
    assert.deepEqual(res.payload.rows[0].values[0], { summaryId: 'summary-1', month: 1, amount: 23006333 });
    assert.equal(res.payload.rows.find((row) => row.key === 'netResult').values[0].amount, 855204);
});

test('updateFinancialMonthlySummary rejects direct summary edits to preserve a single source of truth', async () => {
    const res = makeResponse();

    const prismaClient = {
        $transaction: async () => {
            throw new Error('The read-only endpoint must not open a transaction');
        }
    };

    await updateFinancialMonthlySummary({
        params: { id: 'summary-1' },
        body: { field: 'explicitIncome', amount: 24000000 },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.error, 'FINANCIAL_SUMMARY_READ_ONLY');
    assert.match(res.payload.message, /movimientos financieros/i);
});
