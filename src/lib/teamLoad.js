// Mapa de carga (Rodny, 10 de octubre de 2026, Fase A de Ritmo): quién está saturado y quién tiene espacio en los
// próximos días hábiles. Lo comprometido sale de las tareas abiertas y su fecha; las horas, de lo que suele tomar
// cada tipo de trabajo (primero la mediana de la persona, después la del equipo, y si no hay nada, un supuesto).
// Lógica pura; solo administradores y project managers la ven (la ruta y la herramienta de Bria lo exigen).

import { isBusinessDay } from './colombiaBusinessDays.js';

const H = 3_600_000;
export const LOAD_CAPACITY_MS = 8 * H;
export const LOAD_DAYS = 10;
export const DEFAULT_ESTIMATE_MS = 1 * H;
export const LOAD_LEVELS = Object.freeze(['libre', 'ok', 'alta', 'excedida']);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dayLabel = (day) => { const [, m, d] = String(day || '').split('-').map(Number); return m && d ? `${d} de ${MONTHS[m - 1]}` : String(day || ''); };
export const formatHours = (ms) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};
const plusDays = (day, amount) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };

/** Los próximos `count` días hábiles de Colombia, contando hoy si es hábil. */
export const nextWorkingDays = (today, count = LOAD_DAYS) => {
  const days = [];
  let day = today;
  while (days.length < count) {
    if (isBusinessDay(day)) days.push(day);
    day = plusDays(day, 1);
  }
  return days;
};

/** Cuánto suele tomar una tarea como esta: la mediana de la persona, la del equipo, o un supuesto. */
export const estimateFor = (task, estimates = {}) => {
  if (task.estimateMs > 0) return { ms: task.estimateMs, source: 'persona' };
  const own = estimates.byPersonType?.[`${task.personId}|${task.workType}`];
  if (own > 0) return { ms: own, source: 'persona' };
  const team = estimates.byType?.[task.workType];
  if (team > 0) return { ms: team, source: 'equipo' };
  return { ms: DEFAULT_ESTIMATE_MS, source: 'supuesto' };
};

// Un día completo (dos videos de 4 h) ya es carga alta —Rodny: «eso está muy mal, hay que revisar»—; pasado el
// día y cuarto, excedida.
export const levelOf = (ms, capacityMs = LOAD_CAPACITY_MS) => {
  const ratio = ms / capacityMs;
  if (ratio < 0.5) return 'libre';
  if (ratio < 0.9) return 'ok';
  if (ratio <= 1.25) return 'alta';
  return 'excedida';
};

export const buildLoadMap = ({ people = [], tasks = [], estimates = {}, today, days = LOAD_DAYS, capacityMs = LOAD_CAPACITY_MS } = {}) => {
  const dayKeys = nextWorkingDays(today, days);
  const dayIndex = new Map(dayKeys.map((day, index) => [day, index]));
  const rows = people.map((person) => {
    const own = tasks.filter((task) => task.personId === person.personId);
    const cells = dayKeys.map((day) => ({ day, ms: 0, count: 0, level: 'libre', tasks: [] }));
    const overdue = { count: 0, ms: 0, taskIds: [] };
    const undated = { count: 0, taskIds: [] };
    for (const task of own) {
      const { ms, source } = estimateFor(task, estimates);
      const row = { id: task.id, title: task.title, workType: task.workType, clientName: task.clientName || null, status: task.status, ms, source };
      if (!task.dueDay) { undated.count += 1; undated.taskIds.push(task.id); continue; }
      if (task.dueDay < today) { overdue.count += 1; overdue.ms += ms; overdue.taskIds.push(task.id); continue; }
      // Una tarea que vence un fin de semana o festivo cuenta en el siguiente día hábil.
      let slot = dayIndex.get(task.dueDay);
      if (slot === undefined) { const next = dayKeys.find((day) => day > task.dueDay); slot = next ? dayIndex.get(next) : undefined; }
      if (slot === undefined) continue; // Más allá del horizonte: no pesa en estos días.
      cells[slot].ms += ms; cells[slot].count += 1; cells[slot].tasks.push(row);
    }
    for (const cell of cells) cell.level = levelOf(cell.ms, capacityMs);
    const weekMs = cells.reduce((sum, cell) => sum + cell.ms, 0);
    return { personId: person.personId, personName: person.personName, avatarUrl: person.avatarUrl || null, cells, overdue, undated, weekMs };
  });
  const totals = dayKeys.map((day) => ({ day, ms: rows.reduce((sum, row) => sum + row.cells[dayIndex.get(day)].ms, 0), count: rows.reduce((sum, row) => sum + row.cells[dayIndex.get(day)].count, 0) }));
  return { today, days: dayKeys, capacityMs, people: rows, totals };
};

/** Señales de carga, para la pantalla y para la lectura de la semana: preguntas con sus tareas, nunca juicios. */
export const loadSignals = (map) => {
  const signals = [];
  const horizon = map.days.length;
  for (const person of map.people) {
    for (const cell of person.cells.filter((c) => c.level === 'excedida')) {
      signals.push({ kind: 'DIA_EXCEDIDO', personId: person.personId, taskIds: cell.tasks.map((t) => t.id),
        message: `${person.personName} tiene ${formatHours(cell.ms)} estimadas el ${dayLabel(cell.day)} en ${cell.count} ${cell.count === 1 ? 'tarea' : 'tareas'}: más de lo que cabe en un día. ¿Se mueve algo o se reparte?` });
    }
    if (person.overdue.count > 0) {
      signals.push({ kind: 'VENCIDAS', personId: person.personId, taskIds: person.overdue.taskIds,
        message: `${person.personName} tiene ${person.overdue.count} ${person.overdue.count === 1 ? 'tarea vencida' : 'tareas vencidas'} que suman ${formatHours(person.overdue.ms)} estimadas. ¿Siguen vigentes o hay que mover la fecha?` });
    }
    if (person.weekMs < map.capacityMs * horizon * 0.3 && !person.cells.some((c) => c.level !== 'libre')) {
      signals.push({ kind: 'CON_ESPACIO', personId: person.personId, taskIds: [],
        message: `${person.personName} tiene ${formatHours(person.weekMs)} comprometidas en los próximos ${horizon} días hábiles: hay espacio para recibir trabajo.` });
    }
  }
  return signals;
};
