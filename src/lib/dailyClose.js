// El cierre del día (Rodny, 14 de octubre de 2026: «un solo mensaje por persona: qué cerró, qué quedó en proceso,
// qué vence mañana. Y para ti, el resumen del equipo»). Lo escribe la plataforma con sus datos, sin modelo, como el
// foco de la semana: hechos y nada más, nunca un juicio sobre nadie. Lógica pura; el servicio lee y Bria lo deja en
// un chat nuevo a las 5 de la tarde de cada día hábil.

import { dayLabel } from './teamLoad.js';
import { isBusinessDay } from './colombiaBusinessDays.js';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX_LIST = 8;
const plusDays = (day, amount) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const weekdayOf = (day) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'colega';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const joinAnd = (parts) => parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
const taskLine = (task) => `- [${task.title}](/gestion?taskId=${encodeURIComponent(task.id)})${task.clientName ? ` · ${task.clientName}` : ''}${task.role === 'colabora' ? ' · colaboraste' : ''}`;
const limited = (rows, render) => [...rows.slice(0, MAX_LIST).map(render), ...(rows.length > MAX_LIST ? [`- …y ${rows.length - MAX_LIST} más en Gestión.`] : [])];

/** El siguiente día hábil de Colombia después de `today`. */
export const nextWorkday = (today) => { let day = today; do { day = plusDays(day, 1); } while (!isBusinessDay(day)); return day; };

/**
 * `mine`: { closed, inProgress, dueNext, overdue } con [{ id, title, clientName, role }] de la persona.
 * `team` (solo para quien dirige): { closedCount, closedBy: [{ personName, count }], inProgressCount, dueNext: [{ personName, tasks }], overdueCount }, o null.
 * `notices`: lo que Bria le avisó hoy, con su desenlace: [{ title, resolution, followUp, dismissedAt }].
 */
export const buildDailyClose = ({ personName, today, nextDay = nextWorkday(today), mine = {}, team = null, notices = [] } = {}) => {
  const name = firstName(personName);
  const label = `${weekdayOf(today)} ${dayLabel(today)}`;
  const tomorrow = plusDays(today, 1) === nextDay;
  const nextLabel = `${weekdayOf(nextDay)} ${dayLabel(nextDay)}`;
  const closed = mine.closed || [], inProgress = mine.inProgress || [], overdue = mine.overdue || [], dueNext = mine.dueNext || [];
  const lines = [`Hola, ${name}. Así cierra el ${label}.`, '', '**Tu día**', ''];

  // Cada título y cada lista con su línea en blanco: pegados, Markdown los lee como parte del ítem anterior.
  if (closed.length) lines.push(`Cerraste ${plural(closed.length, 'tarea', 'tareas')}:`, '', ...limited(closed, taskLine), '');
  else lines.push('Hoy no quedó ninguna tarea cerrada a tu nombre.', '');
  if (inProgress.length) lines.push(`${inProgress.length === 1 ? 'Queda en proceso 1' : `Quedan en proceso ${inProgress.length}`}:`, '', ...limited(inProgress, taskLine), '');
  if (overdue.length) lines.push(`${overdue.length === 1 ? 'Vencida sin cerrar 1' : `Vencidas sin cerrar ${overdue.length}`}:`, '', ...limited(overdue, taskLine), '');

  lines.push(tomorrow ? `**Mañana, ${nextLabel}**` : `**El ${nextLabel}**`, '');
  if (dueNext.length) lines.push(`${dueNext.length === 1 ? 'Te vence 1' : `Te vencen ${dueNext.length}`}:`, '', ...limited(dueNext, taskLine), '');
  else lines.push(tomorrow ? 'No tienes nada con fecha para mañana.' : 'No tienes nada con fecha para ese día.', '');

  if (team) {
    const closedBy = [...(team.closedBy || [])].sort((a, b) => b.count - a.count || String(a.personName).localeCompare(String(b.personName), 'es'));
    const closedCount = team.closedCount ?? closedBy.reduce((sum, row) => sum + row.count, 0);
    const by = closedBy.slice(0, 5).map((row) => `${firstName(row.personName)} ${row.count}`);
    const dueGroups = team.dueNext || [], dueCount = dueGroups.reduce((sum, group) => sum + (group.tasks || []).length, 0);
    lines.push('**El equipo**', '');
    lines.push(closedCount ? `- Hoy se cerraron ${plural(closedCount, 'tarea', 'tareas')}${by.length ? `: ${joinAnd(by)}` : ''}.` : '- Hoy no se cerró ninguna tarea en el equipo.');
    lines.push(`- Al cierre ${team.inProgressCount === 1 ? 'queda 1' : `quedan ${team.inProgressCount || 0}`} en proceso.`);
    if (dueCount) lines.push(`- ${tomorrow ? 'Mañana' : `El ${weekdayOf(nextDay)}`} ${dueCount === 1 ? 'vence 1 tarea que todavía no está' : `vencen ${dueCount} tareas que todavía no están`} en proceso: ${dueGroups.map((group) => `${firstName(group.personName)} ${joinAnd(group.tasks.slice(0, 3).map((task) => `«${task.title}»`))}${group.tasks.length > 3 ? ` y ${group.tasks.length - 3} más` : ''}`).join('; ')}.`);
    lines.push(`- Vencidas abiertas en el equipo: ${team.overdueCount || 0}.`, '');
  }

  if (notices.length) {
    lines.push('**Lo que te avisé hoy**', '');
    for (const notice of notices) lines.push(`- ${notice.title} → ${notice.resolution || (notice.dismissedAt ? 'Lo ocultaste.' : 'Al cierre seguía igual.')}`);
    lines.push('');
  }
  lines.push(`${tomorrow ? 'Mañana' : `El ${weekdayOf(nextDay)}`} seguimos.`);
  return { title: `Cierre del día · ${label}`, text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
};
