import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialPayrollLedger,
    updateFinancialPayrollContract
} from '../src/controllers/financialController.js';
import fs from 'node:fs';

const dashboardSource = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');

test('payroll UI can generate, approve and pay a monthly payroll period', () => {
    assert.match(dashboardSource, /Nuevo contrato/);
    assert.match(dashboardSource, /post\(`\$\{baseUrl\}\/api\/financials\/payroll-contracts`/);
    assert.match(dashboardSource, /\/payroll\/periods/);
    assert.match(dashboardSource, /\/payroll-transactions\/\$\{transaction\.id\}\/approve/);
    assert.match(dashboardSource, /\/payroll-transactions\/\$\{payrollPayment\.id\}\/pay/);
    assert.match(dashboardSource, /Generar nómina/);
});

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

test('getFinancialPayrollLedger returns imported payroll contracts as editable rows', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        payrollContract: {
            findMany: async (args) => {
                assert.deepEqual(args.where, { OR: [{ importBatchId: 'batch-1' }, { importBatchId: null }] });
                return [{
                    id: 'contract-1',
                    userId: null,
                    collaboratorId: 'collaborator-1',
                    baseSalary: 3000000,
                    socialSecurity: 0,
                    sourceLabel: 'Camila del toro',
                    metadata: { monthlyTotal: 3000000 },
                    collaborator: { displayName: 'Camila del toro' },
                    user: null,
                    position: { title: 'Project Manager' },
                    transactions: [{
                        id: 'payroll-1', month: 8, year: 2026, status: 'DRAFT',
                        baseSalary: 3000000, socialSecurity: 0, grossAmount: 3000000,
                        deductions: 0, netAmount: 3000000, approvedAt: null, paidAt: null,
                        financialRecordId: null
                    }]
                }];
            }
        }
    };
    const res = makeResponse();

    await getFinancialPayrollLedger({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.items, [{
        id: 'contract-1',
        collaboratorId: 'collaborator-1',
        userId: null,
        name: 'Camila del toro',
        position: 'Project Manager',
        baseSalary: 3000000,
        socialSecurity: 0,
        startDate: null,
        endDate: null,
        monthlyTotal: 3000000,
        transactions: [{
            id: 'payroll-1', month: 8, year: 2026, status: 'DRAFT',
            baseSalary: 3000000, socialSecurity: 0, grossAmount: 3000000,
            deductions: 0, netAmount: 3000000, approvedAt: null, paidAt: null,
            financialRecordId: null
        }]
    }]);
});

test('updateFinancialPayrollContract updates payroll money fields and preserves metadata', async () => {
    const calls = [];
    const prismaClient = {};
    const updatePayrollContractService = async (client, id, body, user) => {
        calls.push({ client, id, body, user });
        return {
            id: 'contract-1', baseSalary: 3200000, socialSecurity: 100000,
            startDate: new Date('2026-07-01T12:00:00.000Z'), endDate: null,
            metadata: { source: 'excel', monthlyTotal: 3300000 }, collaboratorId: 'collaborator-1',
            userId: null, collaborator: { displayName: 'Camila del toro' }, user: null,
            position: { title: 'Project Manager' }, transactions: []
        };
    };
    const res = makeResponse();

    await updateFinancialPayrollContract({
        params: { id: 'contract-1' },
        body: {
            baseSalary: 3200000,
            socialSecurity: 100000,
            monthlyTotal: 3300000
        },
        user: { id: 'user-1' }
    }, res, { prismaClient, updatePayrollContractService });

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].id, 'contract-1');
    assert.equal(calls[0].body.baseSalary, 3200000);
    assert.equal(calls[0].body.socialSecurity, 100000);
    assert.equal(calls[0].body.monthlyTotal, 3300000);
    assert.equal(calls[0].user.id, 'user-1');
    assert.equal(res.payload.contract.monthlyTotal, 3300000);
});
