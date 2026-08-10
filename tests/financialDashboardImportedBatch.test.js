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

test('getFinancialDashboard uses posted actual records as the source of truth while preserving import reconciliation', async () => {
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
        scenario: 'ACTUAL',
        totals: {
            income: 100,
            expense: 40,
            netFlow: 60,
            receivable: 0,
            calculatedReceivable: 33
        },
        importedTotals: {
            income: 100,
            expense: 55,
            netFlow: 45,
            receivable: 26
        }
    });
    assert.deepEqual(res.payload.cashFlow, [{
        year: 2026,
        month: 1,
        income: 100,
        expense: 40,
        netFlow: 60
    }]);
    const recordWhere = calls.find(([name]) => name === 'financialRecord.findMany')[1].where;
    assert.equal(recordWhere.scenario, 'ACTUAL');
    assert.equal(recordWhere.status, 'POSTED');
    assert.deepEqual(recordWhere.OR, [{ importBatchId: 'batch-1' }, { importBatchId: null }]);
    const receivableWhere = calls.find(([name]) => name === 'accountsReceivable.findMany')[1].where;
    assert.deepEqual(receivableWhere.OR, [
        { importBatchId: 'batch-1' },
        { importBatchId: null, origin: 'MANUAL' }
    ]);
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

test('getFinancialDashboard surfaces imported payroll collaborators without platform users', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({
                id: 'batch-1',
                summary: {
                    totals: {
                        explicit: { income: 0, totalCostAndExpense: 0, netResult: 0, debt: 0 },
                        calculated: { debt: 0 }
                    }
                }
            })
        },
        financialMonthlySummary: { findMany: async () => [] },
        financialRecord: { findMany: async () => [] },
        accountsReceivable: { findMany: async () => [] },
        payrollTransaction: { findMany: async () => [] },
        payrollContract: {
            findMany: async () => [{
                id: 'contract-1',
                userId: null,
                collaboratorId: 'collaborator-1',
                baseSalary: 3000000,
                socialSecurity: 1000,
                sourceLabel: 'Camila del toro',
                metadata: {
                    monthlyTotal: 3000000
                },
                user: null,
                collaborator: {
                    displayName: 'Camila del toro'
                },
                position: {
                    title: 'Project Manager'
                }
            }]
        }
    };

    const res = makeResponse();
    await getFinancialDashboard({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.payroll.totalPayrollCost, 3000000);
    assert.deepEqual(res.payload.payroll.collaborators, [{
        userId: null,
        collaboratorId: 'collaborator-1',
        contractId: 'contract-1',
        name: 'Camila del toro',
        email: '',
        position: 'Project Manager',
        baseSalary: 3000000,
        socialSecurity: 1000,
        adjustmentsTotal: 0,
        totalPaid: 3000000,
        adjustments: []
    }]);
});

test('getFinancialDashboard keeps payroll transactions without platform users separated by collaborator', async () => {
    const prismaClient = {
        financialImportBatch: { findFirst: async () => null },
        financialMonthlySummary: { findMany: async () => [] },
        financialRecord: { findMany: async () => [] },
        accountsReceivable: { findMany: async () => [] },
        payrollContract: { findMany: async () => [] },
        payrollTransaction: {
            findMany: async () => ([
                {
                    id: 'tx-1', contractId: 'contract-1', userId: null,
                    baseSalary: 3000000, socialSecurity: 0, netAmount: 3000000,
                    user: null, adjustments: [],
                    contract: {
                        collaboratorId: 'collaborator-1', sourceLabel: 'Camila',
                        collaborator: { displayName: 'Camila' }, position: { title: 'Project Manager' }
                    }
                },
                {
                    id: 'tx-2', contractId: 'contract-2', userId: null,
                    baseSalary: 1300000, socialSecurity: 0, netAmount: 1300000,
                    user: null, adjustments: [],
                    contract: {
                        collaboratorId: 'collaborator-2', sourceLabel: 'Helen',
                        collaborator: { displayName: 'Helen' }, position: { title: 'Community Manager' }
                    }
                }
            ])
        }
    };

    const res = makeResponse();
    await getFinancialDashboard({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.payroll.collaborators.length, 2);
    assert.deepEqual(res.payload.payroll.collaborators.map((item) => item.name).sort(), ['Camila', 'Helen']);
    assert.equal(res.payload.payroll.totalPayrollCost, 4300000);
});
