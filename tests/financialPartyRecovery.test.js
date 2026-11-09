import test from 'node:test';
import assert from 'node:assert/strict';
import * as roles from '../src/lib/accountsPayable.js';
import * as periods from '../src/lib/payrollPeriods.js';
import { buildPartyRows } from '../src/lib/clientDirectoryRows.js';

test('una identidad conserva varias clasificaciones en el directorio', () => {
  const party = { id: 'p', name: 'Empresa', kind: 'ARRENDADOR', roles: ['ARRENDADOR', 'PROVEEDOR'], clientId: 'c' };
  const rows = buildPartyRows([{ clientId: 'c', name: 'Empresa', profile: {} }], [party]);
  assert.deepEqual(rows[0].roles, ['CLIENTE', 'ARRENDADOR', 'PROVEEDOR']);
  assert.equal(rows.length, 1);
});
test('clasificaciones legadas conservan su clase y eliminan repeticiones', () => {
  assert.equal(typeof roles.thirdPartyRoles, 'function');
  assert.deepEqual(roles.thirdPartyRoles({ kind: 'SOCIO' }), ['SOCIO']);
  assert.deepEqual(roles.thirdPartyRoles({ kind: 'SOCIO', roles: ['SOCIO', 'PROVEEDOR', 'SOCIO'] }), ['SOCIO', 'PROVEEDOR']);
});
test('el bloqueo de nómina identifica el borrador exacto sin acusar al período pagado', () => {
  assert.equal(typeof periods.unknownPayrollPeriods, 'function');
  const rows = [
    { id: 'sept', year: 2026, month: 9, status: 'DRAFT', netAmount: 1000000, payments: [], adjustments: [] },
    { id: 'oct', year: 2026, month: 10, serviceStart: '2026-09-16', serviceEnd: '2026-10-15', status: 'PAID' },
    { id: 'void', year: 2026, month: 8, voidedAt: '2026-11-09' },
  ];
  const blocked = periods.unknownPayrollPeriods(rows);
  assert.deepEqual(blocked.map(row => row.id), ['sept']);
  assert.equal(blocked[0].canReverse, true);
  assert.equal(periods.unknownPayrollPeriods([{ ...rows[0], financialRecordId: 'legacy' }])[0].canReverse, false);
});
