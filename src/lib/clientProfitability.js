// Rentabilidad por cliente (Rodny, 22 de octubre de 2026, cuarta pieza de «Bria como ojos y cerebro»): lo que se le
// facturó a cada cuenta en el mes frente a lo que costó atenderla. Tres decisiones de Rodny ese día:
//   - el costo es **un solo valor por hora de la agencia**: lo que costó operar el mes (nómina y gastos) entre las
//     horas medidas del equipo. Así nadie deduce el salario de una persona y la IA nunca ve la nómina;
//   - lo que deja la cuenta es **lo facturado del mes** (sus cuentas por cobrar), se haya pagado o no;
//   - lo ven **solo administradores**.
// Rodny, 23 de octubre de 2026, al verla con datos reales: «hay muchos clientes que dice “no tiene nada facturado”…
// no está leyendo los movimientos». A muchos clientes no se les crea la cuenta por cobrar de cada mes y su pago entra
// directo en Movimientos. Por eso, sin cuenta por cobrar del mes, el ingreso de la cuenta es **lo que entró** de ese
// cliente en el mes (sin préstamos), y se dice. Nunca se suman las dos cosas: un pago de una cuenta por cobrar
// también es un ingreso, y sumarlos contaría el mismo dinero dos veces.
// Un egreso ligado a un cliente (la pauta que se le paga, una producción) es costo directo de esa cuenta y sale del
// costo hora. Las horas sin cliente son trabajo interno: se dicen aparte, con su costo, para que lo asignado más lo
// interno sea siempre todo el costo del mes. Lógica pura, en centavos; la lee la pantalla, el servidor y Bria.

const H = 3_600_000, M = 60_000;
export const PROFITABILITY_LIMITS = Object.freeze({
  forgottenSessionMs: 8 * H,  // Como en Ritmo: una sesión así es un reloj que nadie pausó, no trabajo.
  minMeasuredMs: 10 * M,      // Una tarea cerrada con menos de esto no tiene tiempo medido.
  lowCoverage: 0.5,           // Menos de la mitad de lo cerrado medido: el costo de la cuenta sale por debajo.
  minClosedForCoverage: 3
});

const NOT_OPERATING_SECTIONS = new Set(['FINANCING', 'INVESTMENT']);
// La ficha de la propia agencia no es una cuenta (Rodny, 23 de octubre de 2026, al verla salir con 154 h y $0 de
// ingreso): su trabajo —contenido propio, administración— es trabajo interno, y lo que se pagó por ella es costo de
// la operación, no costo directo de un cliente.
const AGENCY_NAMES = new Set(['brainstudio', 'brainstudioagencia', 'brainstudioagenciacreativa']);
export const isAgencyClient = (client) => AGENCY_NAMES.has(String(client?.name || '').normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase());

