import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file = new URL('../src/services/financialClientStatementService.js', import.meta.url);
const subject = fs.existsSync(file) ? await import(file.href) : {};
const read = (...args) => { assert.equal(typeof subject.getClientFinancialStatement, 'function'); return subject.getClientFinancialStatement(...args); };
function database(items = []) {
  const calls = {};
  const tx = {
    client: { findUnique: async () => ({ id: 'client-a', name: 'Cliente A' }) },
    financialImportBatch: { findFirst: async () => ({ id: 'batch-a' }) },
    accountsReceivable: { findMany: async args => { calls.debts = args; return items; } },
    financialRecord: { findMany: async args => { calls.records = args; return items; } }
  };
  return { calls, tx, db: { $transaction: async (fn, options) => { calls.options = options; return fn(tx); } } };
}
const debt = { id: 'debt-a', clientId: 'client-a', period: new Date('2026-09-01T00:00:00Z'), amount: '1000.30', status: 'PROMESADO', payments: [{ id: 'p1', amount: '400.10', paidAt: '2026-09-07', financialRecord: { id: 'r1', clientId: 'client-a', amount: '400.10', type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL', isProjection: false, account: { id: 'bank', currency: 'COP' } }, account: { id: 'bank', name: 'Banco', currency: 'COP' } }] };

test('statement uses one client, year and active source snapshot; promises retain their balance', async () => {
  const { db, calls } = database([debt]);
  const result = await read(db, 'client-a', { year: '2026' });
  assert.deepEqual(calls.debts.where.AND.slice(0, 2), [{ clientId: 'client-a', year: 2026 }, { OR: [{ importBatchId: 'batch-a' }, { importBatchId: null }] }]);
  assert.equal(calls.options.isolationLevel, 'RepeatableRead');
  assert.equal(result.items[0].outstanding, 600.2);
  assert.equal(result.items[0].payments[0].financialRecord.id, 'r1');
  assert.equal(result.scope.kind, 'ANNUAL_OBLIGATIONS_CURRENT_BALANCE');
});
test('legacy paid and broken receipt links have unknown balance instead of invented success', async () => {
  const { db } = database([{ ...debt, status: 'PAGADO', payments: [] }, { ...debt, id: 'broken', payments: [{ ...debt.payments[0], financialRecord: null }] }]);
  const result = await read(db, 'client-a', { year: 2026 });
  assert.equal(result.items[0].outstanding, null);
  assert.equal(result.items[1].outstanding, null);
  assert.ok(result.items.every(item => item.balanceReviewRequired));
});
test('income section excludes projections, voids and other sources without pretending it is debt reduction', async () => {
  const { db, calls } = database([]);
  const result = await read(db, 'client-a', { year: 2026, section: 'income' });
  assert.deepEqual(calls.records.where.AND[2], { type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL', isProjection: false });
  assert.equal(result.scope.kind, 'ANNUAL_REGISTERED_INCOME');
});
test('statement pages retain all records through a cursor tied to the client, year and source batch', async () => {
  const { db, calls } = database(Array.from({length: 26}, (_, i) => ({ ...debt, id: `debt-${i}` })));
  const first = await read(db, 'client-a', { year: 2026 });
  assert.equal(first.items.length, 25);
  assert.ok(first.nextCursor);
  assert.equal(calls.debts.take, 26);
  await read(db, 'client-a', { year: 2026, cursor: first.nextCursor });
  assert.match(JSON.stringify(calls.debts.where), /debt-24/);
  await assert.rejects(() => read(db, 'client-b', { year: 2026, cursor: first.nextCursor }), error => error.statusCode === 400);
});
test('invalid filters and absent clients are explicit errors', async () => {
  const { db, tx } = database();
  for (const query of [{ year: '2026junk' }, { year: 2026, section: 'unknown' }, { year: 2026, cursor: 'garbage' }]) {
    await assert.rejects(() => read(db, 'client-a', query), error => error.statusCode === 400);
  }
  tx.client.findUnique = async () => null;
  await assert.rejects(() => read(db, 'absent', { year: 2026 }), error => error.statusCode === 404);
});

test('invalid application amounts do not become a partial or zero paid total', async () => {
  const { db } = database([{ ...debt, payments: [...debt.payments, { ...debt.payments[0], amount: 'invalid' }] }]);
  const result = await read(db, 'client-a', { year: 2026 });
  assert.equal(result.items[0].paidAmount, null);
  assert.equal(result.items[0].outstanding, null);
});

test('a projection, different client or missing/mismatched account is not a verified payment', async () => {
  for (const changes of [{ isProjection: true }, { clientId: 'another-client' }, { account: null }, { account: { id: 'other-bank', currency: 'COP' } }]) {
    const { db } = database([{ ...debt, payments: [{ ...debt.payments[0], financialRecord: { ...debt.payments[0].financialRecord, ...changes } }] }]);
    const result = await read(db, 'client-a', { year: 2026 });
    assert.equal(result.items[0].outstanding, null, JSON.stringify(changes));
  }
});

test('changing the active import invalidates the cursor instead of mixing pages', async () => {
  const { db, tx } = database(Array.from({ length: 26 }, (_, i) => ({ ...debt, id: `debt-${i}` })));
  const first = await read(db, 'client-a', { year: 2026 });
  tx.financialImportBatch.findFirst = async () => ({ id: 'new-batch' });
  await assert.rejects(() => read(db, 'client-a', { year: 2026, cursor: first.nextCursor }), error => error.statusCode === 409);
});
