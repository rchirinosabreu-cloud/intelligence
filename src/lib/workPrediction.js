import { RHYTHM_LIMITS, isComparableWork } from './teamRhythm.js';
import { bogotaDate } from './colombiaBusinessDays.js';

export const predictionComplexity = value => ['BAJA', 'MEDIA', 'ALTA'].includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : null;
const median = values => { const a = [...values].sort((x, y) => x - y), mid = Math.floor(a.length / 2); return a.length ? a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2 : 0; };
function statistics(rows) {
  const durationsMs = rows.flatMap(row => row.durationsMs || []);
  const ordered = [...durationsMs].sort((a, b) => a - b);
  const closed = rows.reduce((n, r) => n + r.closed, 0);
  return { closed, measured: ordered.length, coverage: closed ? ordered.length / closed : 0, durationsMs,
    meanMs: ordered.length ? ordered.reduce((s, v) => s + v, 0) / ordered.length : 0,
    medianMs: median(ordered), p75Ms: ordered[Math.max(0, Math.ceil(ordered.length * 0.75) - 1)] || 0 };
}

/** Una muestra por persona y tarea, sin mezclar clientes o complejidades. No cuenta un reloj olvidado. */
export function buildContextProfiles(records = []) {
  const groups = new Map();
  for (const record of records) {
    if (record.isPrivate || record.isCollaborator || record.partialResponsibility) continue;
    const complexity = predictionComplexity(record.complexity);
    const key = JSON.stringify([record.personId, record.workType, record.clientId || null, complexity]);
    if (!groups.has(key)) groups.set(key, { personId: record.personId, personName: record.personName, workType: record.workType,
      clientId: record.clientId || null, clientName: record.clientName || null, complexity, closed: 0, durationsMs: [] });
    const row = groups.get(key); row.closed++;
    if (record.measuredMs >= RHYTHM_LIMITS.minMeasuredMs && (record.longestSessionMs || 0) < RHYTHM_LIMITS.forgottenSessionMs) row.durationsMs.push(record.measuredMs);
  }
  return [...groups.values()].map(row => ({ ...row, ...statistics([row]) }));
}

/** La muestra más cercana con suficiente historia, antes de ampliar el contexto. Siempre devuelve su alcance. */
export function contextualBaseline(task, rhythm = {}) {
  const profiles = (rhythm.profiles || []).filter(p => p.workType === task.workType && p.measured > 0);
  if (!profiles.length) return null;
  const complexity = predictionComplexity(task.complexity);
  const own = p => p.personId === task.personId;
  const client = p => task.clientId && p.clientId === task.clientId;
  const level = p => complexity && p.complexity === complexity;
  const choices = [
    ['persona_cliente_complejidad', p => own(p) && client(p) && level(p)],
    ['persona_complejidad', p => own(p) && level(p)],
    ['equipo_cliente_complejidad', p => client(p) && level(p)],
    ['equipo_complejidad', level],
    ['persona_tipo', own], ['equipo_tipo', () => true]
  ].map(([basis, match]) => ({ basis, ...statistics(profiles.filter(match)) })).filter(row => row.measured);
  const selected = choices.find(row => row.measured >= 3) || choices[0];
  if (!selected) return null;
  return { ...selected, source: selected.basis.startsWith('persona') ? 'persona' : 'equipo',
    confidence: selected.measured >= 3 && selected.coverage >= 0.5 && isComparableWork(task.workType) &&
      selected.basis === 'persona_cliente_complejidad' ? 'suficiente' : 'baja' };
}

export function workWeekStart(day) {
  const date = new Date(`${day}T12:00:00Z`), weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

/** Distribuye el tiempo por el tramo en que ocurrió, no por el día de cierre de la tarea. */
export function recordedWorkHours({ sessions = [], from, now = new Date() }) {
  const rows = new Map(), until = new Date(now).getTime(), cutoff = new Date(from).getTime();
  for (const session of sessions) {
    if (!session.workerId) continue;
    if (!rows.has(session.workerId)) rows.set(session.workerId, { personId: session.workerId, days: new Map(), excludedSessions: 0 });
    const row = rows.get(session.workerId);
    const start = new Date(session.startedAt).getTime(), end = session.endedAt ? new Date(session.endedAt).getTime() : until;
    const span = end - start, duration = session.endedAt ? Number(session.durationMs ?? span) : span;
    const declared = session.closeReason === 'DECLARED';
    if (session.isOverlapping || (!declared && duration >= RHYTHM_LIMITS.forgottenSessionMs) || !Number.isFinite(span) || span <= 0 || !Number.isFinite(duration) || duration < 0) { row.excludedSessions++; continue; }
    let cursor = Math.max(start, cutoff);
    const stop = Math.min(end, until);
    while (cursor < stop) {
      const day = bogotaDate(new Date(cursor));
      const midnight = new Date(`${day}T00:00:00-05:00`).getTime() + 86400000;
      const next = Math.min(stop, midnight);
      const cell = row.days.get(day) || { day, measuredMs: 0, declaredMs: 0 };
      cell[declared ? 'declaredMs' : 'measuredMs'] += (next - cursor) * duration / span;
      row.days.set(day, cell); cursor = next;
    }
  }
  return [...rows.values()].map(row => {
    const days = [...row.days.values()].sort((a,b) => a.day.localeCompare(b.day));
    const weeks = new Map();
    for (const cell of days) {
      const week = workWeekStart(cell.day), total = weeks.get(week) || { week, measuredMs: 0, declaredMs: 0 };
      total.measuredMs += cell.measuredMs; total.declaredMs += cell.declaredMs; weeks.set(week, total);
    }
    return { ...row, days, weeks: [...weeks.values()] };
  });
}
