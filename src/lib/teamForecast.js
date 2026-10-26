// Previsión de compromisos, no una promesa de entrega. Capacidad nominal; no descuenta reuniones ni ausencias.
import { bogotaDate } from './colombiaBusinessDays.js';
import { nextWorkingDays, LOAD_CAPACITY_MS } from './teamLoad.js';
import { RHYTHM_LIMITS } from './teamRhythm.js';
import { contextualBaseline, RHYTHM_POLICY } from './workPrediction.js';

const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const dayCapacity = (day, now, until = `${day}T18:00:00-05:00`) => {
  const start = Math.max(new Date(`${day}T08:00:00-05:00`).getTime(), new Date(now).getTime());
  const end = Math.min(new Date(`${day}T18:00:00-05:00`).getTime(), new Date(until).getTime());
  return Math.round(Math.max(0, end - start) * 0.8);
};

/** Solo sesiones del ciclo abierto, de quien tiene ahora la tarea y sin relojes duplicados u olvidados. */
export function reliableSpentMs(task, now) {
  return (task.workSessions || []).reduce((total, session) => {
    if (session.workerId !== task.personId || session.isCollaborator || session.isOverlapping || session.cycle?.closedAt) return total;
    const elapsed = session.endedAt == null && session.startedAt
      ? new Date(now) - new Date(session.startedAt)
      : Number(session.durationMs ?? (new Date(session.endedAt) - new Date(session.startedAt)));
    // Una sesión corregida por un administrador cuenta aunque pase de 8 h: ya la miró una persona.
    return Number.isFinite(elapsed) && elapsed > 0 && (elapsed < RHYTHM_LIMITS.forgottenSessionMs || session.correctedAt) ? total + elapsed : total;
  }, 0);
}

function remainingEstimate(task, rhythm, now, incomplete) {
  const context = contextualBaseline(task, rhythm);
  const spentMs = reliableSpentMs(task, now);
  const clockProblem = (task.workSessions || []).some(s => !s.cycle?.closedAt && (s.workerId !== task.personId || s.isOverlapping || s.isCollaborator ||
    (s.durationMs != null && (!Number.isFinite(Number(s.durationMs)) || Number(s.durationMs) < 0)) ||
    (s.startedAt && (!Number.isFinite(new Date(s.startedAt).getTime()) || new Date(s.startedAt) > new Date(now) || (s.endedAt && (!Number.isFinite(new Date(s.endedAt).getTime()) || new Date(s.endedAt) < new Date(s.startedAt))))) ||
    (!s.correctedAt && Number(s.durationMs ?? (s.startedAt ? new Date(s.endedAt || now) - new Date(s.startedAt) : NaN)) >= RHYTHM_LIMITS.forgottenSessionMs)));
  const qualified = context?.confidence === 'suficiente';
  const needsReview = Boolean(qualified && spentMs >= context.medianMs);
  const usable = qualified && !incomplete && !needsReview && !task.sharedWork && !clockProblem;
  return { remainingMs: usable ? context.medianMs - spentMs : null, upperMs: usable ? context.p75Ms - spentMs : null,
    spentMs, source: usable ? 'persona' : 'sin_estimacion', confidence: usable ? 'suficiente' : 'baja',
    reason: incomplete ? 'consulta_incompleta' : task.sharedWork ? 'responsabilidad_compartida' : clockProblem ? 'cronometro_no_fiable' : needsReview ? 'avance_desconocido' : context?.reason || (qualified ? null : 'sin_historial'),
    basis: usable ? context.basis : null, complexity: task.complexity || null, sample: context?.measured || 0, needsReview };
}

