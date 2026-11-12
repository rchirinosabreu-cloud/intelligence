// El premio a la constancia (Rodny, 12 de noviembre de 2026: «dale» al segundo premio del mes). El puntaje premia el
// volumen: quien registra más cosas juega más hábitos. La constancia mide qué parte de lo jugado se cumplió, así que
// alguien con menos registros puede ganarla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_HABITS, constancyOf, constancyMinDays, constancyStandings, CONSTANCY_MIN_SHARE } from '../src/lib/platformLeague.js';

const day = (values, key = '2026-11-03') => ({ day: key, habits: Object.fromEntries(DAILY_HABITS.map((habit, i) => [habit.key, values[i] ?? null])) });

test('constancy is habits won over habits played; a habit that was not played never counts', () => {
  assert.deepEqual(constancyOf([]), { won: 0, played: 0, daysPlayed: 0, percent: null });
  const days = [day([true, true, false, null, true, true]), day([true, null, null, null, true, null], '2026-11-04'), day([null, null, null, null, null, null], '2026-11-05')];
  assert.deepEqual(constancyOf(days), { won: 6, played: 7, daysPlayed: 2, percent: 86 });
});

test('to enter, a person must have played at least 60 % of the closed days', () => {
  assert.equal(CONSTANCY_MIN_SHARE, 0.6);
  assert.equal(constancyMinDays(0), 0);
  assert.equal(constancyMinDays(1), 1);
  assert.equal(constancyMinDays(7), 5);
  assert.equal(constancyMinDays(20), 12);
});

test('standings: only who qualifies gets a rank; a perfect single day does not jump ahead of a steady month', () => {
  const people = [
    { id: 'elisa', name: 'Elisa', won: 4, played: 4, daysPlayed: 1, percent: 100 },
    { id: 'helen', name: 'Helen', won: 38, played: 40, daysPlayed: 7, percent: 95 },
    { id: 'melissa', name: 'Melissa', won: 34, played: 37, daysPlayed: 6, percent: 92 },
    { id: 'mariceth', name: 'Mariceth', won: 23, played: 25, daysPlayed: 5, percent: 92 },
    { id: 'brayan', name: 'Brayan', won: 0, played: 0, daysPlayed: 0, percent: null }
  ];
  const standings = constancyStandings(people, { closedDays: 7 });
  assert.equal(standings.minDays, 5);
  const by = Object.fromEntries(standings.lanes.map((lane) => [lane.id, lane]));
  assert.equal(by.elisa.qualifies, false, 'one perfect day out of seven does not enter');
  assert.equal(by.elisa.score, 0);
  assert.equal(by.elisa.rank, null);
  assert.deepEqual([by.helen.rank, by.melissa.rank, by.mariceth.rank], [1, 2, 2], 'ties share their place');
  assert.equal(by.helen.score, 95);
  assert.equal(by.brayan.qualifies, false);
  assert.deepEqual(standings.lanes.map((lane) => lane.id), ['helen', 'mariceth', 'melissa', 'elisa', 'brayan'], 'qualified first by percent, then the rest');
  assert.deepEqual(constancyStandings(people, { closedDays: 0 }).lanes.every((lane) => !lane.qualifies), true, 'without closed days nobody is ranked');
});
