// La revisión de las cuentas al cerrar el mes (Rodny, 23 de octubre de 2026, cuarta pieza de «Bria como ojos y
// cerebro»: «un mensaje de Bria el primer día hábil con las cuentas que bajaron o mejoraron y qué propone»). Lo escribe
// la plataforma con la cuenta de rentabilidad (`buildClientProfitability`), sin modelo, como el cierre del día: hechos,
// la comparación con el mes anterior y propuestas concretas que salen de los datos. Nunca un juicio sobre nadie.
// Lógica pura; el servicio la lee y Bria la deja en un chat nuevo de cada administrador.

import { isBusinessDay } from './colombiaBusinessDays.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const H = 3_600_000;
const MAX_LIST = 5;
export const MONTHLY_REVIEW_MAX_PROPOSALS = 5;
// Un cambio cuenta si mueve al menos esto del margen, y al menos una quinta parte del ingreso de la cuenta.
const CHANGE_MIN_CENTS = 30_000_000;

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'colega';
const money = (value) => `${value < 0 ? '-' : ''}$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(value / 100)))}`;
const hours = (ms) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format((ms || 0) / H)} h`;
const percent = (rate) => `${Math.round(rate * 100)} %`;
const monthName = (period) => MONTHS[period.month - 1];

/** El primer día hábil de un mes `YYYY-MM` en Colombia. */
export const firstBusinessDayOf = (monthKey) => {
  for (let day = 1; day <= 10; day += 1) {
    const key = `${monthKey}-${String(day).padStart(2, '0')}`;
    if (isBusinessDay(key)) return key;
  }
  return `${monthKey}-01`;
};

/** El mes que se revisa en un día `YYYY-MM-DD`: el anterior, ya cerrado. */
export const previousMonthOf = (day) => {
  const [year, month] = String(day).split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
};

const agencyMargin = (result) => (result.agency.revenueCents || 0) - (result.agency.costCents || 0);

/**
 * `current` y `previous`: resultados de `buildClientProfitability` del mes que se revisa y del anterior (o `null`).
 * Devuelve el título, el texto en Markdown y las propuestas, para que el servicio y las pruebas las lean por separado.
 */
export const buildMonthlyReview = ({ personName, current, previous = null }) => {
  const label = current.period.label;
  const lines = [`Hola, ${firstName(personName)}. Así cerró ${label} en las cuentas.`, ''];
  const before = new Map((previous?.clients || []).map((row) => [row.clientId, row]));
  const accounts = current.clients || [];

  if (!accounts.length) {
    lines.push(`No hay ingresos ni horas de clientes en ${label}: no hay nada que revisar todavía.`);
    return { title: `Cierre de ${label} · cuentas`, text: lines.join('\n'), proposals: [] };
  }

  // La agencia: lo que entró de los clientes frente a lo que costó operar el mes.
  const margin = agencyMargin(current);
  lines.push('**La agencia**', '');
  lines.push(`- Ingreso de clientes ${money(current.agency.revenueCents)} y costo de operación ${money(current.agency.costCents)}: ${margin >= 0 ? `quedaron ${money(margin)}` : `faltaron ${money(-margin)}`}.`);
  if (previous) {
    const prior = agencyMargin(previous);
    lines.push(`- En ${previous.period.label} ${prior >= 0 ? `quedaron ${money(prior)}` : `faltaron ${money(-prior)}`}.`);
  }
  if (current.agency.coverage !== null && current.agency.coverage !== undefined) {
    lines.push(current.agency.coverage < 0.5
      ? `- Solo el ${percent(current.agency.coverage)} de lo que se cerró tiene tiempo medido: el costo de cada cuenta es aproximado.`
      : `- El ${percent(current.agency.coverage)} de lo que se cerró tiene tiempo medido.`);
  }
  lines.push('');

  // Las que costaron más de lo que dejaron, primero la que más.
  const losing = accounts.filter((row) => row.revenueCents > 0 && row.marginCents < 0);
  if (losing.length) {
    lines.push('**Costaron más de lo que dejaron**', '');
    for (const row of losing.slice(0, MAX_LIST)) {
      const prior = before.get(row.clientId);
      const again = prior && prior.revenueCents > 0 && prior.marginCents < 0;
      lines.push(`- **${row.name}**: entró ${money(row.revenueCents)} y costó ${money(row.costCents)} (${money(row.marginCents)}, ${hours(row.hoursMs)}).${again ? ` También quedó por debajo en ${monthName(previous.period)}.` : ''}`);
    }
    if (losing.length > MAX_LIST) lines.push(`- …y ${losing.length - MAX_LIST} más en la pestaña Rentabilidad.`);
    lines.push('');
  }

  // Lo que cambió frente al mes anterior: las que más bajaron y las que más subieron.
  if (previous) {
    const changes = accounts.map((row) => {
      const prior = before.get(row.clientId);
      if (!prior) return null;
      const delta = row.marginCents - prior.marginCents;
      const floor = Math.max(CHANGE_MIN_CENTS, Math.round(Math.max(row.revenueCents, prior.revenueCents) * 0.2));
      return Math.abs(delta) >= floor ? { row, prior, delta } : null;
    }).filter(Boolean);
    const down = changes.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    const up = changes.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    if (down.length || up.length) {
      lines.push('**Lo que más cambió**', '');
      for (const { row, prior, delta } of down) lines.push(`- **${row.name}** bajó ${money(-delta)}: de ${money(prior.marginCents)} en ${monthName(previous.period)} a ${money(row.marginCents)}.`);
      for (const { row, prior, delta } of up) lines.push(`- **${row.name}** subió ${money(delta)}: de ${money(prior.marginCents)} en ${monthName(previous.period)} a ${money(row.marginCents)}.`);
      lines.push('');
    }
  }

  // Lo que propongo: concreto, de los datos, en el orden de lo que más pesa. Nunca sobre una persona.
  const proposals = [];
  const add = (line) => { if (!proposals.includes(line)) proposals.push(line); };
  const month = monthName(current.period);
  for (const row of losing) {
    const prior = before.get(row.clientId);
    if (prior && prior.revenueCents > 0 && prior.marginCents < 0) add(`Revisar el alcance o el precio de ${row.name}: costó más de lo que dejó en ${monthName(previous.period)} y en ${month}.`);
  }
  for (const row of accounts.filter((entry) => entry.flags?.includes('SIN_FACTURAR'))) add(`Confirmar si a ${row.name} le falta la cuenta por cobrar de ${month}: tuvo ${hours(row.hoursMs)} de trabajo sin ingreso.`);
  for (const row of accounts.filter((entry) => entry.flags?.includes('POCA_MEDICION'))) add(`Pedir que se registre el tiempo en ${row.name}: solo ${row.measuredClosed} de ${row.closedTasks} tareas cerradas lo tienen, y su costo real es mayor.`);
  if (current.agency.unlinkedIncomeCents > 0) add(`Ligar a su cliente ${money(current.agency.unlinkedIncomeCents)} de ingresos de ${month} que no tienen cliente (Financiero → Clientes → Vincular).`);
  for (const row of losing) {
    if (!(before.get(row.clientId)?.marginCents < 0)) add(`Mirar qué pasó en ${row.name} este mes: costó ${money(row.costCents)} y entró ${money(row.revenueCents)}.`);
  }
  for (const row of accounts.filter((entry) => entry.flags?.includes('SIN_HORAS'))) add(`Revisar si en ${row.name} falta registrar el trabajo: tuvo ingreso y ninguna hora medida.`);
  const chosen = proposals.slice(0, MONTHLY_REVIEW_MAX_PROPOSALS);
  if (chosen.length) lines.push('**Lo que propongo**', '', ...chosen.map((line) => `- ${line}`), '');

  lines.push(`[Ver la rentabilidad](/financiero?tab=rentabilidad&year=${current.period.year}&month=${current.period.month})`);
  return { title: `Cierre de ${label} · cuentas`, text: lines.join('\n'), proposals: chosen };
};
