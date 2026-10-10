// El foco de la semana (Rodny, 10 de octubre de 2026: «podría tener un resumen listo cada lunes para cada persona y
// dejarlo ahí en uno de sus chats para leer»). Lo escribe la plataforma con sus datos, sin modelo: lo que vence,
// lo que está en proceso y cómo viene el equipo. Lógica pura; el servicio lee y Bria lo deja en un chat nuevo.

import { dayLabel } from './teamLoad.js';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const plusDays = (day, amount) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const weekdayOf = (day) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'colega';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const MAX_LIST = 8;

/** Lunes y domingo de la semana (Bogotá) que contiene `today`. */
export const weekBounds = (today) => {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const monday = plusDays(today, 1 - weekday);
  return { monday, sunday: plusDays(monday, 6) };
};

const taskLine = (task) => `- [${task.title}](/gestion?taskId=${encodeURIComponent(task.id)})${task.clientName ? ` · ${task.clientName}` : ''}${task.role === 'colabora' ? ' · colaboras' : ''}`;
const limited = (rows, render) => [...rows.slice(0, MAX_LIST).map(render), ...(rows.length > MAX_LIST ? [`- …y ${rows.length - MAX_LIST} más en Gestión.`] : [])];

/**
 * `tasks`: [{ id, title, status, dueDay|null, clientName, role: 'responsable'|'colabora' }] abiertas de la persona.
 * `teamSignals`: mensajes del mapa de carga (solo para quien dirige). Devuelve { title, text } en Markdown.
 */
export const buildWeeklyFocus = ({ personName, today, tasks = [], teamSignals = [] } = {}) => {
  const { monday, sunday } = weekBounds(today);
  const overdue = tasks.filter((task) => task.dueDay && task.dueDay < today && task.status !== 'EN_CURSO').sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  const inProgress = tasks.filter((task) => task.status === 'EN_CURSO');
  const thisWeek = tasks.filter((task) => task.dueDay && task.dueDay >= today && task.dueDay <= sunday && task.status !== 'EN_CURSO').sort((a, b) => a.dueDay.localeCompare(b.dueDay) || a.title.localeCompare(b.title));
  const undated = tasks.filter((task) => !task.dueDay && task.status !== 'EN_CURSO');
  const name = firstName(personName);
  const lines = [`Hola, ${name}. Este es tu foco de la semana del ${dayLabel(monday)} al ${dayLabel(sunday)}.`, ''];

  // En Markdown una línea pegada a una lista se lee como parte del último ítem: cada título y cada día van con su
  // línea en blanco (se vio en la primera muestra: «Carrusel de Endova · Endova Viernes 16 de octubre»).
  if (overdue.length) {
    lines.push(`**Vencidas (${overdue.length})** — conviene decidir hoy si siguen vigentes o se mueve la fecha.`, '');
    lines.push(...limited(overdue, (task) => `${taskLine(task)} · venció el ${dayLabel(task.dueDay)}`), '');
  }
  if (inProgress.length) {
    lines.push(`**En proceso (${inProgress.length})**`, '');
    lines.push(...limited(inProgress, taskLine), '');
  }
  if (thisWeek.length) {
    lines.push(`**Esta semana (${thisWeek.length})**`);
    let currentDay = null;
    for (const task of thisWeek.slice(0, MAX_LIST)) {
      if (task.dueDay !== currentDay) { currentDay = task.dueDay; lines.push('', `_${cap(weekdayOf(currentDay))} ${dayLabel(currentDay)}${currentDay === today ? ' (hoy)' : ''}_`, ''); }
      lines.push(taskLine(task));
    }
    if (thisWeek.length > MAX_LIST) lines.push(`- …y ${thisWeek.length - MAX_LIST} más en Gestión.`);
    lines.push('');
  }
  if (!overdue.length && !inProgress.length && !thisWeek.length) {
    lines.push(undated.length ? `No tienes tareas con fecha esta semana; sí ${plural(undated.length, 'pendiente sin fecha', 'pendientes sin fecha')}. Vale la pena ponerles día para que entren al mapa de carga.` : 'No tienes tareas abiertas esta semana. Buen momento para adelantar lo que viene.', '');
  } else if (undated.length) {
    lines.push(`Además hay ${plural(undated.length, 'pendiente sin fecha', 'pendientes sin fecha')}: ponerles día los mete en el mapa de carga.`, '');
  }
  if (teamSignals.length) {
    lines.push('**El equipo**', '');
    lines.push(...teamSignals.slice(0, 5).map((signal) => `- ${typeof signal === 'string' ? signal : signal.message}`), '');
  }
  lines.push('Si quieres, dime por dónde empezar y lo organizamos juntos.');
  return { title: `Foco de la semana · ${dayLabel(monday)}`, text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
};
