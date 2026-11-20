// A qué parrilla pertenece una pieza según su fecha de publicación (Rodny y Kamila, 19 de noviembre de 2026, con
// Bonsai: «la parrilla va del 10 de noviembre al 10 de diciembre; en noviembre aparecen siete y en diciembre tres»).
// La parrilla de un mes va del día de corte del contrato al día anterior del mes siguiente (`cycleOf`), así que una
// pieza del 5 de diciembre de un cliente con corte 10 es de la parrilla de noviembre, no de la de diciembre. Antes el
// traslado de período miraba solo el mes del calendario y la sacaba a diciembre: la parrilla de noviembre se veía
// incompleta en Operación y la siguiente, inflada. Con corte 1 (el de casi todos) el resultado es el de siempre.
import { cycleForDate, cycleOf, shortDate } from './clientOperations.js';
import { orderedContracts, contractAt } from './clientContractSelection.js';

const dayKeyOf = (date) => date.toISOString().slice(0, 10);

// El corte lo pone el contrato vigente ese día; antes del primero manda el primero, y sin contrato es el mes calendario.
export function cutDayOn(contracts, dayKey) {
  const ordered = orderedContracts(contracts || []);
  const contract = contractAt(ordered, dayKey) || ordered[ordered.length - 1] || null;
  return Number(contract?.cutDay) || 1;
}

// `date` es el día de publicación guardado a mediodía UTC (`publicationDate`): su día UTC es el día del calendario.
export function publicationPeriod(date, contracts) {
  const key = dayKeyOf(date);
  const { year, month } = cycleForDate(key, cutDayOn(contracts, key));
  return { year, month };
}

const pad = (n) => String(n).padStart(2, '0');

// El período que cubre la parrilla de `month` (Rodny, 19 de noviembre de 2026: «la parrilla debería entenderse y
// aparecer como bimensual, según las fechas de corte»). Manda el contrato vigente el día 28 de ese mes, el último que
// puede ser día de corte, así un contrato que arranca a mitad de mes ya nombra su primera parrilla. `mixed` dice si el
// ciclo toca dos meses; con corte 1 es el mes calendario y la parrilla se sigue llamando como siempre.
export function planCycle({ year, month }, contracts) {
  const cut = cutDayOn(contracts, `${year}-${pad(month)}-28`);
  const cycle = cycleOf(year, month, cut);
  return { cutDay: Math.min(28, Math.max(1, cut)), label: cycle.label, start: cycle.start, end: cycle.end,
    mixed: cycle.start.slice(0, 7) !== cycle.end.slice(0, 7) };
}

// «10 nov – 9 dic»; si el ciclo cruza el año, «10 dic 2026 – 9 ene 2027».
export function cycleRangeLabel(cycle) {
  if (!cycle?.start || !cycle?.end) return '';
  const crossesYear = cycle.start.slice(0, 4) !== cycle.end.slice(0, 4);
  return `${shortDate(cycle.start, { year: crossesYear })} – ${shortDate(cycle.end, { year: crossesYear })}`;
}

// Si la fecha cae después del fin del último contrato. Uno que ya arrancó después del que termina es la renovación.
export function contractEndNotice(dayKey, contracts) {
  const latest = orderedContracts(contracts || [])[0];
  if (!latest?.endDate || dayKey <= latest.endDate) return null;
  return { endDate: latest.endDate, noRenewal: latest.renewalDecision === 'NO_RENOVAR' };
}

// Lo que pasaría al poner `dayKey` a una pieza de la parrilla `plan`: si cambia de parrilla y si se sale del contrato.
// La pantalla lo pregunta antes de guardar, para que ninguna pieza cambie de parrilla sin que se note.
export function periodMovePreview(plan, dayKey, contracts) {
  const { year, month } = cycleForDate(dayKey, cutDayOn(contracts, dayKey));
  const moves = year !== plan.year || month !== plan.month;
  const describe = (period) => ({ year: period.year, month: period.month, ...planCycle(period, contracts) });
  return { date: dayKey, moves, from: describe(plan), to: moves ? describe({ year, month }) : null,
    contractEnd: contractEndNotice(dayKey, contracts) };
}

// Las piezas de `plan` cuya fecha es de otra parrilla (Rodny, 20 de noviembre de 2026: «la parrilla de Promogroup es
// noviembre y diciembre, debería poder admitir piezas desde el 15 de nov hasta el 14 de dic»). Son las que el traslado
// sacó por mes calendario antes de que respetara el corte: nadie las devolvía, porque volver a guardar la misma fecha
// no es un cambio. Cada una dice a qué parrilla pertenece.
export function outOfPeriodItems(plan, items, contracts) {
  const out = [];
  for (const item of items || []) {
    if (!item?.publishDate) continue;
    const date = new Date(item.publishDate);
    if (Number.isNaN(date.getTime())) continue;
    const period = publicationPeriod(date, contracts);
    if (period.year === plan.year && period.month === plan.month) continue;
    out.push({ id: item.id, date: dayKeyOf(date), to: { ...period, ...planCycle(period, contracts) } });
  }
  return out;
}

// El día con que nace una pieza nueva: hoy si cae dentro de la parrilla, y si no el primer día de la parrilla. Antes
// nacía siempre con la fecha de hoy y el traslado se la llevaba a la parrilla de hoy, no a la que estaba abierta.
export function defaultPieceDay(cycle, todayKey) {
  if (!cycle?.start || !cycle?.end) return todayKey;
  return todayKey >= cycle.start && todayKey <= cycle.end ? todayKey : cycle.start;
}
