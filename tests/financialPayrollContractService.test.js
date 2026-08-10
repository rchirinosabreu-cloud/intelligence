import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayrollContract, updatePayrollContract } from '../src/services/financialPayrollContractService.js';

const makeTx = (calls) => ({
    financialCollaborator: {
        upsert: async (args) => {
            calls.push(['collaborator.upsert', args]);
            return { id: 'collaborator-1', displayName: args.create.displayName };
        },
        update: async (args) => {
            calls.push(['collaborator.update', args]);
            return { id: args.where.id, ...args.data };
        }
    },
    payrollPosition: {
        upsert: async (args) => {
            calls.push(['position.upsert', args]);
            return { id: 'position-1', title: args.create.title };
        }
    },
    payrollContract: {
        create: async (args) => {
            calls.push(['contract.create', args]);
            return { id: 'contract-1', ...args.data };
        },
        findUnique: async () => ({
            id: 'contract-1', collaboratorId: 'collaborator-1', positionId: 'position-1',
            baseSalary: 3000000, socialSecurity: 0, startDate: new Date('2026-03-01T00:00:00.000Z'),
            endDate: null, metadata: { source: 'excel' }, collaborator: { displayName: 'Gabriel / Kamila' }
        }),
        update: async (args) => {
            calls.push(['contract.update', args]);
            return { id: 'contract-1', ...args.data };
        }
    },
    financialAuditEvent: { create: async (args) => calls.push(['audit.create', args]) }
});

test('createPayrollContract creates a dated collaborator contract atomically', async () => {
    const calls = [];
    const result = await createPayrollContract({ $transaction: async (callback) => callback(makeTx(calls)) }, {
        name: 'Kamila del Toro', position: 'Project Manager', startDate: '2026-07-01',
        baseSalary: 3000000, socialSecurity: 0, monthlyTotal: 3000000
    }, { id: 'user-1' });

    assert.equal(result.startDate.toISOString(), '2026-07-01T12:00:00.000Z');
    assert.equal(calls.find(([name]) => name === 'contract.create')[1].data.importBatchId, null);
    assert.equal(calls.find(([name]) => name === 'audit.create')[1].data.action, 'CREATE');
});

test('updatePayrollContract can rename and end an imported shared contract without rewriting payroll history', async () => {
    const calls = [];
    await updatePayrollContract({ $transaction: async (callback) => callback(makeTx(calls)) }, 'contract-1', {
        name: 'Gabriel', endDate: '2026-06-30', monthlyTotal: 3600000
    }, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'collaborator.update')[1].data.displayName, 'Gabriel');
    assert.equal(calls.find(([name]) => name === 'contract.update')[1].data.endDate.toISOString(), '2026-06-30T12:00:00.000Z');
    assert.equal(calls.find(([name]) => name === 'contract.update')[1].data.metadata.source, 'excel');
    assert.equal(calls.find(([name]) => name === 'audit.create')[1].data.action, 'UPDATE');
});
