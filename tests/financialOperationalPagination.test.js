import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger = fs.readFileSync(new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url), 'utf8');
const bank = fs.readFileSync(new URL('../src/components/modules/financial/BankReconciliationPanel.jsx', import.meta.url), 'utf8');
const filterBar = fs.readFileSync(new URL('../src/components/modules/financial/FinancialFilters.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');

test('ledger requests explicit pages and exposes navigation instead of silently limiting records', () => {
  assert.match(ledger, /page: String\(page\)/);
  assert.match(ledger, /pageSize: String\(PAGE_SIZE\)/);
  assert.match(ledger, /queryKey: \['financial-records', selectedYear, filters, selectedAccountId, page\]/);
  assert.match(ledger, /aria-label="Paginación de movimientos"/);
  assert.match(ledger, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(ledger, /setPage\(\(current\) => Math\.min\(pageCount, current \+ 1\)\)/);
});

test('the ledger never repeats a figure the header already shows', () => {
  // Los indicadores de arriba obedecen los mismos filtros, y el pie de la tabla ya
  // dice cuántos movimientos hay: el libro no puede pintar esas cifras otra vez.
  assert.doesNotMatch(ledger, /Ingresos de la selección/);
  assert.doesNotMatch(ledger, /Egresos de la selección/);
  assert.doesNotMatch(ledger, /Movimientos de la selección/);
  assert.doesNotMatch(ledger, /de esta página/);
  assert.doesNotMatch(ledger, /(Ingresos|Egresos|Registros) con estos filtros/);
  assert.match(ledger, /Mostrando/);
});

test('with an account chosen, the ledger shows what only it knows', () => {
  // Lo que entró y salió por una cuenta concreta no está en ningún otro sitio:
  // los indicadores de arriba no reciben el filtro de cuenta.
  assert.match(ledger, /\{selectedAccount && \(/);
  assert.match(ledger, /Entró por \{selectedAccount\.name\}/);
  assert.match(ledger, /Salió por \{selectedAccount\.name\}/);
  // El total lo suma el servidor; la página solo es respaldo si la respuesta no lo trae.
  assert.match(ledger, /data\?\.totals \|\| records\.reduce/);
});

test('category and account narrow the ledger and reset the page', () => {
  // La categoría llega de la barra de filtros de arriba, con el resto.
  assert.match(ledger, /params\.set\('category', filters\.category\)/);
  assert.match(ledger, /params\.set\('accountId', selectedAccountId\)/);
  assert.match(ledger, /setPage\(1\); \}, \[selectedYear, filters, selectedAccountId\]/);
  assert.doesNotMatch(ledger, /<select\s/);
});

test('the account is chosen by pressing its card, and pressing it again releases it', () => {
  assert.match(ledger, /aria-pressed=\{isActive\}/);
  assert.match(ledger, /setSelectedAccountId\(\(current\) => \(current === account\.id \? '' : account\.id\)\)/);
  // El libro no puede quedar filtrado por una cuenta que ya no está en pantalla.
  assert.match(ledger, /!accounts\.some\(\(account\) => account\.id === selectedAccountId\)/);
  // El libro ya no tiene su propio desplegable de categoría ni de cuenta.
  assert.doesNotMatch(ledger, /aria-label="Cuenta de caja o banco"/);
  assert.doesNotMatch(ledger, /Todas las categorías/);
});

test('the category filter sits with the rest of the filters and reaches the indicators', () => {
  assert.match(filterBar, /aria-label="Categoría del movimiento"/);
  assert.match(filterBar, /FINANCIAL_CATEGORY_OPTIONS/);
  // Cartera y nómina no se clasifican por categoría: no se les pasa el filtro.
  assert.match(dashboard, /const dashboardQuery = useMemo/);
  assert.match(dashboard, /\/api\/financials\/dashboard\?\$\{dashboardQuery\}/);
  assert.match(dashboard, /receivables-ledger\?\$\{filterQuery\}/);
  assert.match(filterBar, /Cartera y nómina no se clasifican por categoría/);
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
