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

// La carga del Excel se retiró el 23 de octubre de 2026: el tablero lee los movimientos
// registrados y ya no compara contra el archivo. Lo que el Excel cargó sigue ahí como historia.
test('getFinancialDashboard uses posted actual records as the only source of truth', async () => {
    const calls = [];
    const prismaClient = {
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
        scenario: 'ACTUAL',
        totals: {
            income: 100,
            expense: 40,
            netFlow: 60,
            receivable: 0,
            // Préstamos (20 de octubre de 2026): reintegros que entraron y préstamos otorgados, aparte.
            loanRepayments: 0,
            loansGranted: 0
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
    assert.equal(recordWhere.OR, undefined, 'ya no hay una carga activa que elegir');
    assert.equal(recordWhere.importBatchId, undefined);
    const receivableWhere = calls.find(([name]) => name === 'accountsReceivable.findMany')[1].where;
    assert.equal(receivableWhere.OR, undefined);
});

test('getFinancialDashboard filters by accounting year and month, never by calendar date', async () => {
    const calls = [];
    const prismaClient = {
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

    await getFinancialDashboard({ query: { year: 2026, month: 3 } }, makeResponse(), { prismaClient });

    assert.equal(calls[0].where.year, 2026);
    assert.deepEqual(calls[0].where.month, { gte: 3, lte: 3 });
    assert.equal(calls[0].where.date, undefined);
});

test('getFinancialDashboard keeps payroll transactions without platform users separated by collaborator', async () => {
    const prismaClient = {
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
