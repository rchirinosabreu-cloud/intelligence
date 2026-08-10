import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFinancialAccount,
  listFinancialAccounts
} from '../src/services/financialAccountService.js';

test('createFinancialAccount normalizes the account and writes an audit event atomically', async () => {
  const calls = [];
  const tx = {
    financialAccount: {
      create: async ({ data }) => {
        calls.push(['account.create', data]);
        return { id: 'account-1', ...data };
      }
    },
    financialAuditEvent: {
      create: async ({ data }) => {
        calls.push(['audit.create', data]);
        return { id: 'audit-1' };
      }
    }
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };

  const account = await createFinancialAccount(prismaClient, {
    name: ' Bancolombia ',
    type: 'bank',
    openingBalance: '1250000',
    openingBalanceDate: '2026-01-01'
  }, { id: 'user-1' });

  assert.equal(account.name, 'Bancolombia');
  assert.equal(account.type, 'BANK');
  assert.equal(account.openingBalance, 1250000);
  assert.equal(calls.find(([name]) => name === 'audit.create')[1].actorId, 'user-1');
});

test('listFinancialAccounts calculates posted actual balances only', async () => {
  const prismaClient = {
    financialAccount: {
      findMany: async () => [{
        id: 'account-1',
        name: 'Caja',
        type: 'CASH',
        currency: 'COP',
        openingBalance: 1000,
        openingBalanceDate: new Date('2026-01-01T12:00:00.000Z'),
        isActive: true,
        records: [
          { type: 'INCOME', amount: 500 },
          { type: 'EXPENSE', amount: 200 }
        ]
      }]
    }
  };

  const accounts = await listFinancialAccounts(prismaClient);
  assert.equal(accounts[0].balance, 1300);
});

test('createFinancialAccount rejects unsupported account types', async () => {
  await assert.rejects(
    createFinancialAccount({ $transaction: async () => null }, {
      name: 'Tarjeta',
      type: 'CREDIT',
      openingBalanceDate: '2026-01-01'
    }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_TYPE_INVALID'
  );
});
