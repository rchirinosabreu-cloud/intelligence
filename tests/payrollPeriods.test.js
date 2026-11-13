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

// El ciclo de nómina sale del contrato, no del calendario (Elisa, 13 de noviembre de 2026: «si es del 14 al 13 …
// ella debe permitir y generar independiente de las fechas»). Mariceth empezó el 14 de octubre; su mes va del 14 al 13.
const MARICETH = { contractStart: '2026-10-14', contractEnd: '2027-02-09' };
const octubre = { start: '2026-10-14', end: '2026-11-13' };

test('sin historial, el primer período empieza con el contrato y dura un mes', () => {
  const r = periods.nextPayrollPeriod({ year: 2026, month: 10, ...MARICETH, periods: [] });
  assert.deepEqual([r.start, r.end], ['2026-10-14', '2026-11-13']);
});

test('con historial, el siguiente período continúa donde terminó el anterior: 14 → 13, no 1 → 30', () => {
  const r = periods.nextPayrollPeriod({ year: 2026, month: 11, ...MARICETH, periods: [octubre] });
  assert.deepEqual([r.start, r.end], ['2026-11-14', '2026-12-13']);
  assert.equal(r.problem, undefined);
});

test('un contrato de mes calendario sigue generando del 1 al último día', () => {
  const r = periods.nextPayrollPeriod({ year: 2026, month: 11, contractStart: '2026-01-01', contractEnd: null,
    periods: [{ start: '2026-10-01', end: '2026-10-31' }] });
  assert.deepEqual([r.start, r.end], ['2026-11-01', '2026-11-30']);
  // Y el primer tramo parcial de quien entró a mitad de mes no tuerce los siguientes: manda dónde terminó el último.
  const r2 = periods.nextPayrollPeriod({ year: 2026, month: 10, contractStart: '2026-09-03', contractEnd: null,
    periods: [{ start: '2026-09-03', end: '2026-09-30' }] });
  assert.deepEqual([r2.start, r2.end], ['2026-10-01', '2026-10-31']);
});

test('lo que no se sabe se dice, nunca se inventa: solapes y contrato que no cubre; lo ya terminado no es un problema', () => {
  const solapado = periods.nextPayrollPeriod({ year: 2026, month: 11, ...MARICETH,
    periods: [octubre, { start: '2026-11-20', end: '2026-11-30' }] });
  assert.match(solapado.problem, /Ya hay días de este período/);

  // Enero 14 → febrero 13 se pasa del fin del contrato (9 de febrero): el último tramo se define a mano.
  const final = periods.nextPayrollPeriod({ year: 2027, month: 1, ...MARICETH,
    periods: [{ start: '2026-12-14', end: '2027-01-13' }] });
  assert.match(final.problem, /cubre solo una parte del período \(del 14 de enero al 13 de febrero\)/);
  assert.match(final.problem, /Períodos e historial/);

  // Un contrato de un solo ciclo ya liquidado no pide nada más ni se queja.
  const cerrado = periods.nextPayrollPeriod({ year: 2026, month: 11, contractStart: '2026-10-14', contractEnd: '2026-11-13', periods: [octubre] });
  assert.deepEqual(cerrado, { done: true });
});

test('un ancla a fin de mes no deja días sueltos entre períodos', () => {
  const ene = periods.nextPayrollPeriod({ year: 2026, month: 1, contractStart: '2026-01-31', contractEnd: null, periods: [] });
  assert.deepEqual([ene.start, ene.end], ['2026-01-31', '2026-02-27']);
  const feb = periods.nextPayrollPeriod({ year: 2026, month: 2, contractStart: '2026-01-31', contractEnd: null, periods: [ene] });
  assert.equal(feb.start, '2026-02-28', 'empieza el día siguiente al anterior');
  assert.equal(feb.end, '2026-03-27');
});
