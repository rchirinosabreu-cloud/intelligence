// A qué parrilla pertenece una pieza según su fecha de publicación (Rodny y Kamila, 19 de noviembre de 2026, con
// Bonsai: «la parrilla va del 10 de noviembre al 10 de diciembre; en noviembre aparecen siete y en diciembre tres»).
// La parrilla de un mes va del día de corte del contrato al día anterior del mes siguiente (`cycleOf`), así que una
// pieza del 5 de diciembre de un cliente con corte 10 es de la parrilla de noviembre, no de la de diciembre. Antes el
// traslado de período miraba solo el mes del calendario y la sacaba a diciembre: la parrilla de noviembre se veía
// incompleta en Operación y la siguiente, inflada. Con corte 1 (el de casi todos) el resultado es el de siempre.
import { cycleForDate } from './clientOperations.js';
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
