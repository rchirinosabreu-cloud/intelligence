import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARGIN_FLOOR,
  monthlyIncomeStatement,
  incomeStatementReadings
} from '../src/lib/incomeStatement.js';

// Septiembre de 2026, tal como está en producción: la pantalla lo dibujaba en rojo
// por $15,4 millones y nunca fue un mes malo — fueron $25,3 millones prestados a dos
// personas, que siguen en cartera por cobrar.
const SEPTIEMBRE = {
  year: 2026, month: 9,
  income: 44800129, expense: 60248034,
  loansGranted: 25323150, loanRepayments: 0
};
const OCTUBRE = {
  year: 2026, month: 10,
  income: 48981917, expense: 33987127,
  loansGranted: 218146, loanRepayments: 0
};

test('un préstamo otorgado no es gasto: septiembre deja de estar en rojo', () => {
  const [sept] = monthlyIncomeStatement({ months: [SEPTIEMBRE], today: new Date('2026-11-12T12:00:00Z') });

  // Lo que dibujaba la gráfica vieja.
  assert.equal(sept.netFlow, 44800129 - 60248034);
  assert.ok(sept.netFlow < 0, 'el flujo bruto sí es negativo');

  // Lo que de verdad pasó al operar.
  assert.equal(sept.operatingExpense, 60248034 - 25323150);
  assert.equal(sept.operatingMargin, 9875245);
  assert.ok(sept.operatingMargin > 0, 'operando, septiembre ganó');
  assert.equal(sept.loansGranted, 25323150);
});

test('un reintegro de préstamo no es venta', () => {
  const [mes] = monthlyIncomeStatement({
    months: [{ year: 2026, month: 6, income: 10000000, expense: 4000000, loansGranted: 0, loanRepayments: 3000000 }],
    today: new Date('2026-11-12T12:00:00Z')
  });
  assert.equal(mes.operatingIncome, 7000000);
  assert.equal(mes.operatingMargin, 3000000);
  assert.equal(mes.loanRepayments, 3000000);
});

test('el margen se mide contra el piso del plan, y septiembre no lo alcanza', () => {
  assert.equal(MARGIN_FLOOR, 0.286);
  const [sept] = monthlyIncomeStatement({ months: [SEPTIEMBRE], today: new Date('2026-11-12T12:00:00Z') });
  // 9.875.245 sobre 44.800.129 = 22,0 %.
  assert.ok(Math.abs(sept.marginRate - 0.2204) < 0.001);
  assert.equal(sept.belowFloor, true);

  const [oct] = monthlyIncomeStatement({ months: [OCTUBRE], today: new Date('2026-11-12T12:00:00Z') });
  assert.ok(oct.marginRate > MARGIN_FLOOR, 'octubre sí pasa el piso');
  assert.equal(oct.belowFloor, false);
});

test('el mes en curso se marca y dice por qué día va', () => {
  const meses = monthlyIncomeStatement({
    months: [OCTUBRE, { year: 2026, month: 11, income: 12058315, expense: 8567250, loansGranted: 0, loanRepayments: 0 }],
    today: new Date('2026-11-12T17:00:00Z') // 12 de noviembre, mediodía en Bogotá
  });
  const [oct, nov] = meses;
  assert.equal(oct.inProgress, false);
  assert.equal(nov.inProgress, true);
  assert.equal(nov.daysElapsed, 12);
  assert.equal(nov.daysInMonth, 30);
  // Un mes a medias no se compara con meses cerrados: no entra en los totales del periodo.
  assert.equal(nov.comparable, false);
  assert.equal(oct.comparable, true);
});

test('sin ingreso operativo el porcentaje no existe, nunca es cero', () => {
  const [mes] = monthlyIncomeStatement({
    months: [{ year: 2026, month: 1, income: 0, expense: 500000, loansGranted: 0, loanRepayments: 0 }],
    today: new Date('2026-11-12T12:00:00Z')
  });
  assert.equal(mes.marginRate, null);
  assert.equal(mes.belowFloor, false, 'sin ingreso no se afirma que incumple el piso');
});

test('la lectura dice el hecho y su causa, nunca un adjetivo', () => {
  const meses = monthlyIncomeStatement({
    months: [SEPTIEMBRE, OCTUBRE, { year: 2026, month: 11, income: 12058315, expense: 8567250, loansGranted: 0, loanRepayments: 0 }],
    today: new Date('2026-11-12T17:00:00Z')
  });
  const lecturas = incomeStatementReadings(meses);

  assert.ok(lecturas.length >= 1 && lecturas.length <= 4, 'entre una y cuatro frases');
  const texto = lecturas.map((l) => l.text).join(' | ');
  assert.match(texto, /noviembre/i, 'avisa que el mes en curso va a medias');
  assert.match(texto, /25\.323\.150|25,3/, 'nombra los préstamos que torcían el mes');
  assert.doesNotMatch(texto, /excelente|preocupante|mal\b|cr[ií]tico/i, 'sin juicios');
  for (const l of lecturas) assert.ok(l.kind && l.text, 'cada lectura dice de qué tipo es');
});
