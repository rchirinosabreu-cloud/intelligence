/**
 * Estado de resultados mensual — punto 7 del frente 8 del plan «el negocio primero»
 * (10 de octubre de 2026): qué entró y qué salió de verdad **por operar**.
 *
 * La plataforma registra como dinero dos cosas que no son ni venta ni gasto: un
 * préstamo que sale (no se gastó, se prestó, y vuelve como cartera) y un reintegro
 * que entra (no es una venta). Mezclarlos es lo que puso septiembre de 2026 en rojo
 * por $15,4 millones en la pantalla, cuando operando había ganado $9,9: los $25,3
 * millones de diferencia fueron dos préstamos a personas, no un mal mes.
 *
 * El piso del margen lo fija el plan: 28,6 %, que es el que da costo × 1,4. El
 * indicador «margen operativo mensual» figura allí como «no se mide».
 */

const BOGOTA = 'America/Bogota';

/** Año, mes y día en reloj de Bogotá, el mismo criterio del resto de la plataforma. */
const bogotaParts = (date) => {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA })
    .format(date).split('-').map(Number);
  return { year, month, day };
};

const money = (value) => new Intl.NumberFormat('es-CO').format(Math.round(Number(value) || 0));
const num = (value) => Number(value) || 0;
const round = (value) => Math.round(value * 100) / 100;

export const MARGIN_FLOOR = 0.286;

/** Un porcentaje como lo escribe la plataforma: una decimal y coma, nunca punto. */
export const percentLabel = (rate) => `${(rate * 100).toFixed(1).replace('.', ',')} %`;

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Convierte los meses del flujo de caja en estado de resultados.
 * Cada mes entra con lo que ya suma el tablero (`income`, `expense`) más lo que la
 * plataforma ya sabe apartar (`loansGranted`, `loanRepayments`).
 */
export const monthlyIncomeStatement = ({ months = [], today = new Date() } = {}) => {
  const now = bogotaParts(today);

  return months.map((raw) => {
    const income = num(raw.income);
    const expense = num(raw.expense);
    const loansGranted = num(raw.loansGranted);
    const loanRepayments = num(raw.loanRepayments);

    const operatingIncome = round(income - loanRepayments);
    const operatingExpense = round(expense - loansGranted);
    const operatingMargin = round(operatingIncome - operatingExpense);

    // Sin ingreso operativo no hay porcentaje: cero diría que incumple el piso, y no se sabe.
    const marginRate = operatingIncome > 0 ? operatingMargin / operatingIncome : null;

    const inProgress = raw.year === now.year && raw.month === now.month;

    return {
      year: raw.year,
      month: raw.month,
      name: MONTH_NAMES[raw.month - 1],
      income,
      expense,
      netFlow: round(income - expense),
      loansGranted,
      loanRepayments,
      operatingIncome,
      operatingExpense,
      operatingMargin,
      marginRate,
      // El rótulo de la barra lo escribe la regla, no una función del gráfico: sin
      // porcentaje la barra va sin rótulo, nunca con un cero que no se sabe. Va con
      // espacio duro porque el gráfico reparte las palabras y partiría «22,0» del «%».
      marginLabel: marginRate === null ? '' : pct(marginRate).replace(' ', ' '),
      belowFloor: marginRate !== null && marginRate < MARGIN_FLOOR,
      inProgress,
      // Un mes a medias no se compara con meses cerrados ni entra en los totales.
      comparable: !inProgress,
      daysElapsed: inProgress ? now.day : null,
      daysInMonth: daysInMonth(raw.year, raw.month)
    };
  });
};

/** Los meses cerrados, que son los únicos que se pueden sumar y comparar. */
export const closedMonths = (statement) => statement.filter((m) => m.comparable);

/** El acumulado del periodo, solo con meses cerrados. */
export const incomeStatementTotals = (statement) => {
  const closed = closedMonths(statement);
  const totals = closed.reduce((acc, m) => ({
    operatingIncome: acc.operatingIncome + m.operatingIncome,
    operatingExpense: acc.operatingExpense + m.operatingExpense,
    loansGranted: acc.loansGranted + m.loansGranted,
    loanRepayments: acc.loanRepayments + m.loanRepayments
  }), { operatingIncome: 0, operatingExpense: 0, loansGranted: 0, loanRepayments: 0 });

  const operatingMargin = round(totals.operatingIncome - totals.operatingExpense);
  return {
    ...totals,
    months: closed.length,
    operatingMargin,
    marginRate: totals.operatingIncome > 0 ? operatingMargin / totals.operatingIncome : null
  };
};

