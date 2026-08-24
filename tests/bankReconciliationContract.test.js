import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('el esquema mantiene extractos y coincidencias separados del libro contable', async () => {
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /model BankStatementImport \{/);
  assert.match(schema, /model BankTransaction \{/);
  assert.match(schema, /model BankReconciliationMatch \{/);
  assert.match(schema, /@@unique\(\[accountId, sourceHash\]\)/);
});

test('la API financiera expone revisión, importación y aprobación con permisos', async () => {
  const routes = await read('src/routes/api/financials.js');
  assert.match(routes, /bank-reconciliation/);
  assert.match(routes, /requireFinancialApproval/);
});

test('la conciliación bancaria muestra propuestas en español y no éxitos anticipados', async () => {
  const component = await read('src/components/modules/financial/BankReconciliationPanel.jsx');
  assert.match(component, /Conciliación bancaria/);
  assert.match(component, /Coincidencia propuesta/);
  assert.match(component, /Movimientos sin coincidencia/);
  assert.match(component, /Transferencias internas detectadas/);
  assert.match(component, /Continuidad de saldos/);
  assert.match(component, /Alta confianza/);
  assert.match(component, /Requiere verificación/);
  assert.match(component, /accountData\?\.accounts/);
  assert.doesNotMatch(component, /const \{ data: accounts = \[\] \} = useQuery/);
  assert.match(component, /onSuccess/);
  assert.match(component, /dark:/);
  assert.match(component, /sm:|lg:/);
});
