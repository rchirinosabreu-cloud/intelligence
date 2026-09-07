import test from 'node:test';
import assert from 'node:assert/strict';
import { persistFinancialImportPlan } from '../src/services/financialImportService.js';

const plan = () => ({ batch: { year: 2026 }, records: [], monthlySummaries: [], receivables: [], payrollPositions: [], payrollContracts: [] });
const fixture = ({ linkedRecords = 0, linkedDebts = 0 } = {}) => {
  const writes = [], reads = [];
  const tx = {
    financialRecord: {
      count: async (args) => { reads.push({ model: 'record', ...args }); return linkedRecords; },
      findMany: async () => [], deleteMany: async (args) => { writes.push({ model: 'record', ...args }); }
    },
    accountsReceivable: {
      count: async (args) => { reads.push({ model: 'receivable', ...args }); return linkedDebts; },
      findMany: async () => [], deleteMany: async (args) => { writes.push({ model: 'receivable', ...args }); }
    },
    financialMonthlySummary: { deleteMany: async () => { writes.push({ model: 'monthly' }); } },
    financialImportBatch: {
      updateMany: async () => { writes.push({ model: 'batch' }); },
      create: async () => { writes.push({ model: 'batch-new' }); return { id: 'batch-new' }; }
    },
    user: { findMany: async () => [] }
  };
  const client = { $transaction: async (callback, options) => { client.options = options; return callback(tx); } };
  return { client, reads, writes };
};

test('replacing an import refuses linked records before deleting or replacing anything', async () => {
  const { client, reads, writes } = fixture({ linkedRecords: 1 });
  await assert.rejects(persistFinancialImportPlan(client, plan()),
    (error) => error.code === 'FINANCIAL_IMPORT_LINKED_OPERATIONS' && error.statusCode === 409);
  assert.equal(writes.length, 0);
  assert.deepEqual(reads.find((read) => read.model === 'record').where, {
    year: 2026, importBatchId: { not: null }, OR: [
      { receivablePayment: { isNot: null } }, { payrollTransaction: { isNot: null } }, { bankMatches: { some: {} } }
    ]
  });
});

test('replacing an import preserves imported debt already connected to a payment', async () => {
  const { client, reads, writes } = fixture({ linkedDebts: 1 });
  await assert.rejects(persistFinancialImportPlan(client, plan()),
    (error) => error.code === 'FINANCIAL_IMPORT_LINKED_OPERATIONS' && error.statusCode === 409);
  assert.equal(writes.length, 0);
  assert.deepEqual(reads.find((read) => read.model === 'receivable').where, {
    year: 2026, importBatchId: { not: null }, payments: { some: {} }
  });
});

test('an unlinked replacement checks and writes in the same serializable transaction', async () => {
  const { client, writes } = fixture();
  const result = await persistFinancialImportPlan(client, plan());
  assert.equal(result.importBatchId, 'batch-new');
  assert.equal(client.options?.isolationLevel, 'Serializable');
  assert.equal(writes.some((write) => write.model === 'record'), true);
});

test('an import with concurrent payment or reconciliation returns a recoverable conflict', async () => {
  const failure = Object.assign(new Error('Write conflict'), { code: 'P2034' });
  await assert.rejects(persistFinancialImportPlan({ $transaction: async () => { throw failure; } }, plan()),
    (error) => error.code === 'FINANCIAL_IMPORT_CONFLICT' && error.statusCode === 409);
});

test('a non-replacing import does not issue destructive operations', async () => {
  const { client, reads, writes } = fixture({ linkedRecords: 1, linkedDebts: 1 });
  await persistFinancialImportPlan(client, plan(), { replaceExisting: false });
  assert.equal(reads.length, 0);
  assert.equal(writes.some((write) => ['record', 'receivable', 'monthly'].includes(write.model)), false);
});
