// Mapa de carga (Rodny, 10 de octubre de 2026, Fase A de Ritmo): quién está saturado y quién tiene espacio en los
// próximos días hábiles. Las horas salen exclusivamente de previsiones por tarea con contexto comparable.
// Nunca completa con una mediana general ni una hora supuesta; sin base devuelve null.
// Lógica pura; solo administradores y project managers la ven (la ruta y la herramienta de Bria lo exigen).

import { isBusinessDay } from './colombiaBusinessDays.js';
import { RHYTHM_POLICY } from './workPrediction.js';

const H = 3_600_000;
export const LOAD_CAPACITY_MS = 8 * H;
export const LOAD_DAYS = 10;
export const LOAD_LEVELS = Object.freeze(['libre', 'ok', 'alta', 'excedida', 'sin_datos']);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dayLabel = (day) => { const [, m, d] = String(day || '').split('-').map(Number); return m && d ? `${d} de ${MONTHS[m - 1]}` : String(day || ''); };
export const formatHours = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return 'Sin estimación';
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

/** Solo una duración respaldada por la previsión común de esa tarea. */
export const estimateFor = (task, estimates = {}) => {
  const prediction = estimates.byTask?.[task.id];
  return prediction?.confidence === 'suficiente' && Number.isFinite(prediction.remainingMs) && prediction.remainingMs > 0 ? { ms: prediction.remainingMs, source: 'persona' } : { ms: null, source: 'sin_estimacion' };
};

// Un día completo (dos videos de 4 h) ya es carga alta —Rodny: «eso está muy mal, hay que revisar»—; pasado el
// día y cuarto, excedida.
export const levelOf = (ms, capacityMs = LOAD_CAPACITY_MS) => {
  if (ms == null || !Number.isFinite(ms)) return 'sin_datos';
  const ratio = ms / capacityMs;
  if (ratio < 0.5) return 'libre';
  if (ratio < 0.9) return 'ok';
  if (ratio <= 1.25) return 'alta';
  return 'excedida';
};

export const buildLoadMap = ({ people = [], tasks = [], forecast, today, days = LOAD_DAYS, capacityMs = LOAD_CAPACITY_MS } = {}) => {
  const estimates = { byTask: forecast?.policy === RHYTHM_POLICY ? Object.fromEntries(forecast.people.flatMap(p => p.tasks).map(t => [t.id, t])) : {} };
  const dayKeys = nextWorkingDays(today, days);
  const dayIndex = new Map(dayKeys.map((day, index) => [day, index]));
  const rows = people.map((person) => {
    const own = tasks.filter((task) => task.personId === person.personId);
    const cells = dayKeys.map((day) => ({ day, ms: 0, count: 0, unknownCount: 0, level: 'libre', tasks: [] }));
    const overdue = { count: 0, ms: 0, taskIds: [] };
    const undated = { count: 0, taskIds: [] };
    const nonWorking = [];
    for (const task of own) {
      const { ms, source } = estimateFor(task, estimates);
      const row = { id: task.id, title: task.title, workType: task.workType, clientName: task.clientName || null, status: task.status, ms, source };
      if (!task.dueDay) { undated.count += 1; undated.taskIds.push(task.id); continue; }
      if (task.dueDay < today) { overdue.count += 1; overdue.ms = overdue.ms === null || ms === null ? null : overdue.ms + ms; overdue.taskIds.push(task.id); continue; }
      if (!isBusinessDay(task.dueDay) && task.dueDay <= dayKeys.at(-1)) { nonWorking.push({ ...row, dueDay: task.dueDay }); continue; }
      const slot = dayIndex.get(task.dueDay);
      if (slot === undefined) continue; // Más allá del horizonte: no pesa en estos días.
      if (ms === null) cells[slot].unknownCount++;
      cells[slot].ms = cells[slot].ms === null || ms === null ? null : cells[slot].ms + ms; cells[slot].count += 1; cells[slot].tasks.push(row);
    }
    for (const cell of cells) cell.level = cell.unknownCount ? 'sin_datos' : levelOf(cell.ms, capacityMs);
    const weekMs = cells.some(c => c.unknownCount) ? null : cells.reduce((sum, cell) => sum + cell.ms, 0);
    return { personId: person.personId, personName: person.personName, avatarUrl: person.avatarUrl || null, cells, overdue, undated, weekMs, nonWorking };
  });
  const totals = dayKeys.map((day) => ({ day, ms: rows.some(row => row.cells[dayIndex.get(day)].ms === null) ? null : rows.reduce((sum, row) => sum + row.cells[dayIndex.get(day)].ms, 0), count: rows.reduce((sum, row) => sum + row.cells[dayIndex.get(day)].count, 0) }));
  return { today, days: dayKeys, capacityMs, people: rows, totals, forecast };
};

/** Señales de carga, para la pantalla y para la lectura de la semana: preguntas con sus tareas, nunca juicios. */
export const loadSignals = (map) => {
  const signals = [];
  if (map.forecast?.policy !== RHYTHM_POLICY) return signals;
  for (const person of map.people) {
    const predicted = map.forecast.people.find(p => p.personId === person.personId);
    const risks = (predicted?.tasks || []).filter(t => t.risk === 'riesgo' && t.queueComplete);
    if (risks.length) {
      signals.push({ kind: 'ENTREGAS_EN_RIESGO', personId: person.personId, taskIds: risks.map(t => t.id),
        message: `${person.personName} tiene ${risks.length} entregas con margen insuficiente según historial comparable y compromisos previos. Conviene revisar las fechas.` });
    }
    if (person.overdue.count > 0) {
      signals.push({ kind: 'VENCIDAS', personId: person.personId, taskIds: person.overdue.taskIds,
        message: `${person.personName} tiene ${person.overdue.count} ${person.overdue.count === 1 ? 'tarea vencida' : 'tareas vencidas'}. ¿Siguen vigentes o hay que mover la fecha?` });
    }
    if (predicted?.canReceive) {
      signals.push({ kind: 'CON_ESPACIO', personId: person.personId, taskIds: [],
        message: `${person.personName} tiene espacio nominal estimado con historial comparable y cola completa; confirma reuniones y ausencias antes de asignar.` });
    }
  }
  return signals;
};
