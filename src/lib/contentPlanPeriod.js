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
