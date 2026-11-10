// Ritmo en gráficos (Rodny, 10 de noviembre de 2026: «necesitamos tener más gráficos, como está ahorita hay muchos
// datos sin sentido»). La previsión de horas futuras estima pocas tareas (4 de 104 ese día) porque sus reglas son
// estrictas a propósito; esta vista muestra solo lo seguro: horas registradas, entregas por día, vencidas y cuánto se
// usa el cronómetro. Lógica pura: la pantalla solo dibuja. Nunca un juicio sobre una persona.

import { bogotaDate } from './colombiaBusinessDays.js';

const H = 3_600_000;
export const HEATMAP_DAYS = 5;
export const UNMEASURED_COVERAGE = 0.7;
export const UNMEASURED_MIN_CLOSED = 3;
export const WEEKS_SHOWN = 12;

const round1 = (value) => Math.round(value * 10) / 10;
const hours = (ms) => round1((Number(ms) || 0) / H);

/** El nombre corto de cada persona; si dos comparten el primero, el completo. */
export const displayNames = (names = []) => {
  const firsts = names.map((name) => String(name || '').trim().split(/\s+/)[0]);
  return Object.fromEntries(names.map((name, i) => [name, firsts.filter((first) => first === firsts[i]).length > 1 ? name : firsts[i]]));
};

const mondayOf = (day) => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return new Date(Date.parse(`${day}T12:00:00Z`) - ((weekday + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const top = (rows, key) => rows.reduce((best, row) => (row[key] > (best?.[key] ?? 0) ? row : best), null);

// rhythm trae las horas por semana (90 días); recent, la cobertura del cronómetro del último mes: medirla en 90 días
// arrastra los meses en que todavía no se usaba y casi todo el equipo saldría «sin cronómetro».
export const buildWeekCharts = ({ load = null, rhythm = null, recent = null, now = new Date() } = {}) => {
  const today = bogotaDate(now);
  const currentWeek = mondayOf(today);
  const people = load?.forecast?.people || [];
  const coverageSource = recent || rhythm;
  const allNames = [...new Set([...people.map((p) => p.personName), ...(coverageSource?.people || []).map((p) => p.personName), ...(rhythm?.hours || []).map((p) => p.personName)].filter(Boolean))];
  const short = displayNames(allNames);
  const nameOf = (person) => short[person.personName] || person.personName;

  const days = (load?.days || []).map((day) => (typeof day === 'string' ? day : day?.day)).filter((day) => day && day >= today).slice(0, HEATMAP_DAYS);
  const rows = people.map((person) => ({
    name: nameOf(person),
    counts: days.map((day) => (person.tasks || []).filter((task) => task.dueDay === day).length),
    overdue: Number(person.overdueCount) || 0
  })).filter((row) => row.overdue || row.counts.some(Boolean))
    .sort((a, b) => (b.counts.reduce((s, n) => s + n, 0) + b.overdue) - (a.counts.reduce((s, n) => s + n, 0) + a.overdue) || a.name.localeCompare(b.name, 'es'));

  const byWeek = new Map();
  for (const person of rhythm?.hours || []) {
    for (const row of person.weeks || []) byWeek.set(row.week, (byWeek.get(row.week) || 0) + (Number(row.measuredMs) || 0) + (Number(row.declaredMs) || 0));
  }
  // La semana más vieja del periodo casi nunca está completa (90 días no empiezan un lunes): se deja fuera.
  const windowStart = rhythm?.period?.days ? new Date(Date.parse(`${today}T12:00:00Z`) - (rhythm.period.days - 1) * 86_400_000).toISOString().slice(0, 10) : null;
  const weeklyHours = [...byWeek.entries()].filter(([week]) => !windowStart || week >= windowStart).sort(([a], [b]) => a.localeCompare(b)).slice(-WEEKS_SHOWN)
    .map(([week, ms]) => ({ week, hours: Math.round(ms / H), current: week === currentWeek }));
  const usual = median(weeklyHours.filter((row) => !row.current).map((row) => row.hours));

  const dueRows = people.map((person) => ({ name: nameOf(person), count: Number(person.dueCount) || 0 }));
  const overdueRows = people.map((person) => ({ name: nameOf(person), count: Number(person.overdueCount) || 0 }));
  const mostDue = top(dueRows, 'count');
  const mostOverdue = top(overdueRows, 'count');

  const unmeasured = (coverageSource?.people || [])
    .filter((person) => person.closed >= UNMEASURED_MIN_CLOSED && person.measured / person.closed < UNMEASURED_COVERAGE)
    .map((person) => ({ name: nameOf(person), coverage: round1(person.measured / person.closed * 100) / 100, closed: person.closed }))
    .sort((a, b) => a.coverage - b.coverage || b.closed - a.closed);

  return {
    today,
    stats: {
      weekHours: round1(people.reduce((sum, person) => sum + (Number(person.recordedWeekMs) || 0), 0) / H),
      usualWeekHours: usual == null ? null : Math.round(usual),
      due: dueRows.reduce((sum, row) => sum + row.count, 0),
      mostDue: mostDue && mostDue.count ? mostDue : null,
      overdue: overdueRows.reduce((sum, row) => sum + row.count, 0),
      mostOverdue: mostOverdue && mostOverdue.count ? mostOverdue : null,
      coverage: coverageSource?.team?.coverage ?? null
    },
    heatmap: { days, rows },
    hoursByPerson: people.map((person) => ({ name: nameOf(person), hours: hours(person.recordedWeekMs) })).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es')),
    weeklyHours,
    unmeasured
  };
};
