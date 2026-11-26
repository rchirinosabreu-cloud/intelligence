import { CAUGHT_UP_MIN_CLOSED } from '../lib/platformLeague.js';
import { areaEquityActive } from '../lib/leagueAreaChecks.js';
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
export const CAUGHT_UP_POLICY = 'cierre-del-dia-v4';
/**
 * Al menos dos cierres (Rodny, 18 de noviembre de 2026): la insignia valía lo mismo con una tarea que con siete, y
 * Brayan la ganó dos días seguidos cerrando una. La pasada solo entrega en la media hora que sigue al corte: después,
 * reprogramar una fecha vencida la hacía desaparecer del cálculo y la insignia llegaba tarde (Sara, 12 de noviembre, 18:49).
 */
export { CAUGHT_UP_MIN_CLOSED };
export const CAUGHT_UP_AWARD_WINDOW_MS = 30 * 60 * 1000;
// La jornada cierra a las 5:00 p. m. (Rodny, 21 de noviembre de 2026: «que se cierre a las 5pm, o sea si a esa hora la
// persona quedó con sus tareas al día, sin nada vencido sin tener que mover fechas, lo gana»). Rige desde el lunes 23
// de noviembre; los días anteriores se siguen juzgando a las 18:00, como se jugaron.
export const CLOSE_HOUR = 17;
export const dayCloseHour = (day) => (areaEquityActive(day) ? CLOSE_HOUR : 18);
export const dayCloseLabel = (day) => `${dayCloseHour(day)}:00`;
export const dayCloseCutoff = (day) => new Date(`${day}T${dayCloseHour(day) + 5}:00:00.000Z`);
// «Buen comienzo» cuenta desde las 8:00 de Bogotá (Rodny, 20 de noviembre de 2026: «pon buen comienzo con regla desde
// las 8am»): Sara cerró una tarea a la 1:07 a. m. y se lo llevó, porque el día empezaba a medianoche. Lo que se cierra
// en la madrugada sigue contando para todo lo demás (esfuerzo, ocho del día, cincuenta de la semana); solo no compite
// por ser la primera del equipo.
export const FIRST_TASK_FROM = '08:00';
export const dayStartCutoff = (day) => new Date(`${day}T13:00:00.000Z`);
const OPEN_STATUSES = new Set(['PENDIENTE', 'EN_CURSO']);
export function caughtUpAtClose({ day, views = [] }) {
  const dayStart = new Date(`${day}T05:00:00.000Z`), cutoff = dayCloseCutoff(day);
  const done = (view) => view.status === 'REALIZADA' && view.completedAt && new Date(view.completedAt) < cutoff;
  const openAtCutoff = (view) => OPEN_STATUSES.has(view.status) || (view.status === 'REALIZADA' && view.completedAt && new Date(view.completedAt) >= cutoff);
  const owed = (view) => {
    // Una fecha movida ese mismo día no saca la tarea de la cuenta: vale la que tenía al empezar la jornada.
    if (view.movedFrom && view.movedFrom <= day) return true;
    const due = recognitionDueDay(view.dueDate);
    return Boolean((due && due <= day) || (view.focusDeadlineAt && new Date(view.focusDeadlineAt) < cutoff));
  };
  const closed = views.filter((view) => done(view) && new Date(view.completedAt) >= dayStart).length;
  const pendingViews = views.filter((view) => openAtCutoff(view) && owed(view));
  const pending = pendingViews.length;
  const pendingTasks = pendingViews.map((view) => ({ title: view.title || null, dueDate: view.movedFrom ? new Date(`${view.movedFrom}T12:00:00.000Z`) : view.dueDate || null, ...(view.movedFrom ? { moved: true } : {}) }))
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  return { eligible: closed >= CAUGHT_UP_MIN_CLOSED && pending === 0, closed, pending, pendingTasks };
}
/**
 * «Parrilla terminada» (Rodny, 26 de noviembre de 2026, a partir de lo que dijo Sara: «las tareas más grandes, como
 * hacer parrillas, deberían dar más puntos»; «hazlo sumando 5 puntos»). Se gana cuando la parrilla tiene piezas y ya no
 * le queda ninguna en borrador: todas salieron a revisión o más allá. Es el momento en que acaban las horas de armado.
 * Rige para las parrillas de noviembre de 2026 en adelante; una por parrilla.
 */
export const PLAN_FINISHED_FROM = { year: 2026, month: 11 };
export const planCountsForFinished = (plan) => Number(plan?.year) > PLAN_FINISHED_FROM.year
  || (Number(plan?.year) === PLAN_FINISHED_FROM.year && Number(plan?.month) >= PLAN_FINISHED_FROM.month);
export function planIsFinished(items = []) {
  const active = items.filter(item => !item.deletedAt);
  return active.length > 0 && active.every(item => item.status !== 'BORRADOR');
}
export function planIsApproved(items, approvedIds = []) {
  const active = items.filter(item => !item.deletedAt);
  return active.length > 0 && active.every(item => item.status === 'APROBADO'
    || (approvedIds.includes(item.id) && ['EN_PRODUCCION', 'REALIZADO', 'PROGRAMADO', 'PUBLICADO'].includes(item.status)));
}
