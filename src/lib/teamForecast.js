// Previsión de compromisos, no una promesa de entrega. Capacidad nominal; no descuenta reuniones ni ausencias.
import { bogotaDate } from './colombiaBusinessDays.js';
import { nextWorkingDays, LOAD_CAPACITY_MS, DEFAULT_ESTIMATE_MS } from './teamLoad.js';
import { isComparableWork, RHYTHM_LIMITS } from './teamRhythm.js';

const H = 3_600_000;
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const dayCapacity = (day, now) => {
  if (day !== bogotaDate(now)) return LOAD_CAPACITY_MS;
  const clock = new Date(new Date(now).getTime() - 5 * H);
  const hour = clock.getUTCHours() + clock.getUTCMinutes() / 60;
  // Distribuye la jornada nominal de 8 h en la franja operativa 8–18 de Bogotá.
  return Math.round(LOAD_CAPACITY_MS * Math.max(0, Math.min(1, (18 - hour) / 10)));
};

/** Solo sesiones del ciclo abierto, de quien tiene ahora la tarea y sin relojes duplicados u olvidados. */
export function reliableSpentMs(task, now) {
  return (task.workSessions || []).reduce((total, session) => {
    if (session.workerId !== task.personId || session.isCollaborator || session.isOverlapping || session.cycle?.closedAt) return total;
    const elapsed = session.endedAt == null && session.startedAt
      ? new Date(now) - new Date(session.startedAt)
      : Number(session.durationMs ?? (new Date(session.endedAt) - new Date(session.startedAt)));
    return Number.isFinite(elapsed) && elapsed > 0 && elapsed < RHYTHM_LIMITS.forgottenSessionMs ? total + elapsed : total;
  }, 0);
}

function remainingEstimate(task, rhythm, now) {
  const person = rhythm.people?.find((p) => p.personId === task.personId);
  const own = person?.byType?.find((t) => t.workType === task.workType);
  const team = rhythm.types?.find((t) => t.workType === task.workType);
  const baseline = own?.medianMs > 0 ? own : team?.medianMs > 0 ? team : null;
  const source = own?.medianMs > 0 ? 'persona' : baseline ? 'equipo' : 'supuesto';
  const typical = baseline?.medianMs || DEFAULT_ESTIMATE_MS;
  const spentMs = reliableSpentMs(task, now);
  // El reloj no mide porcentaje completado: al alcanzar la duración habitual aún queda trabajo por revisar.
  const floor = Math.max(15 * 60_000, typical * 0.25);
  const remainingMs = Math.max(floor, typical - spentMs);
  const upperMs = Math.max(remainingMs, (baseline?.p75Ms || typical) - spentMs);
  const confidence = baseline?.measured >= 3 && isComparableWork(task.workType) && (source !== 'persona' || person.coverage >= 0.5) && spentMs < typical ? 'suficiente' : 'baja';
  return { remainingMs, upperMs, spentMs, source, confidence, sample: baseline?.measured || 0, needsReview: spentMs >= typical };
}

export function buildTeamForecast({ people = [], tasks = [], rhythm = {}, now = new Date(), incomplete = false } = {}) {
  const today = bogotaDate(now);
  const horizon = nextWorkingDays(today, 10);
  const first = new Date(`${horizon[0]}T12:00:00Z`);
  const sunday = new Date(first); sunday.setUTCDate(first.getUTCDate() + (7 - first.getUTCDay()) % 7);
  const weekEnd = sunday.toISOString().slice(0, 10);
  const days = horizon.filter((day) => day <= weekEnd);
  const capacityMs = days.reduce((total, day) => total + dayCapacity(day, now), 0);
  const rows = people.map((person) => {
    const own = tasks.filter((task) => task.personId === person.personId).map((task) => ({
      id: task.id, title: task.title, clientName: task.clientName, workType: task.workType, dueDay: task.dueDay,
      status: task.status, scheduledDay: task.dueDay ? nextWorkingDays(task.dueDay, 1)[0] : null,
      ...remainingEstimate(task, rhythm, now)
    })).sort((a, b) => (a.scheduledDay || '9999').localeCompare(b.scheduledDay || '9999') || a.id.localeCompare(b.id));
    let committed = 0, upper = 0;
    const dated = own.filter((task) => task.scheduledDay && task.scheduledDay <= horizon.at(-1));
    for (const day of [...new Set(dated.map((task) => task.scheduledDay))]) {
      const group = dated.filter((task) => task.scheduledDay === day);
      committed += sum(group, 'remainingMs'); upper += sum(group, 'upperMs');
      const capacity = horizon.filter((d) => d <= day).reduce((total, d) => total + dayCapacity(d, now), 0);
      for (const task of group) {
        task.capacityToDeadlineMs = capacity;
        task.committedToDeadlineMs = committed;
        task.risk = day < today ? 'vencida' : committed > capacity ? 'riesgo' : upper > capacity || committed >= capacity * 0.9 ? 'ajustada' : 'ok';
      }
    }
    const week = dated.filter((task) => task.scheduledDay <= weekEnd);
    const undatedCount = own.filter((task) => !task.dueDay).length;
    const overdueCount = week.filter((task) => task.risk === 'vencida').length;
    const riskCount = week.filter((task) => task.risk === 'riesgo').length;
    const tightCount = week.filter((task) => task.risk === 'ajustada').length;
    const remainingMs = sum(week, 'remainingMs'), upperMs = sum(week, 'upperMs');
    const confidence = !incomplete && !undatedCount && week.length > 0 && week.every((task) => task.confidence === 'suficiente') ? 'suficiente' : 'baja';
    const availableMs = Math.max(0, capacityMs - upperMs);
    const canReceive = confidence === 'suficiente' && !overdueCount && !riskCount && !tightCount && availableMs >= LOAD_CAPACITY_MS / 2;
    const status = overdueCount || riskCount ? 'revisar' : confidence === 'baja' ? 'sin_datos' : tightCount ? 'ajustada' : canReceive ? 'con_espacio' : 'al_dia';
    return { ...person, tasks: own, remainingMs, upperMs, capacityMs, availableMs, canReceive, confidence, status, overdueCount, riskCount, tightCount, undatedCount,
      dueCount: week.filter((task) => task.scheduledDay >= today).length, nextDueDay: dated.find((task) => task.scheduledDay >= today)?.scheduledDay || null };
  });
  const todayDate = new Date(`${today}T12:00:00Z`);
  todayDate.setUTCDate(todayDate.getUTCDate() + (7 - todayDate.getUTCDay()) % 7);
  return { today, days, weekEnd, nextWeek: horizon[0] > todayDate.toISOString().slice(0, 10), incomplete, capacityMs, people: rows,
    summary: { dueCount: sum(rows, 'dueCount'), overdueCount: sum(rows, 'overdueCount'), riskCount: sum(rows, 'riskCount'),
      attentionCount: rows.reduce((n, p) => n + p.overdueCount + p.riskCount + p.tightCount, 0),
      withSpace: rows.filter((p) => p.canReceive).length, undatedCount: sum(rows, 'undatedCount') } };
}
