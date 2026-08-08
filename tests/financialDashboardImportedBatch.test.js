import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinancialDashboard } from '../src/controllers/financialController.js';

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

test('getFinancialDashboard uses the latest imported batch as the financial source of truth', async () => {
    const calls = [];
    const prismaClient = {
        financialImportBatch: {
            findFirst: async (args) => {
                calls.push(['financialImportBatch.findFirst', args]);
                return {
                    id: 'batch-1',
                    summary: {
                        totals: {
                            explicit: {
                                income: 100,
                                totalCostAndExpense: 55,
                                netResult: 45,
                                debt: 26
                            },
                            calculated: {
                                debt: 33
                            }
                        }
                    }
                };
            }
        },
        financialMonthlySummary: {
            findMany: async (args) => {
                calls.push(['financialMonthlySummary.findMany', args]);
                return [{
                    year: 2026,
                    month: 1,
                    explicitIncome: 100,
                    calculatedIncome: 100,
                    explicitAdminCost: 40,
                    calculatedAdminCost: 45,
                    explicitOperatingExpense: 10,
                    calculatedOperatingExpense: 10,
                    explicitFinancing: 5,
                    calculatedFinancing: 5,
                    netResult: 45
                }];
            }
        },
        financialRecord: {
            findMany: async (args) => {
                calls.push(['financialRecord.findMany', args]);
                return [
                    { amount: 100, type: 'INCOME', category: 'MEMBRESIA', date: new Date(Date.UTC(2026, 0, 1)), month: 1, year: 2026 },
                    { amount: 40, type: 'EXPENSE', category: 'NOMINA', date: new Date(Date.UTC(2026, 0, 1)), month: 1, year: 2026 }
                ];
            }
        },
        accountsReceivable: {
            findMany: async (args) => {
                calls.push(['accountsReceivable.findMany', args]);
                return [];
            }
        },
        payrollTransaction: {
            findMany: async () => []
        },
        payrollContract: {
            findMany: async () => []
        }
    };

    const req = { query: { year: 2026 } };
    const res = makeResponse();

    await getFinancialDashboard(req, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.sourceSummary, {
        importBatchId: 'batch-1',
        totals: {
            income: 100,
            expense: 55,
            netFlow: 45,
            receivable: 26,
            calculatedReceivable: 33
        }
    });
    assert.deepEqual(res.payload.cashFlow, [{
        year: 2026,
        month: 1,
        income: 100,
        expense: 55,
        netFlow: 45
    }]);
    assert.equal(
        calls.find(([name]) => name === 'financialRecord.findMany')[1].where.importBatchId,
        'batch-1'
    );
    assert.equal(
        calls.find(([name]) => name === 'accountsReceivable.findMany')[1].where.importBatchId,
        'batch-1'
    );
});

test('getFinancialDashboard uses UTC month boundaries when no imported batch exists', async () => {
    const calls = [];
    const prismaClient = {
        financialImportBatch: { findFirst: async () => null },
        financialMonthlySummary: { findMany: async () => [] },
        financialRecord: {
            findMany: async (args) => {
                calls.push(args);
                return [];
            }
        },
        accountsReceivable: { findMany: async () => [] },
        payrollTransaction: { findMany: async () => [] },
        payrollContract: { findMany: async () => [] }
    };

    await getFinancialDashboard({ query: { year: 2026 } }, makeResponse(), { prismaClient });

    assert.equal(calls[0].where.date.gte.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(calls[0].where.date.lt.toISOString(), '2027-01-01T00:00:00.000Z');
});
