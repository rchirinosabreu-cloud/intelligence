import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinancialClientReconciliation, getFinancialReceivablesLedger, getFinancialDashboard } from '../src/controllers/financialController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } });
const client = { id: 'client-a', name: 'Cliente de prueba', slug: 'cliente-a' };
function database({ records = [], debts = [] } = {}) {
  const calls = {};
  return { calls, prismaClient: {
    financialImportBatch: { findFirst: async () => ({ id: 'batch-current', year: 2026 }) },
    financialRecord: { findMany: async args => { calls.records = args; return records; } },
    accountsReceivable: { findMany: async args => { calls.debts = args; return debts; } },
    client: { findMany: async () => [client] },
    payrollTransaction: { findMany: async () => [] }, payrollContract: { findMany: async () => [] }
  } };
}
test('Clientes uses posted actual records from the active import plus platform entries', async () => {
  const { prismaClient, calls } = database(); const res = response();
  await getFinancialClientReconciliation({ query: { year: '2026' } }, res, { prismaClient });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.records.where, { year: 2026, status: 'POSTED', scenario: 'ACTUAL', OR: [{ importBatchId: 'batch-current' }, { importBatchId: null }] });
  assert.ok(calls.debts.include.payments, 'client balances require the actual payment applications');
});
test('Clientes sums remaining balances including promises, not original face amounts', async () => {
  const { prismaClient } = database({ records: [{ clientId: client.id, client, type: 'INCOME', amount: 400 }], debts: [
    { id: 'a', clientId: client.id, client, status: 'DEBE', amount: 1000, payments: [{ amount: 400 }] },
    { id: 'b', clientId: client.id, client, status: 'PROMESADO', amount: 300, payments: [{ amount: 100 }] }
  ] }); const res = response();
  await getFinancialClientReconciliation({ query: { year: '2026' } }, res, { prismaClient });
  assert.equal(res.payload.clients[0].receivable, 800);
  assert.equal(res.payload.clients[0].income, 400);
});
test('Cartera preserves stable client IDs and includes platform SYSTEM entries in the same source scope', async () => {
  const { prismaClient, calls } = database({ debts: [{ id: 'a', clientId: client.id, client, status: 'PROMESADO', amount: 1000, payments: [{ amount: 400 }] }] }); const res = response();
  await getFinancialReceivablesLedger({ query: { year: '2026' } }, res, { prismaClient });
  assert.equal(res.payload.items[0].clientId, client.id);
  assert.deepEqual(calls.debts.where.OR, [{ importBatchId: 'batch-current' }, { importBatchId: null }]);
  assert.equal(res.payload.totals.outstandingTotal, 600);
});
test('Dashboard includes DEBE and PROMESADO with the same source scope as the ledger', async () => {
  const { prismaClient, calls } = database(); const res = response();
  await getFinancialDashboard({ query: { year: '2026' } }, res, { prismaClient });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.debts.where.status, { in: ['DEBE', 'PROMESADO'] });
  assert.deepEqual(calls.debts.where.OR, [{ importBatchId: 'batch-current' }, { importBatchId: null }]);
});

test('legacy paid rows without enough applied payments are explicit unknown balances, not new debts', async () => {
  const { prismaClient } = database({ debts: [{ id: 'legacy', clientId: client.id, client, status: 'PAGADO', amount: 1000, payments: [] }] });
  const res = response();
  await getFinancialReceivablesLedger({ query: { year: '2026' } }, res, { prismaClient });
  assert.equal(res.payload.items[0].balanceReviewRequired, true);
  assert.equal(res.payload.items[0].outstanding, null);
  assert.equal(res.payload.items[0].amount, 1000);
  assert.equal(res.payload.items[0].paidAmount, 0);
  assert.equal(res.payload.totals.outstandingTotal, 0);
  assert.equal(res.payload.totals.reviewCount, 1);
});
