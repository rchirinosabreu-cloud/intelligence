// Los cinco puntos de un día hábil (2 de noviembre de 2026): cómo se evalúa a una persona en un día con lo que la
// plataforma ya registra. Regla pura: el servicio junta las fuentes (cierres con sus relojes, sesiones, la foto de
// las 6:00 y las devoluciones) y esto decide. Un hábito que no se pudo jugar queda `null` y nunca resta. La
// evidencia es una frase en español por hábito, hechos y números, nunca un juicio sobre la persona.
import { DAILY_HABITS, EXTRA_ACTIONS } from './platformLeague.js';
import { describePlatformMutation } from './operationalMutationLabels.js';

/** Menos de diez minutos medidos no es una tarea con cronómetro (el mismo umbral que pide el tiempo declarado). */
export const MIN_MEASURED_MS = 10 * 60 * 1000;
/** Una sesión de más de 8 horas es un reloj olvidado (la regla de Ritmo). */
export const FORGOTTEN_SESSION_MS = 8 * 60 * 60 * 1000;

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
/** El día de Bogotá de un instante, sin depender de Intl: Bogotá es UTC-5 todo el año. */
export const bogotaDayOf = (value) => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
};

/** La fecha con la que nació la tarea se guarda al mediodía UTC: su día es el de esa fecha en UTC. */
const dueDayOf = (task) => {
  const value = task?.originalDueDate || task?.dueDate || null;
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
/** «HH:mm» de Bogotá de un instante. */
export const bogotaTimeOf = (value) => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time - BOGOTA_OFFSET_MS).toISOString().slice(11, 16);
};

/** «Primero en abrir» se juega desde las 8:00 de Bogotá de ese día hasta su medianoche. */
export const OPEN_FROM_HOUR = 8;
export const openWindowOf = (dayKey) => ({
  start: new Date(`${dayKey}T${String(OPEN_FROM_HOUR + 5).padStart(2, '0')}:00:00.000Z`),
  end: new Date(Date.parse(`${dayKey}T05:00:00.000Z`) + 86_400_000)
});

/** Una jornada de producción: un evento de Actividad de tipo producción, o una tarea cuya categoría o título lo dicen. */
const PRODUCTION_WORDS = /\b(jornada|grabaci[oó]n|rodaje|producci[oó]n|sesi[oó]n de fotos|shooting)\b/i;
export const isProductionWork = ({ type, title, aiCategory } = {}) =>
  String(type || '').toUpperCase() === 'PRODUCTION' || PRODUCTION_WORDS.test(String(aiCategory || '')) || PRODUCTION_WORDS.test(String(title || ''));

/**
 * Qué huellas de la traza operativa son trabajo registrado y de qué módulo. Las tareas cuentan por sus propios eventos;
 * lo demás por `PLATFORM_MUTATION` con un método de escritura. Lo que no es trabajo —la propia liga, el perfil, las
 * cuentas, los avisos, el chat de Bria— no cuenta, pero sí deja presencia.
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NOT_WORK_PATH = /^\/api\/(league|user|users|auth|login|logout|notifications|push|client-errors|bria|important-notices|service-health|incident-reports|onboarding|whatsapp)(\/|$)/;
export const TASK_WORK_EVENTS = new Set(['TASK_CREATED', 'TASK_UPDATED', 'TASK_ASSIGNED', 'TASK_PARTICIPATION_CHANGED']);
export function workRecordFromTrace(event = {}) {
  if (TASK_WORK_EVENTS.has(event.eventType)) return 'Gestión de tareas';
  if (event.eventType !== 'PLATFORM_MUTATION') return null;
  const method = String(event.metadata?.method || '').toUpperCase();
  const path = String(event.metadata?.path || '');
  if (!WRITE_METHODS.has(method) || !path.startsWith('/api/') || NOT_WORK_PATH.test(path)) return null;
  return describePlatformMutation({ method, pathname: path }).module;
}

/**
 * Evalúa un día. `closedTasks`: lo que la persona cerró ese día como responsable, con `measuredMs` (solo sesiones
 * medidas, nunca declaradas), `declared`, `production` y su fecha original. `createdTasks`: sus creaciones con `documented`.
 * `sessions`: sus relojes de ese día.
 * `overdueAtDawn`: las vencidas con que amaneció (null sin foto). `returnedToday`: cuántas le devolvieron (null sin lectura).
 * `firstOpener`: quién dejó la primera huella en la plataforma desde las 8:00 (`{ memberId, name, at }`; `null` si
 * nadie; `undefined` sin lectura) y `memberId`, para saber si fue esta persona.
 * `workRecords`: los módulos donde la persona dejó registro ese día; `presence`: si dejó alguna huella aunque no
 * registrara trabajo; `productionDays`: las jornadas de producción (eventos de Actividad) en que participó.
 */
