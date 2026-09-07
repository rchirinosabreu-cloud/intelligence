import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger = fs.readFileSync(new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url), 'utf8');
const bank = fs.readFileSync(new URL('../src/components/modules/financial/BankReconciliationPanel.jsx', import.meta.url), 'utf8');

test('ledger requests explicit pages and exposes navigation instead of silently limiting records', () => {
  assert.match(ledger, /page: String\(page\)/);
  assert.match(ledger, /pageSize: String\(PAGE_SIZE\)/);
  assert.match(ledger, /queryKey: \['financial-records', selectedYear, filters, page\]/);
  assert.match(ledger, /aria-label="Paginación de movimientos"/);
  assert.match(ledger, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(ledger, /setPage\(\(current\) => Math\.min\(pageCount, current \+ 1\)\)/);
  assert.match(ledger, /Ingresos de esta página/);
  assert.match(ledger, /Egresos de esta página/);
});

test('ledger uses the shared permission policy and invalidates all related financial views', () => {
  assert.match(ledger, /hasFinancialPermission\(currentUser, 'write'\)/);
  assert.match(ledger, /hasFinancialPermission\(currentUser, 'approve'\)/);
  assert.match(ledger, /hasFinancialPermission\(currentUser, 'admin'\)/);
  assert.doesNotMatch(ledger, /currentUser\.hasFinancialAccess === true/);
  assert.match(ledger, /invalidateFinancialQueries\(queryClient\)/);
});

test('bank reconciliation paginates the full result and resets after changing year', () => {
  assert.doesNotMatch(bank, /transactions\.slice\(0,\s*80\)/);
  assert.match(bank, /transactions\.slice\(\(page - 1\) \* PAGE_SIZE, page \* PAGE_SIZE\)/);
  assert.match(bank, /aria-label="Paginación de conciliación"/);
  assert.match(bank, /setPage\(1\)[\s\S]*\[selectedYear\]/);
  assert.match(bank, /visibleTransactions\.map/);
});

test('bank errors and insufficient statements cannot produce a successful continuity claim', () => {
  assert.match(bank, /error[\s\S]*No fue posible cargar la conciliación bancaria/);
  assert.match(bank, /!hasComparableStatements/);
  assert.match(bank, /Aún no hay extractos para comprobar la continuidad/);
  assert.match(bank, /Se necesitan al menos dos extractos de una misma cuenta/);
  assert.match(bank, /No confirma que estén todos los meses ni que los movimientos estén conciliados/);
});

test('approved bank matches stay visibly reconciled and cannot be approved again', () => {
  assert.match(bank, /transaction\.status === 'MATCHED'/);
  assert.match(bank, /item\.status === 'APPROVED'/);
  assert.match(bank, /Conciliado/);
  assert.match(bank, /!isMatched && match && canApprove/);
  assert.match(bank, /invalidateFinancialQueries\(queryClient\)/);
});
