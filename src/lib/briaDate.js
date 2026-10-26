const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha de calendario en texto; no convertir a UTC ni desplazar el día. */
export const humanDate = key => {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return String(key || '');
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
};
