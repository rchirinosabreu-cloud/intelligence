import test from 'node:test';
import assert from 'node:assert/strict';
import * as periods from '../src/lib/payrollPeriods.js';

test('importe acordado del tramo conserva 750.000, sin tratarlo como salario mensual', () => {
  const result = periods.calculatePayrollPeriod({ start: '2026-10-16', end: '2026-10-31', mode: 'AGREED', baseSalary: '750000', socialSecurity: '9200' });
  assert.equal(result.days, 16);
  assert.equal(result.baseSalary, 750000);
  assert.equal(result.grossAmount, 759200);
});
test('tarifa por día usa fechas inclusivas reales, febrero bisiesto y centavos', () => {
  const result = periods.calculatePayrollPeriod({ start: '2028-02-28', end: '2028-03-01', mode: 'DAILY', baseSalary: '100.01', socialSecurity: '0.02' });
  assert.equal(result.days, 3);
  assert.equal(result.grossAmount, 300.09);
});
test('rechaza fechas inexistentes, rangos invertidos y valores inválidos', () => {
  for (const patch of [{ start: '2026-02-30' }, { end: '2026-10-01' }, { baseSalary: '-1' }, { baseSalary: '0.001' }, { mode: 'UNKNOWN' }]) {
    assert.throws(() => periods.calculatePayrollPeriod({ start: '2026-10-16', end: '2026-10-31', mode: 'AGREED', baseSalary: 750000, socialSecurity: 0, ...patch }));
  }
});
test('solapamiento incluye el día compartido y permite el día siguiente', () => {
  assert.equal(periods.payrollPeriodsOverlap('2026-09-16', '2026-10-15', '2026-10-15', '2026-10-31'), true);
  assert.equal(periods.payrollPeriodsOverlap('2026-09-16', '2026-10-15', '2026-10-16', '2026-10-31'), false);
});
