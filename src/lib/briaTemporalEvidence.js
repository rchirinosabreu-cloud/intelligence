// Evidencia temporal de campos nativos: no interpreta títulos ni convierte una
// fecha de producción en fecha de publicación. Bogotá no aplica horario de verano.
import { bogotaDate } from './colombiaBusinessDays.js';
import { publishAtIso } from './socialPublishing.js';

const instantOf = value => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
export const taskCalendarDay = value => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return instantOf(value)?.slice(0, 10) === value ? value : null;
  }
  const instant = instantOf(value);
  return instant ? bogotaDate(instant) : null;
};
const localClock = value => new Date(new Date(value).getTime() - 5 * 3600000).toISOString().slice(11, 16);

export const publicationTemporalEvidence = (item, { today, now = new Date() } = {}) => {
  if (!item) return null;
  const date = instantOf(item.publishDate)?.slice(0, 10) || null;
  const instant = date ? publishAtIso(date, item.publishTime) : null;
  const day = today || bogotaDate(now);
  return {
    fecha: date, hora: instant ? localClock(instant) : null, instante: instant,
    estado: item.status || null,
    vencida: Boolean(item.status !== 'PUBLICADO' && date && (date < day || (date === day && instant && new Date(instant) < new Date(now))))
  };
};

export const taskTemporalEvidence = (task, { today, now = new Date() } = {}) => {
  const day = today || bogotaDate(now);
  const date = taskCalendarDay(task.dueDate);
  const commitment = instantOf(task.focusDeadlineAt);
  const closed = task.status === 'REALIZADA';
  return {
    zonaHoraria: 'America/Bogota',
    entrega: { fecha: date, vencida: Boolean(!closed && date && date < day) },
    compromiso: commitment ? { fecha: bogotaDate(commitment), hora: localClock(commitment), instante: commitment, vencido: !closed && new Date(commitment) < new Date(now) } : null,
    publicacion: publicationTemporalEvidence(task.contentItem, { today: day, now })
  };
};
