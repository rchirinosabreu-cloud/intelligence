// Los cinco puntos de un día hábil (2 de noviembre de 2026): cómo se evalúa a una persona en un día con lo que la
// plataforma ya registra. Regla pura: el servicio junta las fuentes (cierres con sus relojes, sesiones, la foto de
// las 6:00 y las devoluciones) y esto decide. Un hábito que no se pudo jugar queda `null` y nunca resta. La
// evidencia es una frase en español por hábito, hechos y números, nunca un juicio sobre la persona.
import { DAILY_HABITS, EXTRA_ACTIONS, EFFORT_KEY, PROPORTION_KEY } from './platformLeague.js';
import { describePlatformMutation } from './operationalMutationLabels.js';
import { mergeAreaChecks } from './leagueAreaChecks.js';

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
const dueLabel = (value) => {
  const day = value ? new Date(value).toISOString().slice(0, 10) : null;
  return day ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)) : null;
};
/** Qué quedó vencido, con su nombre: sin eso «Al día» se perdía sin que nadie supiera por qué (Rodny, 18 de noviembre de 2026).
 * Antes de las 18:00 de hoy la jornada sigue abierta: no se dice «al cierre quedaba», sino lo que falta por cerrar. */
export function pendingEvidence(tasks = [], count = tasks.length, { open = false, day = null } = {}) {
  const named = (tasks || []).filter((task) => task?.title).slice(0, 2).map((task) => {
    const dueDay = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null;
    const due = dueLabel(task.dueDate);
    if (!due) return `«${task.title}»`;
    if (open) return `«${task.title}» (${dueDay === day ? 'vence hoy' : `venció el ${due}`})`;
    return `«${task.title}» (vencía el ${due})`;
  });
  const lead = open ? 'Antes de las 18:00 te falta cerrar' : 'Al cierre quedaba';
  if (!named.length) return open
    ? `${lead} ${plural(count, 'tarea que vence hoy o antes', 'tareas que vencen hoy o antes')}.`
    : `${lead} ${plural(count, 'tarea vencida', 'tareas vencidas')}.`;
  const rest = count - named.length;
  const list = rest > 0 ? `${named.join(', ')} y ${plural(rest, 'más', 'más')}` : named.join(' y ');
  return `${lead} ${list}.`;
}
/** Por qué un cierre no cuenta para Reloj. */
function unmeasuredReason(task) {
  if (!task.production && task.declared) return 'tiempo declarado a mano, no medido';
  const minutes = Math.floor(Number(task.measuredMs || 0) / 60000);
  return minutes > 0 ? `${minutes} min medidos, el mínimo es 10` : 'se cerró sin reloj';
}
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
 * `areaChecks`: los chequeos de su área por hábito (`leagueAreaChecks.js`), que se suman a lo que dieron las tareas.
 */
