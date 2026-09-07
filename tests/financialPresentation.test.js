import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path = new URL('../src/utils/financialReceivables.js', import.meta.url);
const subject = fs.existsSync(path) ? await import(path.href) : {};
test('client groups retain partial and promised outstanding balances and stable IDs', () => {
  assert.equal(typeof subject.groupFinancialReceivables, 'function');
  const rows = subject.groupFinancialReceivables([
    { id: 'a', clientId: '1', clientName: 'Nombre repetido', status: 'DEBE', amount: 1000, outstanding: 600, dueDate: '2026-09-01' },
    { id: 'b', clientId: '1', clientName: 'Nombre repetido', status: 'PROMESADO', amount: 300, outstanding: 200, dueDate: null },
    { id: 'c', clientId: '2', clientName: 'Nombre repetido', status: 'DEBE', amount: 50, outstanding: 50, dueDate: '2026-10-01' }
  ], '2026-09-07');
  assert.equal(rows.length, 2); assert.equal(rows[0].totalOutstanding, 800);
  assert.equal(rows[0].overdue, 600); assert.equal(rows[0].unknownDue, 200);
  assert.equal(rows[1].overdue, 0);
});
test('civil periods do not drift to previous month in Bogota and invalid dates have a fallback', () => {
  assert.equal(typeof subject.formatFinancialPeriod, 'function');
  assert.match(subject.formatFinancialPeriod('2026-09-01T00:00:00Z'), /septiembre/);
  assert.equal(subject.formatFinancialPeriod(null), 'Sin periodo');
  assert.equal(subject.formatFinancialPeriod('invalid'), 'Sin periodo');
});
test('due today is not overdue and paid rows never show an overdue badge', () => {
  assert.equal(typeof subject.financialDebtStatus, 'function');
  assert.equal(subject.financialDebtStatus({ outstanding: 100, dueDate: '2026-09-07' }, '2026-09-07'), 'Por vencer');
  assert.equal(subject.financialDebtStatus({ outstanding: 100, dueDate: null }, '2026-09-07'), 'Sin vencimiento');
  assert.equal(subject.financialDebtStatus({ outstanding: 0, dueDate: '2026-09-01' }, '2026-09-07'), 'Sin saldo pendiente');
});

test('legacy paid balances remain visible for review without adding them to confirmed debt', () => {
  const debt = { id: 'legacy', clientId: '1', status: 'PAGADO', amount: 1000, outstanding: null, balanceReviewRequired: true };
  const [row] = subject.groupFinancialReceivables([debt]);
  assert.equal(row.totalOutstanding, 0);
  assert.equal(row.reviewCount, 1);
  assert.equal(row.debts.length, 1);
  assert.equal(subject.financialDebtStatus(debt), 'Saldo por verificar');
});
test('financial mutations invalidate every affected view using the shared helper', async () => {
  const location = new URL('../src/utils/financialQueryCache.js', import.meta.url);
  const module = fs.existsSync(location) ? await import(location.href) : {};
  assert.equal(typeof module.invalidateFinancialQueries, 'function');
  const keys = [];
  await module.invalidateFinancialQueries({ invalidateQueries: async ({queryKey}) => keys.push(queryKey[0]) });
  for (const key of ['financial-records','financial-accounts','financials-dashboard-data','financials-receivables-ledger','financials-client-reconciliation','bank-reconciliation','financial-integrity']) assert.ok(keys.includes(key), key);
});
