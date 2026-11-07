import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = name => readFileSync(new URL(`../src/components/modules/${name}`, import.meta.url), 'utf8');
test('el detalle de cuenta y la corrección nacen en las pantallas existentes', () => {
  assert.match(source('financial/FinancialLedger.jsx'), /AccountBalanceDialog/);
  assert.match(source('financial/PayrollPayments.jsx'), /PaymentCorrectionDialog/);
  assert.match(source('financial/PayablesTab.jsx'), /PaymentCorrectionDialog/);
  const dialog = source('financial/PaymentCorrectionDialog.jsx');
  assert.match(dialog, /expectedRevision/); assert.match(dialog, /Revisar cambios/);
  assert.match(dialog, /Cargar versión actual/);
  const dashboard = source('FinancialDashboard.jsx');
  assert.ok(dashboard.indexOf('<FinancialFilters') > dashboard.indexOf('data-financial-kpis'), 'los filtros se presentan debajo de los indicadores');
});