export function evaluateLeagueDay({ day, memberId = null, closedTasks = [], createdTasks = [], sessions = [], overdueAtDawn = null, dawnEvidenceReason = null, returnedToday = null, firstOpener, workRecords = [], presence = false, productionDays = [], areaChecks = null, closeState = null } = {}) {
  const habits = {}, evidence = {}, extras = {};
  // La parte cumplida de cada hábito, en unidades: `{ ok, total }`. Sirve para pagar la parte de un hábito perdido.
  const units = {};

  // Reloj: se juega si cerró algo o si tuvo sesiones. Lo pierde una tarea sin medir, un reloj olvidado, dos relojes a la vez o una corrección.
  // Una jornada de producción se cierra con tiempo declarado y vale: en campo no hay cronómetro (Rodny, 9 de noviembre de 2026).
  if (closedTasks.length || sessions.length) {
    const unmeasured = closedTasks.filter((task) => task.production ? !task.declared && Number(task.measuredMs || 0) < MIN_MEASURED_MS : (task.declared || Number(task.measuredMs || 0) < MIN_MEASURED_MS));
    const declaredProduction = closedTasks.filter((task) => task.production && task.declared).length;
    const dirty = sessions.filter((session) => session.isOverlapping || Boolean(session.correctedAt) || Number(session.durationMs || 0) > FORGOTTEN_SESSION_MS);
    habits.RELOJ = unmeasured.length === 0 && dirty.length === 0;
    // Cada cierre es una unidad y cada sesión olvidada, encimada o corregida es una unidad perdida; sin cierres, cada sesión.
    units.RELOJ = closedTasks.length
      ? { ok: closedTasks.length - unmeasured.length, total: closedTasks.length + dirty.length }
      : { ok: sessions.length - dirty.length, total: sessions.length };
    // Esfuerzo: cada tarea cerrada con su tiempo (medido, o declarado en una jornada de producción) suma un punto.
    extras[EFFORT_KEY] = closedTasks.length - unmeasured.length;
    evidence[EFFORT_KEY] = extras[EFFORT_KEY] ? `${plural(extras[EFFORT_KEY], 'tarea cerrada con su tiempo', 'tareas cerradas con su tiempo')}.` : 'Ninguna tarea cerrada con su tiempo.';
    const parts = [];
    if (closedTasks.length) parts.push(`${plural(closedTasks.length - unmeasured.length, 'cierre con tiempo registrado', 'cierres con tiempo registrado')} de ${closedTasks.length}`);
    if (declaredProduction) parts.push(plural(declaredProduction, 'jornada con tiempo declarado', 'jornadas con tiempo declarado'));
    if (dirty.length) parts.push(plural(dirty.length, 'sesión olvidada, encimada o corregida', 'sesiones olvidadas, encimadas o corregidas'));
    else parts.push(`${plural(sessions.length, 'sesión limpia', 'sesiones limpias')}`);
    evidence.RELOJ = parts.join(' · ');
    // Qué cierre no contó, con su nombre y el motivo (Melissa, 18 de noviembre de 2026: «¿cuál no tenía tiempo?»).
    const named = unmeasured.filter((task) => task.title).slice(0, 2).map((task) => `«${task.title}» (${unmeasuredReason(task)})`);
    if (named.length) {
      const rest = unmeasured.length - named.length;
      evidence.RELOJ += `. Sin tiempo válido: ${rest > 0 ? `${named.join(', ')} y ${plural(rest, 'más', 'más')}` : named.join(' y ')}.`;
    }
  } else {
    habits.RELOJ = null;
    evidence.RELOJ = 'Sin cierres ni relojes ese día.';
  }

  // Al día (Rodny, 18 de noviembre de 2026): se juzga cómo termina la jornada, no cómo amanece. Con la foto de las 6:00
  // quien amanecía con una vencida perdía el hábito aunque la cerrara a las 9. Y solo se juega si la persona cerró algo:
  // sin tareas no hay nada que dejar vencido, y el hábito se regalaba a quien no tenía trabajo.
  if (!closedTasks.length) {
    habits.AL_DIA = null;
    evidence.AL_DIA = 'Sin cierres ese día: Al día se juega cuando cierras algo.';
  } else if (closeState && Number.isFinite(Number(closeState.pending))) {
    const pending = Number(closeState.pending);
    habits.AL_DIA = pending === 0;
    evidence.AL_DIA = pending === 0
      ? (closeState.open ? 'Por ahora nada pendiente: se confirma a las 18:00.' : 'Cerró la jornada sin nada vencido.')
      : pendingEvidence(closeState.pendingTasks, pending, { open: Boolean(closeState.open), day });
  } else if (overdueAtDawn === null || overdueAtDawn === undefined) {
    habits.AL_DIA = null;
    evidence.AL_DIA = dawnEvidenceReason || 'Sin lectura de cómo terminó la jornada.';
  } else {
    // Respaldo: sin lectura del cierre, la foto de las 6:00 de siempre.
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
    units.A_TIEMPO = { ok: onTime.length, total: dated.length };
    evidence.A_TIEMPO = `${onTime.length} de ${dated.length} a tiempo.`;
  }

  // Documentado: las tareas que la persona creó ese día para otra persona llevan contexto real (Rodny, 12 de noviembre
  // de 2026: «hay tareas que no requieren documentar»). Un recordatorio propio no lo necesita y una tarea que sale de
  // una pieza ya trae su guion y su brief: ninguna de las dos juega.
  const delegated = createdTasks.filter((task) => task.delegated !== false && !task.fromPiece);
  if (!createdTasks.length) {
    habits.DOCUMENTADO = null;
    evidence.DOCUMENTADO = 'Sin tareas creadas ese día.';
  } else if (!delegated.length) {
    habits.DOCUMENTADO = null;
    evidence.DOCUMENTADO = 'Las tareas que creó eran para sí misma o salían de una pieza.';
  } else {
    const documented = delegated.filter((task) => task.documented).length;
    habits.DOCUMENTADO = documented === delegated.length;
    units.DOCUMENTADO = { ok: documented, total: delegated.length };
    evidence.DOCUMENTADO = `${documented} de ${plural(delegated.length, 'tarea delegada con contexto', 'tareas delegadas con contexto')}.`;
  }

  // Sin devolución: se juega si la persona entregó algo ese día o si le devolvieron algo (Rodny, 18 de noviembre de 2026).
  // Sin entregas no hay nada que devolver, y el hábito se regalaba a quien no había trabajado.
  if (returnedToday === null || returnedToday === undefined) {
    habits.SIN_DEVOLUCION = null;
    evidence.SIN_DEVOLUCION = 'Sin lectura de devoluciones ese día.';
  } else if (!closedTasks.length && Number(returnedToday) === 0) {
    habits.SIN_DEVOLUCION = null;
    evidence.SIN_DEVOLUCION = 'Sin entregas ese día.';
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

  // Hábitos por área (Rodny, 12 de noviembre de 2026): las fuentes de Parrillas, el CRM, Pautas y Financiero.
  // «Al día» del área solo se juega si ese día quedó registro de trabajo: sin trabajo, no se regala.
  if (areaChecks) {
    const checks = habits.TRABAJO_REGISTRADO === true ? areaChecks : { ...areaChecks, AL_DIA: [] };
    for (const [key, list] of Object.entries(checks)) for (const check of (list || []).filter(Boolean)) {
      units[key] = units[key] || { ok: 0, total: 0 };
      units[key].total += 1;
      if (check.ok === true) units[key].ok += 1;
    }
    mergeAreaChecks(habits, evidence, checks);
  }
  // La parte cumplida de cada hábito perdido, para pagar esa parte (3 de 4 a tiempo vale 4 de 5 puntos).
  const proportion = {};
  for (const [key, { ok, total }] of Object.entries(units)) if (habits[key] === false && total > 0 && ok > 0) proportion[key] = Math.round((ok / total) * 100) / 100;
  if (Object.keys(proportion).length) extras[PROPORTION_KEY] = proportion;

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