export function buildTeamForecast({ people = [], tasks = [], rhythm = {}, now = new Date(), incomplete = false, window = 'week' } = {}) {
  const today = bogotaDate(now);
  const horizon = nextWorkingDays(today, 15);
  const first = new Date(`${today}T12:00:00Z`);
  const sunday = new Date(first); sunday.setUTCDate(first.getUTCDate() + (7 - first.getUTCDay()) % 7);
  const currentEnd = sunday.toISOString().slice(0, 10);
  let days = horizon.filter((day) => day <= currentEnd), periodEnd = currentEnd;
  if (window === 'today') { days = horizon.filter(day => day === today); periodEnd = today; }
  if (window === 'tomorrow') days = [nextWorkingDays(new Date(new Date(`${today}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0,10), 1)[0]];
  if (window === 'tomorrow') periodEnd = days[0];
  if (window === 'next_week') {
    const date = new Date(`${today}T12:00:00Z`), weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 8 - weekday);
    const start = date.toISOString().slice(0,10); date.setUTCDate(date.getUTCDate() + 6);
    const end = date.toISOString().slice(0,10); days = horizon.filter(day => day >= start && day <= end); periodEnd = end;
  }
  const weekEnd = periodEnd;
  const periodCapacityMs = days.reduce((total, day) => total + dayCapacity(day, now), 0);
  const capacityMs = horizon.filter(day => day <= weekEnd).reduce((total, day) => total + dayCapacity(day, now), 0);
  const rows = people.map((person) => {
    const own = tasks.filter((task) => task.personId === person.personId).map((task) => ({
      id: task.id, title: task.title, clientId: task.clientId || null, clientName: task.clientName, workType: task.workType, dueDay: task.dueDay,
      status: task.status, temporal: task.temporal || null, scheduledDay: task.deadlineAt ? bogotaDate(task.deadlineAt) : task.dueDay || null,
      deadlineAt: task.deadlineAt ? new Date(task.deadlineAt).toISOString() : null, deadlineSource: task.deadlineSource || 'fecha',
      ...remainingEstimate(task, rhythm, now, incomplete)
    })).sort((a, b) => (a.deadlineAt || `${a.scheduledDay || '9999'}T23:00:00Z`).localeCompare(b.deadlineAt || `${b.scheduledDay || '9999'}T23:00:00Z`) || a.id.localeCompare(b.id));
    let committed = 0, upper = 0, queueComplete = !incomplete && !own.some(t => !t.dueDay);
    const dated = own.filter((task) => task.scheduledDay && task.scheduledDay <= horizon.at(-1));
    const limitOf = task => task.deadlineAt || new Date(`${task.scheduledDay}T18:00:00-05:00`).toISOString();
    for (const deadline of [...new Set(dated.map(limitOf))]) {
      const group = dated.filter(task => limitOf(task) === deadline);
      const day = group[0].scheduledDay;
      queueComplete = queueComplete && group.every(t => t.remainingMs !== null);
      committed += sum(group, 'remainingMs'); upper += sum(group, 'upperMs');
      const capacity = horizon.filter((d) => d <= day).reduce((total, d) => total + dayCapacity(d, now, deadline), 0);
      for (const task of group) {
        task.capacityToDeadlineMs = capacity;
        task.queueComplete = queueComplete;
        task.committedToDeadlineMs = queueComplete ? committed : null;
        task.committedUpperToDeadlineMs = queueComplete ? upper : null;
        task.risk = day < today || (task.deadlineAt && new Date(task.deadlineAt) < new Date(now)) ? 'vencida' : !queueComplete ? null : committed > capacity ? 'riesgo' : upper > capacity || committed >= capacity * 0.9 ? 'ajustada' : 'ok';
      }
    }
    const week = dated.filter((task) => task.scheduledDay <= weekEnd);
    const undatedCount = own.filter((task) => !task.dueDay).length;
    const overdueCount = week.filter((task) => task.risk === 'vencida').length;
    const riskCount = week.filter((task) => task.risk === 'riesgo').length;
    const tightCount = week.filter((task) => task.risk === 'ajustada').length;
    const unknownCount = own.filter(t => !t.dueDay || (t.scheduledDay <= weekEnd && t.remainingMs === null)).length;
    const remainingMs = unknownCount || incomplete ? null : sum(week, 'remainingMs'), upperMs = unknownCount || incomplete ? null : sum(week, 'upperMs');
    const confidence = !incomplete && !undatedCount && week.length > 0 && week.every((task) => task.confidence === 'suficiente') ? 'suficiente' : 'baja';
    const availableMs = !queueComplete || own.some(t => t.remainingMs === null) ? null : Math.max(0, Math.min(capacityMs - upperMs, ...dated.filter(t => t.capacityToDeadlineMs !== undefined).map(t => t.capacityToDeadlineMs - t.committedUpperToDeadlineMs)));
    const canReceive = confidence === 'suficiente' && dated.every(t => t.confidence === 'suficiente') && !overdueCount && !riskCount && !tightCount && availableMs >= LOAD_CAPACITY_MS / 2;
    const status = overdueCount || riskCount ? 'revisar' : confidence === 'baja' ? 'sin_datos' : tightCount ? 'ajustada' : canReceive ? 'con_espacio' : 'al_dia';
    const clock = rhythm.hours?.find(row => row.personId === person.personId);
    const currentWeek = new Date(`${today}T12:00:00Z`); currentWeek.setUTCDate(currentWeek.getUTCDate() - (currentWeek.getUTCDay() || 7) + 1);
    return { ...person, tasks: own, remainingMs, upperMs, capacityMs, availableMs, canReceive, confidence, status, overdueCount, riskCount, tightCount, undatedCount, unknownCount,
      recordedTodayMs: clock?.days.find(d => d.day === today)?.measuredMs || 0,
      recordedWeekMs: clock?.weeks.find(w => w.week === currentWeek.toISOString().slice(0,10))?.measuredMs || 0,
      hoursIncomplete: Boolean(rhythm.hoursIncomplete),
      dueCount: week.filter((task) => task.scheduledDay >= (days[0] || today)).length, nextDueDay: dated.find((task) => task.scheduledDay >= today)?.scheduledDay || null };
  });
  return { policy: RHYTHM_POLICY, generatedAt: new Date(now).toISOString(), today, days, weekEnd, window, nextWeek: window === 'next_week', incomplete, capacityMs, periodCapacityMs, people: rows,
    summary: { dueCount: sum(rows, 'dueCount'), overdueCount: sum(rows, 'overdueCount'), riskCount: sum(rows, 'riskCount'),
      attentionCount: rows.reduce((n, p) => n + p.overdueCount + p.riskCount + p.tightCount, 0),
      withSpace: rows.filter((p) => p.canReceive).length, undatedCount: sum(rows, 'undatedCount'), unknownCount: sum(rows, 'unknownCount') } };
}
