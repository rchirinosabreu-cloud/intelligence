import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialPayrollLedger,
    updateFinancialPayrollContract
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

test('getFinancialPayrollLedger returns imported payroll contracts as editable rows', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        payrollContract: {
            findMany: async (args) => {
                assert.deepEqual(args.where, { importBatchId: 'batch-1' });
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
                    position: { title: 'Project Manager' }
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
        monthlyTotal: 3000000
    }]);
});

test('updateFinancialPayrollContract updates payroll money fields and preserves metadata', async () => {
    const calls = [];
    const prismaClient = {
        payrollContract: {
            findUnique: async () => ({
                id: 'contract-1',
                metadata: { source: 'excel' }
            }),
            update: async (args) => {
                calls.push(args);
                return {
                    id: 'contract-1',
                    baseSalary: 3200000,
                    socialSecurity: 100000,
                    metadata: args.data.metadata,
                    collaboratorId: 'collaborator-1',
                    userId: null,
                    collaborator: { displayName: 'Camila del toro' },
                    user: null,
                    position: { title: 'Project Manager' }
                };
            }
        }
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
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].where.id, 'contract-1');
    assert.equal(calls[0].data.baseSalary, 3200000);
    assert.equal(calls[0].data.socialSecurity, 100000);
    assert.equal(calls[0].data.metadata.monthlyTotal, 3300000);
    assert.equal(calls[0].data.metadata.source, 'excel');
    assert.equal(calls[0].data.metadata.editedBy, 'user-1');
    assert.equal(res.payload.contract.monthlyTotal, 3300000);
});
