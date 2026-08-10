import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePayrollPeriod,
  payPayrollTransaction
} from '../src/services/financialPayrollService.js';

test('generatePayrollPeriod snapshots every active contract even without a platform user', async () => {
  const calls = [];
  let contractQuery;
  const tx = {
    financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
    financialImportBatch: {
      findFirst: async (args) => {
        assert.deepEqual(args.where, { year: 2026, status: 'IMPORTED' });
        return { id: 'batch-current' };
      }
    },
    payrollContract: {
      findMany: async (args) => {
        contractQuery = args;
        return [{
          id: 'contract-1',
          userId: null,
          baseSalary: 3000000,
          socialSecurity: 0,
          collaborator: { displayName: 'Kamila del Toro' }
        }];
      }
    },
    payrollTransaction: {
      upsert: async (args) => {
        calls.push(args);
        return { id: 'payroll-1', ...args.create };
      }
    },
    financialAuditEvent: { create: async () => ({ id: 'audit-1' }) }
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };

  const result = await generatePayrollPeriod(prismaClient, { year: 2026, month: 8 }, { id: 'user-1' });

  assert.equal(result.transactions.length, 1);
  assert.equal(calls[0].create.userId, null);
  assert.equal(calls[0].create.baseSalary, 3000000);
  assert.equal(calls[0].create.netAmount, 3000000);
  assert.equal(calls[0].create.status, 'DRAFT');
  assert.deepEqual(contractQuery.where.AND[1], {
    OR: [{ importBatchId: 'batch-current' }, { importBatchId: null }]
  });
});

test('payPayrollTransaction posts the payroll expense to the selected account atomically', async () => {
  const calls = [];
  const transaction = {
    id: 'payroll-1',
    year: 2026,
    month: 8,
    status: 'APPROVED',
    netAmount: 3000000,
    contract: { sourceLabel: 'Kamila del Toro', collaborator: { displayName: 'Kamila del Toro' } }
  };
  const tx = {
    payrollTransaction: {
      findUnique: async () => transaction,
      update: async (args) => {
        calls.push(['transaction.update', args]);
        return { ...transaction, ...args.data };
      }
    },
    financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
    financialRecord: {
      create: async (args) => {
        calls.push(['record.create', args]);
        return { id: 'record-1', ...args.data };
      }
    },
    financialAuditEvent: { create: async () => ({ id: 'audit-1' }) }
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };

  const result = await payPayrollTransaction(prismaClient, 'payroll-1', {
    paidAt: '2026-08-10',
    accountId: 'account-1',
    reference: 'TRX-NOMINA'
  }, { id: 'user-1' });

  assert.equal(result.transaction.status, 'PAID');
  assert.equal(calls.find(([name]) => name === 'record.create')[1].data.type, 'EXPENSE');
  assert.equal(calls.find(([name]) => name === 'record.create')[1].data.accountId, 'account-1');
  assert.equal(calls.find(([name]) => name === 'transaction.update')[1].data.financialRecordId, 'record-1');
});

test('payPayrollTransaction refuses unapproved payroll', async () => {
  const prismaClient = {
    $transaction: async (callback) => callback({
      payrollTransaction: { findUnique: async () => ({ id: 'payroll-1', status: 'DRAFT' }) }
    })
  };

  await assert.rejects(
    payPayrollTransaction(prismaClient, 'payroll-1', { paidAt: '2026-08-10', accountId: 'account-1' }, { id: 'user-1' }),
    (error) => error.code === 'PAYROLL_NOT_APPROVED'
  );
});
