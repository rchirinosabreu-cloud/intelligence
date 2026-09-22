import test from 'node:test';
import assert from 'node:assert/strict';
import { updateFinancialRecord, voidFinancialRecord } from '../src/services/financialRecordService.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

const manualRecord = (overrides = {}) => ({
  id: 'record-1', amount: 1000, type: 'INCOME', category: 'SERVICIO', section: 'REVENUE',
  date: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9,
  scenario: 'ACTUAL', status: 'POSTED', origin: 'MANUAL', accountId: 'account-1',
  receivablePayment: null, payrollTransaction: null, bankMatches: [], ...overrides
});

// In-memory Prisma boundary: no database or credentials are loaded by this suite.
const ledgerFixture = (record, { closedMonth } = {}) => {
  const writes = [];
  const reads = [];
  const tx = {
    financialRecord: {
      findUnique: async (args) => { reads.push(args); return record; },
      update: async ({ data }) => { writes.push(data); return { ...record, ...data }; }
    },
    financialPeriod: {
      findUnique: async ({ where }) => ({ status: where.year_month.month === closedMonth ? 'CLOSED' : 'OPEN' })
    },
    financialAuditEvent: { create: async ({ data }) => { writes.push(data); return data; } }
  };
  return { writes, reads, client: { $transaction: async (callback) => callback(tx) } };
};

// Negarse no basta: el motivo tiene que nombrar dónde sí se puede corregir,
// o quien lo lee se queda sin salida (Rodny, 22 de septiembre de 2026).
for (const [label, relations, wayOut] of [
  ['receivable payment', { receivablePayment: { id: 'payment-1' } }, /Cartera[\s\S]*«Revertir»/],
  ['payroll payment', { payrollTransaction: { id: 'payroll-1' } }, /Se corrige desde Nómina/],
  ['approved bank match', { bankMatches: [{ id: 'match-1', status: 'APPROVED' }] }, /deshacer esa conciliación/]
]) {
  for (const operation of ['update', 'void']) {
    test(`${operation} cannot disconnect a ${label} through generic ledger CRUD`, async () => {
      const fixture = ledgerFixture(manualRecord(relations));
      const action = operation === 'update'
        ? updateFinancialRecord(fixture.client, 'record-1', { amount: 2000 }, { id: 'admin-1' })
        : voidFinancialRecord(fixture.client, 'record-1', 'Duplicado', { id: 'admin-1' });
      await assert.rejects(action, (error) =>
        error.code === 'FINANCIAL_RECORD_LINKED' && error.statusCode === 409 && wayOut.test(error.message));
      assert.equal(fixture.writes.length, 0);
      assert.ok(fixture.reads[0].include.receivablePayment);
      assert.ok(fixture.reads[0].include.payrollTransaction);
      assert.deepEqual(fixture.reads[0].include.bankMatches.where, { status: 'APPROVED' });
    });
  }
}

for (const operation of ['update', 'void']) {
  test(`${operation} refuses SYSTEM records even if an old source relation is missing`, async () => {
    const fixture = ledgerFixture(manualRecord({ origin: 'SYSTEM' }));
    const action = operation === 'update'
      ? updateFinancialRecord(fixture.client, 'record-1', { description: 'Alterado' }, { id: 'admin-1' })
      : voidFinancialRecord(fixture.client, 'record-1', 'Duplicado', { id: 'admin-1' });
    await assert.rejects(action, (error) => error.code === 'FINANCIAL_RECORD_SYSTEM_MANAGED' && error.statusCode === 409);
    assert.equal(fixture.writes.length, 0);
  });
}

test('a proposed or rejected bank candidate does not freeze an independent manual record', async () => {
  for (const status of ['PROPOSED', 'REJECTED']) {
    const fixture = ledgerFixture(manualRecord({ bankMatches: [{ id: 'match-1', status }] }));
    const result = await updateFinancialRecord(fixture.client, 'record-1', { amount: 1500 }, { id: 'user-1' });
    assert.equal(result.amount, 1500);
    assert.equal(fixture.writes.at(-1).action, 'UPDATE');
  }
});

