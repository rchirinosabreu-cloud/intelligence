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

test('updateFinancialMonthlySummary edits a monthly amount and refreshes annual import totals', async () => {
    const calls = [];
    const existingSummary = {
        id: 'summary-1',
        year: 2026,
        month: 1,
        importBatchId: 'batch-1',
        explicitIncome: 23006333,
        explicitAdminCost: 18698907,
        explicitOperatingExpense: 3452222,
        explicitFinancing: 5174381,
        explicitDebt: 6870000,
        netResult: 855204,
        metadata: { source: 'excel' }
    };
    const updatedSummary = {
        ...existingSummary,
        explicitIncome: 24000000,
        netResult: -3325510,
        metadata: {
            source: 'excel',
            editedBy: 'user-1'
        }
    };
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialMonthlySummary: {
                findUnique: async (args) => {
                    calls.push(['summary.findUnique', args]);
                    return existingSummary;
                },
                update: async (args) => {
                    calls.push(['summary.update', args]);
                    return updatedSummary;
                },
                findMany: async (args) => {
                    calls.push(['summary.findMany', args]);
                    return [
                        updatedSummary,
                        {
                            ...existingSummary,
                            id: 'summary-2',
                            month: 2,
                            explicitIncome: 1000,
                            explicitAdminCost: 200,
                            explicitOperatingExpense: 300,
                            explicitFinancing: 400,
                            explicitDebt: 500,
                            netResult: 100
                        }
                    ];
                }
            },
            financialImportBatch: {
                update: async (args) => {
                    calls.push(['batch.update', args]);
                    return { id: 'batch-1' };
                }
            }
        })
    };
    const res = makeResponse();

    await updateFinancialMonthlySummary({
        params: { id: 'summary-1' },
        body: { field: 'explicitIncome', amount: 24000000 },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    const updateCall = calls.find(([name]) => name === 'summary.update');
    assert.equal(updateCall[1].data.explicitIncome, 24000000);
    assert.equal(updateCall[1].data.netResult, -3325510);
    assert.equal(updateCall[1].data.metadata.editedBy, 'user-1');
    const batchUpdate = calls.find(([name]) => name === 'batch.update');
    assert.equal(batchUpdate[1].data.summary.totals.explicit.income, 24001000);
    assert.equal(batchUpdate[1].data.summary.totals.explicit.netResult, -3325410);
    assert.equal(res.payload.summary.id, 'summary-1');
});
