// Evidencia temporal de campos nativos: no interpreta títulos ni convierte una
// fecha de producción en fecha de publicación. Bogotá no aplica horario de verano.
import { bogotaDate } from './colombiaBusinessDays.js';
import { publishAtIso } from './socialPublishing.js';

const instantOf = value => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
const calendarDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && instantOf(value)?.slice(0, 10) === value ? value : null;
// An instant requires an explicit zone. A day, or a local clock without its
// zone, cannot establish whether a deadline hour has already passed.
const explicitInstant = value => {
  if (value instanceof Date) return instantOf(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !calendarDay(value.slice(0, 10))) return null;
  return instantOf(value);
};

export const temporalRelation = ({ fecha = null, instante = null } = {}, { today, now = new Date() } = {}) => {
  const instant = explicitInstant(instante), current = explicitInstant(now);
  const date = calendarDay(fecha) || (instant ? bogotaDate(instant) : null);
  const day = calendarDay(today) || (current ? bogotaDate(current) : null);
  return {
    relacionConHoy: date && day ? date < day ? 'PASADO' : date > day ? 'FUTURO' : 'HOY' : null,
    relacionConAhora: instant && current ? new Date(instant) < new Date(current) ? 'PASADO' : new Date(instant) > new Date(current) ? 'FUTURO' : 'AHORA' : null
  };
};

export const taskCalendarDay = value => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return calendarDay(value);
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
    ...temporalRelation({ fecha: date, instante: instant }, { today: day, now }),
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
    entrega: { fecha: date, ...temporalRelation({ fecha: date }, { today: day, now }), vencida: Boolean(!closed && date && date < day) },
    compromiso: commitment ? { fecha: bogotaDate(commitment), hora: localClock(commitment), instante: commitment, ...temporalRelation({ instante: commitment }, { today: day, now }), vencido: !closed && new Date(commitment) < new Date(now) } : null,
    publicacion: publicationTemporalEvidence(task.contentItem, { today: day, now })
  };
};
