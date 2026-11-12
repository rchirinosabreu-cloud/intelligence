const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
export function recognitionCalendar(at) {
  const day = dayFormatter.format(new Date(at));
  const monday = new Date(`${day}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10) };
}
// Task deadlines are calendar dates persisted at UTC midnight (the existing task contract).
export function recognitionDueDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
// «Al día» ya no se gana al cerrar una tarea: se entrega al cierre de la jornada (ver `caughtUpAtClose`).
export function taskAwardKinds({ teamDayCount, userDayCount, userWeekCount, early }) {
  return [teamDayCount === 1 && 'FIRST_TASK', early && 'EARLY_DELIVERY', userDayCount === 8 && 'DAILY_EIGHT', userWeekCount === 50 && 'WEEKLY_FIFTY'].filter(Boolean);
}

/**
 * «Al día» al cierre de la jornada (Rodny, 12 de noviembre de 2026: «Dar "Al día" al cierre de la jornada a quien
 * terminó el día sin nada vencido»). Sustituye a la regla de ponerse al día, que premiaba atrasarse: se la llevaba quien
 * cerraba su última vencida y nunca quien no se atrasaba.
 *
 * Se juzga el estado a las 18:00 de Bogotá, reconstruido con lo que se ve después: una tarea cerrada más tarde estaba
 * abierta a esa hora. Se gana si la persona cerró al menos una tarea ese día antes de las 18:00 y no le quedaba nada
 * que venciera ese día o antes, ni un compromiso con hora anterior a las 18:00. Una devuelta espera a quien la creó y
 * no cuenta. Sin cerrar nada ese día no hay insignia: no se gana por no tener trabajo.
 */
export const CAUGHT_UP_POLICY = 'cierre-del-dia-v2';
export const dayCloseCutoff = (day) => new Date(`${day}T23:00:00.000Z`);
const OPEN_STATUSES = new Set(['PENDIENTE', 'EN_CURSO']);
export function caughtUpAtClose({ day, views = [] }) {
  const dayStart = new Date(`${day}T05:00:00.000Z`), cutoff = dayCloseCutoff(day);
  const done = (view) => view.status === 'REALIZADA' && view.completedAt && new Date(view.completedAt) < cutoff;
  const openAtCutoff = (view) => OPEN_STATUSES.has(view.status) || (view.status === 'REALIZADA' && view.completedAt && new Date(view.completedAt) >= cutoff);
  const owed = (view) => {
    const due = recognitionDueDay(view.dueDate);
    return Boolean((due && due <= day) || (view.focusDeadlineAt && new Date(view.focusDeadlineAt) < cutoff));
  };
  const closed = views.filter((view) => done(view) && new Date(view.completedAt) >= dayStart).length;
  const pending = views.filter((view) => openAtCutoff(view) && owed(view)).length;
  return { eligible: closed > 0 && pending === 0, closed, pending };
}
export function planIsApproved(items, approvedIds = []) {
  const active = items.filter(item => !item.deletedAt);
  return active.length > 0 && active.every(item => item.status === 'APROBADO'
    || (approvedIds.includes(item.id) && ['EN_PRODUCCION', 'REALIZADO', 'PROGRAMADO', 'PUBLICADO'].includes(item.status)));
}