export function evaluateLeagueDay({ day, memberId = null, closedTasks = [], createdTasks = [], sessions = [], overdueAtDawn = null, dawnEvidenceReason = null, returnedToday = null, firstOpener, workRecords = [], presence = false, productionDays = [] } = {}) {
  const habits = {}, evidence = {}, extras = {};

  // Reloj: se juega si cerró algo o si tuvo sesiones. Lo pierde una tarea sin medir, un reloj olvidado, dos relojes a la vez o una corrección.
  // Una jornada de producción se cierra con tiempo declarado y vale: en campo no hay cronómetro (Rodny, 9 de noviembre de 2026).
  if (closedTasks.length || sessions.length) {
    const unmeasured = closedTasks.filter((task) => task.production ? !task.declared && Number(task.measuredMs || 0) < MIN_MEASURED_MS : (task.declared || Number(task.measuredMs || 0) < MIN_MEASURED_MS));
    const declaredProduction = closedTasks.filter((task) => task.production && task.declared).length;
    const dirty = sessions.filter((session) => session.isOverlapping || Boolean(session.correctedAt) || Number(session.durationMs || 0) > FORGOTTEN_SESSION_MS);
    habits.RELOJ = unmeasured.length === 0 && dirty.length === 0;
    const parts = [];
    if (closedTasks.length) parts.push(`${plural(closedTasks.length - unmeasured.length, 'cierre con tiempo registrado', 'cierres con tiempo registrado')} de ${closedTasks.length}`);
    if (declaredProduction) parts.push(plural(declaredProduction, 'jornada con tiempo declarado', 'jornadas con tiempo declarado'));
    if (dirty.length) parts.push(plural(dirty.length, 'sesión olvidada, encimada o corregida', 'sesiones olvidadas, encimadas o corregidas'));
    else parts.push(`${plural(sessions.length, 'sesión limpia', 'sesiones limpias')}`);
    evidence.RELOJ = parts.join(' · ');
  } else {
    habits.RELOJ = null;
    evidence.RELOJ = 'Sin cierres ni relojes ese día.';
  }

  // Al día: la foto de las 6:00.
  if (overdueAtDawn === null || overdueAtDawn === undefined) {
    habits.AL_DIA = null;
    evidence.AL_DIA = dawnEvidenceReason || 'Sin foto de las 6:00 ese día.';
  } else {
    habits.AL_DIA = Number(overdueAtDawn) === 0;
    evidence.AL_DIA = Number(overdueAtDawn) === 0 ? 'Amaneció sin vencidas.' : `Amaneció con ${plural(Number(overdueAtDawn), 'vencida', 'vencidas')}.`;
  }

  // A tiempo: cada cierre del día contra la fecha con la que nació.
  const dated = closedTasks.map((task) => ({ task, due: dueDayOf(task) })).filter((row) => row.due);
  if (!dated.length) {
    habits.A_TIEMPO = null;
    evidence.A_TIEMPO = closedTasks.length ? 'Lo cerrado no tenía fecha.' : 'Sin cierres ese día.';
  } else {
    const onTime = dated.filter((row) => { const closedDay = bogotaDayOf(row.task.completedAt); return closedDay && closedDay <= row.due; });
    habits.A_TIEMPO = onTime.length === dated.length;
    evidence.A_TIEMPO = `${onTime.length} de ${dated.length} a tiempo.`;
  }

  // Documentado: las tareas creadas por esta persona ese día tienen contexto humano o un archivo.
  if (!createdTasks.length) {
    habits.DOCUMENTADO = null;
    evidence.DOCUMENTADO = 'Sin tareas creadas ese día.';
  } else {
    const documented = createdTasks.filter((task) => task.documented);
    habits.DOCUMENTADO = documented.length === createdTasks.length;
    evidence.DOCUMENTADO = `${documented.length} de ${createdTasks.length} tareas creadas con comentario o archivo.`;
  }

  // Sin devolución.
  if (returnedToday === null || returnedToday === undefined) {
    habits.SIN_DEVOLUCION = null;
    evidence.SIN_DEVOLUCION = 'Sin lectura de devoluciones ese día.';
  } else {
    habits.SIN_DEVOLUCION = Number(returnedToday) === 0;
    evidence.SIN_DEVOLUCION = Number(returnedToday) === 0 ? 'Nada devuelto.' : `${plural(Number(returnedToday), 'tarea devuelta', 'tareas devueltas')}.`;
  }

  // Trabajo registrado: cualquier módulo. Se juega si la persona dejó alguna huella ese día; sin huella, no se jugó.
  const records = [...workRecords];
  if (closedTasks.length || sessions.length) records.push('Gestión de tareas');
  if (createdTasks.length) records.push('Gestión de tareas');
  for (const jornada of productionDays) records.push(`Jornada de producción${jornada?.title ? `: ${jornada.title}` : ''}`);
  if (records.length) {
    habits.TRABAJO_REGISTRADO = true;
    const modules = [...new Set(records)];
    evidence.TRABAJO_REGISTRADO = `${plural(records.length, 'registro', 'registros')}: ${modules.join(', ')}.`;
  } else if (presence || closedTasks.length || sessions.length) {
    habits.TRABAJO_REGISTRADO = false;
    evidence.TRABAJO_REGISTRADO = 'Entró a la plataforma, pero no quedó registro de trabajo.';
  } else {
    habits.TRABAJO_REGISTRADO = null;
    evidence.TRABAJO_REGISTRADO = 'Sin actividad en la plataforma ese día.';
  }

  // Primero en abrir: la primera huella en la plataforma desde las 8:00 es de una sola persona.
  if (firstOpener === undefined) {
    extras.PRIMERO_EN_ABRIR = null;
    evidence.PRIMERO_EN_ABRIR = 'Sin lectura de quién abrió primero ese día.';
  } else if (!firstOpener) {
    extras.PRIMERO_EN_ABRIR = null;
    evidence.PRIMERO_EN_ABRIR = `Nadie abrió la plataforma desde las ${OPEN_FROM_HOUR}:00 ese día.`;
  } else {
    const mine = Boolean(memberId) && firstOpener.memberId === memberId;
    const at = bogotaTimeOf(firstOpener.at);
    extras.PRIMERO_EN_ABRIR = mine;
    evidence.PRIMERO_EN_ABRIR = mine ? `Abrió primero${at ? `, a las ${at}` : ''}.` : `${firstOpener.name || 'Otra persona'} abrió primero${at ? `, a las ${at}` : ''}.`;
  }

  // Tráfico se suma desde su registro administrativo separado; no duplicarlo en las fotos diarias.
  extras.PRIMERO_EN_REUNION = null;
  evidence.PRIMERO_EN_REUNION = 'El administrador confirma quién llegó primero a tráfico.';

  for (const habit of DAILY_HABITS) if (!(habit.key in habits)) habits[habit.key] = null;
  for (const extra of EXTRA_ACTIONS) if (!(extra.key in extras)) extras[extra.key] = null;
  return { day, habits, extras, evidence };
}

/** La semana ISO de un día (lunes a domingo): «2026-W45». */
export function isoWeekKey(dayKey) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const shiftDay = (dayKey, days) => new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** La semana de un día, de lunes a domingo (Rodny, 9 de noviembre de 2026: «hoy es lunes, el puntaje semanal debe reiniciarse»). */
export function isoWeekRange(dayKey) {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay() || 7;
  const from = shiftDay(dayKey, 1 - weekday);
  return { weekKey: isoWeekKey(dayKey), from, to: shiftDay(from, 6) };
}

/** La semana anterior a la de un día. */
export function previousWeekRange(dayKey) {
  return isoWeekRange(shiftDay(isoWeekRange(dayKey).from, -7));
}