/** Un egreso real de la operación: ni préstamos, ni inversiones, ni financiación. */
export const isOperatingExpense = (record) => record?.type === 'EXPENSE' && record.category !== 'PRESTAMO' && !NOT_OPERATING_SECTIONS.has(record.section);
/** Un ingreso de un cliente por su servicio: ni el reintegro de un préstamo, ni financiación. */
export const isClientIncome = (record) => record?.type === 'INCOME' && Boolean(record.clientId) && record.category !== 'PRESTAMO' && record.section !== 'FINANCING';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cents = (amount) => Math.round(Number(amount || 0) * 100);
const share = (part, whole, total) => (whole > 0 ? Math.round((part / whole) * total) : 0);
const money = (value) => `${value < 0 ? '-' : ''}$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(value / 100)))}`;
const hours = (ms) => { const h = ms / H; return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(h)} h`; };

const FLAG_TEXT = {
  INGRESOS: (row) => `Sin cuenta por cobrar del mes: se usó lo que entró en Movimientos (${money(row.receivedCents)}).`,
  PIERDE: (row) => `Costó ${money(row.costCents)} y ${row.revenueSource === 'INGRESOS' ? 'entró' : 'se le facturó'} ${money(row.revenueCents)}: ${money(-row.marginCents)} por debajo.`,
  SIN_FACTURAR: (row) => `Tuvo ${hours(row.hoursMs)} de trabajo y no tiene nada facturado ni ingresos este mes.`,
  SIN_HORAS: () => 'Tiene ingreso del mes, pero no hay trabajo medido: el margen se ve mejor de lo que es.',
  POCA_MEDICION: (row) => `Solo ${row.measuredClosed} de ${row.closedTasks} tareas cerradas tienen tiempo medido: el costo real es mayor.`
};

/**
 * `receivables`: cuentas por cobrar de clientes del mes `{ clientId, amount }` (pesos).
 * `incomes`: ingresos del mes de cada cliente ya filtrados con `isClientIncome` `{ clientId, amount }`; se usan solo
 *   para el cliente que no tiene cuenta por cobrar del mes.
 * `unlinkedIncomeCents`: lo que entró en el mes sin cliente ligado, solo para decirlo.
 * `expenses`: egresos reales del mes ya filtrados con `isOperatingExpense` `{ amount, clientId? }`.
 * `sessions`: sesiones de trabajo del mes sin simultáneas `{ clientId, ms }`.
 * `closedTasks`: tareas cerradas del mes `{ clientId, measuredMs }`, para decir cuánto se midió.
 */
export const buildClientProfitability = ({ year, month, clients = [], receivables = [], incomes = [], unlinkedIncomeCents = 0, expenses = [], sessions = [], closedTasks = [] }) => {
  const names = new Map(clients.map((client) => [client.id, client]));
  // La ficha de la agencia se lee como «sin cliente»: sus horas son internas y lo que se pagó por ella, operación.
  const agency = new Set(clients.filter(isAgencyClient).map((client) => client.id));
  const account = (clientId) => (clientId && !agency.has(clientId) ? clientId : null);
  let agencyHoursMs = 0;
  const rows = new Map();
  const row = (clientId) => {
    if (!rows.has(clientId)) {
      const client = names.get(clientId);
      rows.set(clientId, { clientId, name: client?.name || 'Cliente', slug: client?.slug || null, billedCents: 0, receivedCents: 0, hoursMs: 0, directCostCents: 0, closedTasks: 0, measuredClosed: 0 });
    }
    return rows.get(clientId);
  };

  for (const receivable of receivables) if (account(receivable.clientId)) row(receivable.clientId).billedCents += cents(receivable.amount);
  for (const income of incomes) if (account(income.clientId)) row(income.clientId).receivedCents += cents(income.amount);
  let costCents = 0, directCostCents = 0;
  for (const expense of expenses) {
    const value = cents(expense.amount);
    costCents += value;
    if (account(expense.clientId)) { directCostCents += value; row(expense.clientId).directCostCents += value; }
  }
  let hoursMs = 0, clientHoursMs = 0, forgottenSessions = 0;
  for (const session of sessions) {
    const ms = Number(session.ms) || 0;
    if (ms <= 0) continue;
    // Una sesión declarada o corregida por un administrador (`trusted`) cuenta aunque pase de 8 h.
    if (ms > PROFITABILITY_LIMITS.forgottenSessionMs && !session.trusted) { forgottenSessions += 1; continue; }
    hoursMs += ms;
    if (account(session.clientId)) { clientHoursMs += ms; row(session.clientId).hoursMs += ms; }
    else if (session.clientId) agencyHoursMs += ms;
  }
  let closed = 0, measured = 0;
  for (const task of closedTasks) {
    const ok = (Number(task.measuredMs) || 0) >= PROFITABILITY_LIMITS.minMeasuredMs;
    closed += 1; if (ok) measured += 1;
    if (task.clientId && rows.has(task.clientId)) { const target = row(task.clientId); target.closedTasks += 1; if (ok) target.measuredClosed += 1; }
  }

  const sharedCostCents = costCents - directCostCents;
  const hourCostCents = hoursMs > 0 ? Math.round(sharedCostCents / (hoursMs / H)) : null;
  const result = [...rows.values()].map((entry) => {
    const laborCostCents = share(entry.hoursMs, hoursMs, sharedCostCents);
    const total = laborCostCents + entry.directCostCents;
    // Lo facturado manda; sin cuenta por cobrar del mes, lo que entró. Nunca las dos sumadas.
    const revenueSource = entry.billedCents > 0 ? 'FACTURADO' : entry.receivedCents > 0 ? 'INGRESOS' : null;
    const revenue = revenueSource === 'INGRESOS' ? entry.receivedCents : entry.billedCents;
    const margin = revenue - total;
    const out = {
      ...entry, revenueCents: revenue, revenueSource, laborCostCents, costCents: total, marginCents: margin,
      marginRate: revenue > 0 ? margin / revenue : null,
      revenuePerHourCents: entry.hoursMs > 0 ? Math.round(revenue / (entry.hoursMs / H)) : null,
      coverage: entry.closedTasks ? entry.measuredClosed / entry.closedTasks : null
    };
    const flags = [];
    if (revenueSource === 'INGRESOS') flags.push('INGRESOS');
    if (!revenue && out.hoursMs) flags.push('SIN_FACTURAR');
    else if (revenue && margin < 0) flags.push('PIERDE');
    if (revenue && !out.hoursMs) flags.push('SIN_HORAS');
    if (out.closedTasks >= PROFITABILITY_LIMITS.minClosedForCoverage && out.coverage < PROFITABILITY_LIMITS.lowCoverage) flags.push('POCA_MEDICION');
    // La línea en palabras: las cifras viajan en centavos y quien lee (una persona o Bria) no tiene que convertirlas.
    const line = `${out.name}: ${revenueSource === 'INGRESOS' ? 'entró' : 'facturado'} ${money(revenue)}, costo ${money(total)} (${hours(out.hoursMs)}${out.directCostCents ? ` y ${money(out.directCostCents)} directo` : ''}), margen ${money(margin)}${out.marginRate !== null ? ` (${Math.round(out.marginRate * 100)} %)` : ''}.`;
    return { ...out, flags, line, reading: flags.map((flag) => FLAG_TEXT[flag](out)) };
  }).sort((a, b) => a.marginCents - b.marginCents || a.name.localeCompare(b.name, 'es'));

  const internalHoursMs = hoursMs - clientHoursMs;
  // Lo interno se calcula como el resto, para que asignado más interno sea exactamente el costo del mes.
  const internalCostCents = hoursMs > 0 ? sharedCostCents - result.reduce((sum, entry) => sum + entry.laborCostCents, 0) : sharedCostCents;
  const coverage = closed ? measured / closed : null;
  const notes = [];
  if (!hoursMs) notes.push('No hay horas medidas en el mes: no hay costo hora, y el costo de cada cuenta es solo lo directo.');
  else notes.push(`El costo hora es ${money(hourCostCents)}: la operación del mes sin lo directo de cada cliente (${money(sharedCostCents)}) entre ${hours(hoursMs)} medidas.`);
  if (closed) notes.push(`${measured} de ${closed} tareas cerradas del mes tienen tiempo medido${coverage < PROFITABILITY_LIMITS.lowCoverage ? ': con tan poco medido, el costo hora sale inflado y lo que se asigna a cada cuenta, impreciso' : ''}.`);
  if (forgottenSessions) notes.push(`${forgottenSessions === 1 ? 'Una sesión de más de 8 horas no se contó' : `${forgottenSessions} sesiones de más de 8 horas no se contaron`}: es un reloj que nadie pausó.`);
  if (internalHoursMs > 0) notes.push(`${hours(internalHoursMs)} fueron trabajo interno, sin cliente: ${money(internalCostCents)} que no se le carga a ninguna cuenta.${agencyHoursMs > 0 ? ` Incluye ${hours(agencyHoursMs)} de la ficha de la agencia.` : ''}`);
  const fromIncome = result.filter((entry) => entry.revenueSource === 'INGRESOS').length;
  if (fromIncome) notes.push(`${fromIncome === 1 ? 'Para un cliente' : `Para ${fromIncome} clientes`} sin cuenta por cobrar del mes se usó lo que entró en Movimientos.`);
  // Un ingreso sin cliente no se le puede dar a ninguna cuenta: se dice cuánto es, para vincularlo.
  if (unlinkedIncomeCents > 0) notes.push(`${money(unlinkedIncomeCents)} de ingresos del mes no están ligados a ningún cliente, así que no cuentan para ninguna cuenta. Se ligan en Financiero → Cuentas por cobrar → Directorio de clientes → Vincular, o editando el movimiento.`);

  return {
    period: { year, month, label: `${MONTHS[month - 1]} de ${year}` },
    agency: { costCents, directCostCents, sharedCostCents, hoursMs, clientHoursMs, internalHoursMs, internalCostCents, hourCostCents, revenueCents: result.reduce((sum, entry) => sum + entry.revenueCents, 0), billedCents: result.reduce((sum, entry) => sum + entry.billedCents, 0), fromIncome, coverage, forgottenSessions },
    clients: result,
    notes
  };
};