test('independent imported records remain editable without losing import provenance', async () => {
  const fixture = ledgerFixture(manualRecord({ origin: 'IMPORT', importBatchId: 'batch-1' }));
  const result = await updateFinancialRecord(fixture.client, 'record-1', { amount: 1500 }, { id: 'user-1' });
  assert.equal(result.amount, 1500);
  assert.equal(result.origin, 'IMPORT');
  assert.equal(result.importBatchId, 'batch-1');
});

test('a forged import origin cannot remove the required bank account from a posted manual entry', async () => {
  const fixture = ledgerFixture(manualRecord());
  await assert.rejects(
    updateFinancialRecord(fixture.client, 'record-1', { accountId: null, origin: 'IMPORT' }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_RECORD_ACCOUNT_REQUIRED'
  );
  assert.equal(fixture.writes.length, 0);
});

test('moving an independent entry into a closed month is refused without writes', async () => {
  const fixture = ledgerFixture(manualRecord(), { closedMonth: 8 });
  await assert.rejects(
    updateFinancialRecord(fixture.client, 'record-1', { date: '2026-08-31' }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_PERIOD_CLOSED'
  );
  assert.equal(fixture.writes.length, 0);
});

for (const operation of ['update', 'void']) {
  test(`${operation} uses serializable isolation and reports a concurrent change as a retriable conflict`, async () => {
    let options;
    const client = {
      $transaction: async (_callback, receivedOptions) => {
        options = receivedOptions;
        throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
      }
    };
    const action = operation === 'update'
      ? updateFinancialRecord(client, 'record-1', { amount: 2000 }, { id: 'admin-1' })
      : voidFinancialRecord(client, 'record-1', 'Duplicado', { id: 'admin-1' });
    await assert.rejects(action, (error) => error.code === 'FINANCIAL_RECORD_CONFLICT' && error.statusCode === 409);
    assert.equal(options.isolationLevel, 'Serializable');
  });

  test(`${operation} preserves unknown persistence errors rather than pretending success`, async () => {
    const failure = new Error('Storage unavailable');
    const client = { $transaction: async () => { throw failure; } };
    const action = operation === 'update'
      ? updateFinancialRecord(client, 'record-1', { amount: 2000 }, { id: 'admin-1' })
      : voidFinancialRecord(client, 'record-1', 'Duplicado', { id: 'admin-1' });
    await assert.rejects(action, (error) => error === failure);
  });
}

test('account balances exclude earlier accounting days but include all movements on the opening day', async () => {
  let query;
  const client = {
    financialAccount: {
      findMany: async (args) => {
        query = args;
        return [
          {
            id: 'september', openingBalance: 1000, openingBalanceDate: new Date('2026-09-01T12:00:00Z'),
            records: [
              { type: 'INCOME', amount: 9000, date: new Date('2026-08-31T23:59:59Z') },
              { type: 'EXPENSE', amount: 3000, date: new Date('2026-08-01T12:00:00Z') },
              { type: 'INCOME', amount: 100, date: new Date('2026-09-01T00:00:00Z') },
              { type: 'EXPENSE', amount: 25, date: new Date('2026-09-01T12:00:00Z') },
              { type: 'INCOME', amount: 50, date: new Date('2026-09-02T12:00:00Z') }
            ]
          },
          {
            id: 'august', openingBalance: 200, openingBalanceDate: new Date('2026-08-01T12:00:00Z'),
            records: [{ type: 'INCOME', amount: 100, date: new Date('2026-08-15T12:00:00Z') }]
          }
        ];
      }
    }
  };
  const accounts = await listFinancialAccounts(client);
  assert.equal(accounts[0].balance, 1125);
  assert.equal(accounts[1].balance, 300);
  assert.deepEqual(query.include.records.where, { status: 'POSTED', scenario: 'ACTUAL' });
  assert.equal(query.include.records.select.date, true);
});
