import { cycleRangeLabel } from './publicationPeriod.js';
import { shortDate } from './clientOperations.js';

const CONTENT_PLAN_MONTHS = Object.freeze([
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]);

export const getContentPlanMonthName = (monthNumber) => {
  const month = Number(monthNumber);
  return Number.isInteger(month) ? CONTENT_PLAN_MONTHS[month - 1] || '' : '';
};

export const formatContentPlanDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

// Cómo se nombra una parrilla (Rodny, 19 de noviembre de 2026). Con corte 1 es el mes, «noviembre 2026». Con otro
// corte el ciclo toca dos meses y la parrilla se nombra así, «noviembre–diciembre 2026», con su rango
// «10 nov – 9 dic» al lado: el cliente aprueba desde ahí y tiene que ver qué período está aprobando.
export const planPeriodName = (plan) => {
  const name = plan?.cycle?.mixed && plan.cycle.label ? plan.cycle.label.toLowerCase() : getContentPlanMonthName(plan?.month);
  return name ? `${name} ${plan.year}` : '';
};

export const planPeriodRange = (plan) => (plan?.cycle?.mixed ? cycleRangeLabel(plan.cycle) : '');

const lower = (text) => String(text || '').toLowerCase();
const dayLabel = (key) => shortDate(key, { year: true });

// El aviso antes de guardar una fecha (`periodMovePreview`). null si no hay nada que preguntar.
export const periodMoveMessage = (preview) => {
  if (!preview || (!preview.moves && !preview.contractEnd)) return null;
  const lines = [];
  if (preview.contractEnd) {
    lines.push(`El contrato de este cliente termina el ${dayLabel(preview.contractEnd.endDate)}${preview.contractEnd.noRenewal
      ? ' y no se va a renovar.' : ' y no hay renovación registrada.'}`);
  }
  if (preview.moves) {
    const { from, to } = preview;
    lines.push(`Esta parrilla va del ${shortDate(from.start)} al ${dayLabel(from.end)}. Con la fecha ${dayLabel(preview.date)}, la pieza pasaría a la parrilla de ${lower(to.label)} ${to.year}${to.mixed ? ` (${cycleRangeLabel(to)})` : ''}.`);
    return { title: preview.contractEnd ? 'Esta fecha queda fuera del contrato' : 'La pieza cambiaría de parrilla',
      description: lines.join('\n\n'), confirmLabel: `Mover a ${lower(to.label)}`, cancelLabel: 'Cambiar la fecha', tone: 'info', layer: 200 };
  }
  lines.push('La pieza se queda en esta parrilla.');
  return { title: 'Esta fecha queda fuera del contrato', description: lines.join('\n\n'),
    confirmLabel: 'Dejar esta fecha', cancelLabel: 'Cambiar la fecha', tone: 'info', layer: 200 };
};
