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
// ella debe permitir y generar independiente de las fechas»). El período pertenece al mes en que termina, que es
// el mes en que se paga: Mariceth empezó el 14 de octubre; su tramo del 14 de octubre al 13 de noviembre es el de noviembre.
const MARICETH = { contractStart: '2026-10-14', contractEnd: '2027-02-09' };
const primero = { start: '2026-10-14', end: '2026-11-13' };

test('sin historial, el primer período empieza con el contrato y pertenece al mes en que termina', () => {
  const nov = periods.nextPayrollPeriod({ year: 2026, month: 11, ...MARICETH, periods: [] });
  assert.deepEqual([nov.start, nov.end], ['2026-10-14', '2026-11-13']);
  // Octubre no tiene período de Mariceth: su primer tramo termina en noviembre. No es un problema, es que aún no empezaba.
  assert.equal(periods.nextPayrollPeriod({ year: 2026, month: 10, ...MARICETH, periods: [] }).done, true);
  // Francys, del 26: generar noviembre prepara el 26 de octubre → 25 de noviembre, completo.
  const francys = periods.nextPayrollPeriod({ year: 2026, month: 11, contractStart: '2026-10-26', contractEnd: '2026-11-25', periods: [] });
  assert.deepEqual([francys.start, francys.end], ['2026-10-26', '2026-11-25']);
});

test('con historial, el siguiente período continúa donde terminó el anterior: 14 → 13, no 1 → 30', () => {
  const dic = periods.nextPayrollPeriod({ year: 2026, month: 12, ...MARICETH, periods: [primero] });
  assert.deepEqual([dic.start, dic.end], ['2026-11-14', '2026-12-13']);
  assert.equal(dic.problem, undefined);
  // Generar noviembre otra vez pide el mismo tramo ya liquidado: el servicio lo devuelve sin duplicarlo.
  const nov = periods.nextPayrollPeriod({ year: 2026, month: 11, ...MARICETH, periods: [primero] });
  assert.deepEqual([nov.start, nov.end], ['2026-10-14', '2026-11-13']);
  assert.match(nov.problem, /Ya hay días de este período/);
});

test('un contrato de mes calendario sigue generando del 1 al último día', () => {
  const r = periods.nextPayrollPeriod({ year: 2026, month: 11, contractStart: '2026-01-01', contractEnd: null,
    periods: [{ start: '2026-10-01', end: '2026-10-31' }] });
  assert.deepEqual([r.start, r.end], ['2026-11-01', '2026-11-30']);
  // Y el primer tramo parcial de quien entró a mitad de mes no tuerce los siguientes: manda dónde terminó el último.
  const r2 = periods.nextPayrollPeriod({ year: 2026, month: 10, contractStart: '2026-09-03', contractEnd: null,
    periods: [{ start: '2026-09-03', end: '2026-09-30' }] });
  assert.deepEqual([r2.start, r2.end], ['2026-10-01', '2026-10-31']);
  // Enero continúa diciembre sin perder el año.
  const ene = periods.nextPayrollPeriod({ year: 2027, month: 1, contractStart: '2026-01-01', contractEnd: null,
    periods: [{ start: '2026-12-01', end: '2026-12-31' }] });
  assert.deepEqual([ene.start, ene.end], ['2027-01-01', '2027-01-31']);
});

test('lo que no se sabe se dice, nunca se inventa: solapes y contrato que no cubre; lo ya terminado no es un problema', () => {
  // Volver a pedir noviembre cuando diciembre ya existe: ese tramo ya está liquidado y se dice.
  const solapado = periods.nextPayrollPeriod({ year: 2026, month: 11, ...MARICETH,
    periods: [primero, { start: '2026-11-14', end: '2026-12-13' }] });
  assert.match(solapado.problem, /Ya hay días de este período \(del 14 de octubre al 13 de noviembre\)/);

  // Enero 14 → febrero 13 se pasa del fin del contrato (9 de febrero): el último tramo se define a mano.
  const final = periods.nextPayrollPeriod({ year: 2027, month: 2, ...MARICETH,
    periods: [{ start: '2026-12-14', end: '2027-01-13' }] });
  assert.match(final.problem, /cubre solo una parte del período \(del 14 de enero al 13 de febrero\)/);
  assert.match(final.problem, /Períodos e historial/);

  // Un contrato de un solo ciclo ya liquidado no pide nada más ni se queja.
  const cerrado = periods.nextPayrollPeriod({ year: 2026, month: 11, contractStart: '2026-10-14', contractEnd: '2026-11-13', periods: [primero] });
  assert.equal(cerrado.done, true);
  assert.deepEqual([cerrado.start, cerrado.end], ['2026-10-14', '2026-11-13'], 'lleva el tramo para que el servicio devuelva el existente');
});

test('un ancla a fin de mes no deja días sueltos entre períodos', () => {
  const feb = periods.nextPayrollPeriod({ year: 2026, month: 2, contractStart: '2026-01-31', contractEnd: null, periods: [] });
  assert.deepEqual([feb.start, feb.end], ['2026-01-31', '2026-02-27']);
  const mar = periods.nextPayrollPeriod({ year: 2026, month: 3, contractStart: '2026-01-31', contractEnd: null, periods: [feb] });
  assert.equal(mar.start, '2026-02-28', 'empieza el día siguiente al anterior');
  assert.equal(mar.end, '2026-03-27');
});