const pct = percentLabel;

/**
 * El color de la barra de un mes. Los tokens de marca se consumen como clase para que la
 * variable se resuelva y cambie con el tema; nunca un hexadecimal local.
 */
export const marginBarClass = (month) => {
  // Un mes a medias no alcanzó ni dejó de alcanzar el piso: todavía no se sabe.
  if (month.inProgress || month.marginRate === null) return 'fill-zinc-300 dark:fill-zinc-700';
  if (month.operatingMargin < 0 || month.belowFloor) return 'fill-[rgb(var(--brand-coral))]';
  return 'fill-[rgb(var(--brand-green))]';
};

/**
 * A dónde se va la plata, de mayor a menor. Un préstamo salió de la cuenta pero no es
 * gasto, así que va aparte del total de operación y nunca dentro de sus porcentajes:
 * el «Total Gastos» de la pantalla vieja venía inflado justo por eso.
 */
export const splitOutgoings = (distribution, categoryLabel = (name) => name) => {
  if (!distribution) return { operating: [], loans: [], operatingTotal: 0, loansTotal: 0 };

  const rows = Object.entries(distribution)
    .map(([name, value]) => ({ name: categoryLabel(name), rawName: name, value: num(value) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const loans = rows.filter((row) => row.rawName === 'PRESTAMO');
  const operating = rows.filter((row) => row.rawName !== 'PRESTAMO');
  const operatingTotal = round(operating.reduce((sum, row) => sum + row.value, 0));

  return {
    operating: operating.map((row) => ({ ...row, share: operatingTotal > 0 ? row.value / operatingTotal : 0 })),
    loans,
    operatingTotal,
    loansTotal: round(loans.reduce((sum, row) => sum + row.value, 0))
  };
};

/**
 * Las frases de la franja de lectura: un hecho y su causa, con la cifra que lo
 * sostiene. Nunca un juicio ni un adjetivo — eso lo pone quien decide, no la pantalla.
 */
export const incomeStatementReadings = (statement = []) => {
  const lecturas = [];
  const closed = closedMonths(statement);

  // 1. Un mes a medias leído como mes cerrado es el error más caro de la pantalla.
  const actual = statement.find((m) => m.inProgress);
  if (actual) {
    lecturas.push({
      kind: 'MES_EN_CURSO',
      text: `${actual.name[0].toUpperCase()}${actual.name.slice(1)} va por el día ${actual.daysElapsed} de ${actual.daysInMonth}: no se compara con meses cerrados.`
    });
  }

  // 2. Un mes que figura en rojo por un préstamo, no por operar.
  const torcido = closed
    .filter((m) => m.netFlow < 0 && m.operatingMargin > 0 && m.loansGranted > 0)
    .sort((a, b) => b.loansGranted - a.loansGranted)[0];
  if (torcido) {
    lecturas.push({
      kind: 'PRESTAMO_TUERCE_EL_MES',
      text: `${torcido.name[0].toUpperCase()}${torcido.name.slice(1)} figura en rojo por $${money(torcido.loansGranted)} en préstamos. Operando cerró en +$${money(torcido.operatingMargin)}; esa plata está en cartera por cobrar.`
    });
  }

  // 3. El indicador que el plan marca como «no se mide», contra su piso.
  const totales = incomeStatementTotals(statement);
  if (totales.marginRate !== null && totales.months > 0) {
    const comparacion = totales.marginRate < MARGIN_FLOOR
      ? `bajo el piso de ${pct(MARGIN_FLOOR)} del plan`
      : `sobre el piso de ${pct(MARGIN_FLOOR)} del plan`;
    lecturas.push({
      kind: 'MARGEN_DEL_PERIODO',
      text: `El margen operativo de los ${totales.months} meses cerrados va en ${pct(totales.marginRate)}, ${comparacion}.`
    });
  }

  // 4. El último mes cerrado, que es sobre el que se decide ahora.
  const ultimo = closed[closed.length - 1];
  if (ultimo && ultimo.marginRate !== null) {
    lecturas.push({
      kind: 'ULTIMO_MES_CERRADO',
      text: `${ultimo.name[0].toUpperCase()}${ultimo.name.slice(1)} cerró en ${ultimo.operatingMargin >= 0 ? '+' : '−'}$${money(Math.abs(ultimo.operatingMargin))} operando, ${pct(ultimo.marginRate)} de lo que entró.`
    });
  }

  return lecturas.slice(0, 4);
};
