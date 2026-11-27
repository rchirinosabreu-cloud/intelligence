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
    payrollContract: {
      findMany: async (args) => {
        contractQuery = args;
        return [{
          id: 'contract-1',
          userId: null,
          startDate: new Date('2026-01-01'),
          baseSalary: 3000000,
          socialSecurity: 0,
          collaborator: { displayName: 'Kamila del Toro' }
        }];
      }
    },
    payrollTransaction: {
      findMany: async () => [],
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
  // Solo los contratos de la plataforma: los repetidos de las cargas del Excel nunca se liquidan.
  assert.deepEqual(contractQuery.where.AND[1], { importBatchId: null });
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
    financialAccount: { findUnique: async () => ({ id: 'account-1', isActive: true, currency: 'COP' }) },
    payrollPayment: {
      findMany: async () => [],
      create: async (args) => {
        calls.push(['payment.create', args]);
        return { ...args.data };
      }
    },
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
  // Desde el 30 de septiembre de 2026 el egreso cuelga del pago, no de la liquidación.
  assert.equal(calls.find(([name]) => name === 'payment.create')[1].data.financialRecordId, 'record-1');
  assert.equal(calls.find(([name]) => name === 'transaction.update')[1].data.financialRecordId, undefined);
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

test('generar crea el último tramo corto del contrato como borrador con valor proporcional (Elisa, 27 de noviembre de 2026)', async () => {
  // Iba del 16 al 15; el contrato terminó el 31 de octubre para pasar a mes calendario. Antes «Generar» no creaba nada.
  const september = { id: 'p-sep', contractId: 'c-1', month: 9, year: 2026, periodKey: 'MONTHLY', serviceStart: new Date('2026-09-16T12:00:00Z'), serviceEnd: new Date('2026-10-15T12:00:00Z'), voidedAt: null };
  const upserts = [];
  let rows = [september];
  const tx = {
    financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
    payrollContract: { findMany: async () => [{ id: 'c-1', userId: null, startDate: new Date('2026-09-16T12:00:00Z'), endDate: new Date('2026-10-31T12:00:00Z'), baseSalary: 1000000, socialSecurity: 0, collaborator: { displayName: 'Persona de prueba' } }] },
    payrollTransaction: {
      findMany: async ({ where }) => (where.month ? rows.filter(row => row.month === where.month && row.year === where.year) : rows),
      upsert: async (args) => { upserts.push(args); const row = { id: `p-${upserts.length}`, ...args.create }; rows = [...rows, row]; return row; }
    },
    financialAuditEvent: { create: async () => ({}), findMany: async () => [] }
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const result = await generatePayrollPeriod(db, { year: 2026, month: 10 }, { id: 'u-1' });
  assert.equal(result.createdCount, 1);
  assert.deepEqual(result.requiresPeriodReview, []);
  const created = upserts[0].create;
  assert.deepEqual([created.serviceStart.toISOString().slice(0, 10), created.serviceEnd.toISOString().slice(0, 10)], ['2026-10-16', '2026-10-31']);
  assert.equal(created.netAmount, 516129, '16 días de 31 sobre el mensual');
  assert.equal(created.status, 'DRAFT');
  assert.notEqual(created.periodKey, 'MONTHLY', 'un tramo corto no es el mes');
  assert.deepEqual(created.periodDetails.lastTranche, { cycleStart: '2026-10-16', cycleEnd: '2026-11-15', days: 16, cycleDays: 31, monthlyBase: 1000000, monthlySecurity: 0 });
  // Volver a generar devuelve el mismo tramo; no crea otro.
  const again = await generatePayrollPeriod(db, { year: 2026, month: 10 }, { id: 'u-1' });
  assert.equal(again.createdCount, 0);
  assert.equal(again.existingCount, 1);
});
