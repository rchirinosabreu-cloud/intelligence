// La liga del buen uso de la plataforma (27 de octubre, 2 y 3 de noviembre de 2026): puntos que se suman sin techo,
// 5 por cada hábito del día, 5 por cada extra del día (para una sola persona) y 10 por cada regalo del equipo.
// Regla pura compartida por la copa, la carrera, el aviso de las 3 y el cálculo del servidor. Nunca cuenta
// tareas; lo que no se jugó no resta; sin niveles ni barras.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_HABITS, EXTRA_ACTIONS, BADGE_THRESHOLD, HABIT_POINTS, EXTRA_POINTS, KUDOS_VALUE, KUDOS_MONTHLY,
  summarizeDays, habitsScore, kudosScore, leagueScore, habitRates, leagueNextStep, todayPoints, trackScale, trackPosition, leagueMonthLabel, ordinalLabel
} from '../src/lib/platformLeague.js';

const day = (values, extras = {}) => ({ day: '2026-11-03', habits: Object.fromEntries(DAILY_HABITS.map((h, i) => [h.key, values[i]])), extras });
const full = (value, count) => Array.from({ length: count }, () => day([value, value, value, value, value]));

test('five daily habits and two extras, each one described as a habit and never as a judgment; the values Rodny named', () => {
  assert.deepEqual(DAILY_HABITS.map((h) => h.key), ['RELOJ', 'AL_DIA', 'A_TIEMPO', 'DOCUMENTADO', 'SIN_DEVOLUCION']);
  assert.deepEqual(EXTRA_ACTIONS.map((e) => e.key), ['PRIMERO_EN_ABRIR', 'PRIMERO_EN_REUNION']);
  for (const item of [...DAILY_HABITS, ...EXTRA_ACTIONS]) {
    assert.ok(item.label && item.hint);
    assert.doesNotMatch(`${item.label} ${item.hint} ${item.step || ''}`, /lento|flojo|mal\b|rápido|mejor que/i);
  }
  assert.equal(HABIT_POINTS, 5);
  assert.equal(EXTRA_POINTS, 5, 'five points per extra action');
  assert.equal(KUDOS_MONTHLY, 10);
  assert.equal(KUDOS_VALUE, 10, 'a gift of the week is worth the ten points the giver had');
  assert.equal(EXTRA_ACTIONS[1].source, null, 'the meeting has no source yet: it is declared, not pretended');
});

test('the platform part adds 5 per habit earned and 5 per extra; a day without closings does not subtract', () => {
  assert.equal(habitsScore(full(true, 22)), 550);
  assert.equal(habitsScore(full(false, 22)), 0);
  assert.equal(habitsScore([]), null, 'nothing played yet: no score');
  const quiet = [day([true, true, null, null, null]), day([true, true, true, true, true], { PRIMERO_EN_ABRIR: true })];
  const summary = summarizeDays(quiet);
  assert.deepEqual({ earned: summary.earned, possible: summary.possible, fullDays: summary.fullDays, extras: summary.extras, points: summary.points }, { earned: 7, possible: 7, fullDays: 2, extras: 1, points: 40 });
  assert.equal(summary.perExtra.PRIMERO_EN_ABRIR, 1);
  assert.equal(habitsScore([day([null, null, null, null, null], { PRIMERO_EN_ABRIR: true })]), 5, 'an extra alone already counts');
  assert.equal(habitsScore([day([null, null, null, null, null], { PRIMERO_EN_ABRIR: false })]), null, 'losing the extra to someone else is not playing');
});

test('the team part counts gifts received at 10 each without a cap, and the month score adds both', () => {
  assert.equal(kudosScore([]), 0);
  assert.equal(kudosScore([{}, {}, {}]), 30);
  assert.equal(leagueScore({ days: full(true, 10), kudos: [{}, {}] }), 270);
  assert.equal(leagueScore({ days: [], kudos: [] }), null);
  assert.equal(leagueScore({ days: [], kudos: [{}] }), 10, 'a gift counts even before the first played day');
});

test('badges light from 90 % of the played days, and the next step is the habit that lost the most points', () => {
  assert.equal(BADGE_THRESHOLD, 0.9);
  const days = [
    ...Array.from({ length: 9 }, () => day([true, true, true, false, true])),
    day([true, false, true, false, true])
  ];
  const rates = Object.fromEntries(habitRates(days).map((h) => [h.key, h]));
  assert.equal(rates.RELOJ.badge, true);
  assert.equal(rates.AL_DIA.badge, true, '9 of 10 is exactly 90 %');
  assert.equal(rates.DOCUMENTADO.badge, false);
  assert.equal(rates.DOCUMENTADO.rate, 0);
  const step = leagueNextStep(days);
  assert.equal(step.key, 'DOCUMENTADO');
  assert.match(step.text, /avance|archivo/);
  assert.equal(step.lost, 50, 'ten days without the habit: fifty points');
  assert.equal(step.gain, HABIT_POINTS, 'what a day of the habit is worth');
  assert.equal(leagueNextStep(full(true, 5)), null, 'nothing to improve');
  assert.equal(leagueNextStep([]), null, 'without evidence there is no advice');
  assert.equal(habitRates([day([null, true, null, null, null])])[0].rate, null, 'a habit never played has no rate');
});

test('today’s points, the track scale, the month label and the ordinal', () => {
  assert.deepEqual(todayPoints(day([true, true, false, null, true], { PRIMERO_EN_ABRIR: true, PRIMERO_EN_REUNION: null })), { earned: 3, possible: 4, extrasEarned: ['PRIMERO_EN_ABRIR'], points: 20 });
  assert.deepEqual(todayPoints(undefined), { earned: 0, possible: 0, extrasEarned: [], points: 0 });
  const merged = { ...day([true, true, true, true, true], { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null }), ...todayPoints(day([true, true, true, true, true], { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null })) };
  assert.deepEqual(merged.extras, { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null }, 'spreading today’s points over the day keeps the extras object (the lost extra stays visible as lost)');
  assert.deepEqual(trackScale([35, 78, null]), { max: 100, marks: [0, 25, 50, 75, 100] }, 'never less than 100');
  assert.deepEqual(trackScale([310, 120]), { max: 350, marks: [0, 88, 175, 263, 350] }, 'the leader fits under a round ceiling');
  assert.equal(trackScale([]).max, 100);
  assert.equal(trackPosition(175, 350), 50);
  assert.equal(trackPosition(null, 350), 0);
  assert.equal(trackPosition(400, 350), 100, 'never past the finish line');
  assert.equal(leagueMonthLabel('2026-11'), 'noviembre');
  assert.equal(ordinalLabel(2), '2.º');
  assert.equal(ordinalLabel(2, 'F'), '2.ª');
});
