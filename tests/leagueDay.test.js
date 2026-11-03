// Los cinco puntos de un día hábil (2 de noviembre de 2026): la regla pura que evalúa a una persona en un día con lo
// que la plataforma ya registra: sus cierres con sus relojes, sus sesiones, las vencidas con que amaneció y lo que le
// devolvieron. Un hábito que no se jugó es `null` y nunca resta; un juicio nunca aparece en la evidencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeagueDay, isoWeekKey, openWindowOf, bogotaTimeOf, MIN_MEASURED_MS, FORGOTTEN_SESSION_MS } from '../src/lib/leagueDay.js';

const DAY = '2026-11-03';
const task = (over = {}) => ({ id: 't1', title: 'Reel', completedAt: `${DAY}T20:10:00.000Z`, originalDueDate: `${DAY}T12:00:00.000Z`, measuredMs: 45 * 60_000, declared: false, documented: true, ...over });
const session = (over = {}) => ({ durationMs: 45 * 60_000, isOverlapping: false, correctedAt: null, closeReason: 'PAUSED', ...over });

test('Documentado belongs to tasks created with context, independently of closing tasks', () => {
  assert.equal(evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }] }).habits.DOCUMENTADO, true);
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()] }).habits.DOCUMENTADO, null);
  const mixed = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }, { documented: false }], closedTasks: [task()] });
  assert.equal(mixed.habits.DOCUMENTADO, false);
  assert.match(mixed.evidence.DOCUMENTADO, /1 de 2 tareas creadas/);
});

test('a clean day earns the five points, each with its evidence in Spanish', () => {
  const out = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }], closedTasks: [task()], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.deepEqual(out.habits, { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true });
  assert.deepEqual(out.extras, { PRIMERO_EN_ABRIR: null, PRIMERO_EN_REUNION: null }, 'the extras travel beside the habits');
  assert.match(out.evidence.RELOJ, /1 cierre con cronómetro/);
  assert.match(out.evidence.AL_DIA, /sin vencidas/);
  for (const text of Object.values(out.evidence)) assert.doesNotMatch(text, /lento|flojo|mal\b/i);
});

test('a day without closings leaves clock, on-time and documented out of play, and the others still count', () => {
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [], sessions: [], overdueAtDawn: 2, returnedToday: 0 });
  assert.deepEqual(out.habits, { RELOJ: null, AL_DIA: false, A_TIEMPO: null, DOCUMENTADO: null, SIN_DEVOLUCION: true });
  assert.match(out.evidence.AL_DIA, /2 vencidas/);
});

test('without a dawn snapshot or a returns reading nothing is assumed', () => {
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session()], overdueAtDawn: null, returnedToday: null });
  assert.equal(out.habits.AL_DIA, null);
  assert.equal(out.habits.SIN_DEVOLUCION, null);
});

test('the clock point: declared time, a forgotten clock, an overlapping session or a correction lose it', () => {
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: true })], sessions: [session({ closeReason: 'DECLARED' })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false);
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: MIN_MEASURED_MS - 1 })], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'under ten minutes is not measured');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ durationMs: FORGOTTEN_SESSION_MS + 1 })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'a clock left running');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ isOverlapping: true })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'two clocks at once');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ correctedAt: `${DAY}T21:00:00.000Z` })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'an administrator had to fix it');
  // Sessions without a closing still play the clock point (a collaborator who worked and closed nothing).
  const only = evaluateLeagueDay({ day: DAY, closedTasks: [], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(only.habits.RELOJ, true);
  assert.equal(only.habits.A_TIEMPO, null);
});

test('on time compares the Bogotá day of the closing with the date the task was born with, never the current date', () => {
  const late = task({ completedAt: '2026-11-04T03:30:00.000Z', originalDueDate: `${DAY}T12:00:00.000Z` }); // 22:30 Bogotá del 3: a tiempo
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [late], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, true);
  const moved = task({ completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-02T12:00:00.000Z', dueDate: `${DAY}T12:00:00.000Z` });
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [moved], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, false, 'moving the due date does not help');
  const undated = task({ originalDueDate: null, dueDate: null });
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [undated], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, null, 'no date, nothing to compare');
  const mixed = evaluateLeagueDay({ day: DAY, closedTasks: [task(), task({ id: 't2', completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-01T12:00:00.000Z' })], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(mixed.habits.A_TIEMPO, false, 'every closing of the day has to be on time');
  assert.match(mixed.evidence.A_TIEMPO, /1 de 2/);
});

test('documented and returns', () => {
  const out = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: false }], closedTasks: [task({ documented: false })], sessions: [session()], overdueAtDawn: 0, returnedToday: 1 });
  assert.equal(out.habits.DOCUMENTADO, false);
  assert.equal(out.habits.SIN_DEVOLUCION, false);
  assert.match(out.evidence.SIN_DEVOLUCION, /1 tarea devuelta/);
});

test('the extras: first to open from 8:00 goes to one person with the time; meeting points are supplied by the separate admin register', () => {
  const opener = { memberId: 'm-helen', name: 'Helen', at: `${DAY}T13:04:00.000Z` }; // 8:04 Bogotá
  const helen = evaluateLeagueDay({ day: DAY, memberId: 'm-helen', firstOpener: opener });
  assert.equal(helen.extras.PRIMERO_EN_ABRIR, true);
  assert.match(helen.evidence.PRIMERO_EN_ABRIR, /Abrió primero, a las 08:04/);
  const rodny = evaluateLeagueDay({ day: DAY, memberId: 'm-rodny', firstOpener: opener });
  assert.equal(rodny.extras.PRIMERO_EN_ABRIR, false);
  assert.match(rodny.evidence.PRIMERO_EN_ABRIR, /Helen abrió primero, a las 08:04/);
  assert.equal(evaluateLeagueDay({ day: DAY, memberId: 'm-rodny', firstOpener: null }).extras.PRIMERO_EN_ABRIR, null, 'nobody opened: not played');
  assert.equal(evaluateLeagueDay({ day: DAY, memberId: 'm-rodny' }).extras.PRIMERO_EN_ABRIR, null, 'no reading: nothing assumed');
  assert.equal(helen.extras.PRIMERO_EN_REUNION, null);
  assert.match(helen.evidence.PRIMERO_EN_REUNION, /administrador/);
  assert.deepEqual(openWindowOf(DAY), { start: new Date(`${DAY}T13:00:00.000Z`), end: new Date('2026-11-04T05:00:00.000Z') }, 'from 8:00 Bogotá to midnight');
  assert.equal(bogotaTimeOf(`${DAY}T13:04:00.000Z`), '08:04');
});

test('the ISO week of a Bogotá day, for the weekly gift', () => {
  assert.equal(isoWeekKey('2026-11-02'), '2026-W45');
  assert.equal(isoWeekKey('2026-11-08'), '2026-W45', 'Sunday closes the week');
  assert.equal(isoWeekKey('2026-11-09'), '2026-W46');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
});
