// Ritmo en gráficos (Rodny, 10 de noviembre de 2026: «necesitamos tener más gráficos, como está ahorita hay muchos
// datos sin sentido»). Solo lo que es seguro: horas registradas, entregas por día, vencidas y uso del cronómetro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekCharts, displayNames } from '../src/lib/teamWeekCharts.js';

const H = 3_600_000;
const NOW = new Date('2026-11-10T17:00:00.000Z'); // martes 10 de noviembre, 12:00 en Bogotá

const load = {
  days: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-17', '2026-11-18'],
  forecast: { people: [
    { personId: 'k', personName: 'Kamila del Toro', recordedWeekMs: 8.7 * H, dueCount: 8, overdueCount: 0, tasks: [{ dueDay: '2026-11-10' }, { dueDay: '2026-11-10' }, { dueDay: '2026-11-11' }, { dueDay: '2026-11-09' }] },
    { personId: 'f', personName: 'Francisco Villa', recordedWeekMs: 4.7 * H, dueCount: 1, overdueCount: 10, tasks: [{ dueDay: '2026-11-17' }] },
    { personId: 'b', personName: 'Brayan Ruiz', recordedWeekMs: 0, dueCount: 0, overdueCount: 0, tasks: [] }
  ] }
};
const week = (w, h) => ({ week: w, measuredMs: h * H, declaredMs: 0 });
const rhythm = {
  team: { closed: 100, measured: 84, coverage: 0.84 },
  people: [
    { personId: 'k', personName: 'Kamila del Toro', closed: 30, measured: 22 },
    { personId: 'd', personName: 'David Rodríguez', closed: 4, measured: 0 },
    { personId: 'j', personName: 'Jarlan Paz', closed: 2, measured: 0 },
    { personId: 'f', personName: 'Francisco Villa', closed: 33, measured: 33 }
  ],
  hours: [
    { personId: 'k', personName: 'Kamila del Toro', weeks: [week('2026-10-19', 30), week('2026-10-26', 40), week('2026-11-02', 35), week('2026-11-09', 9)] },
    { personId: 'f', personName: 'Francisco Villa', weeks: [week('2026-10-19', 20), week('2026-10-26', 30), week('2026-11-02', 25), week('2026-11-09', 5)] }
  ]
};

test('las cifras de arriba: horas de la semana frente a lo normal, entregas y vencidas', () => {
  const { stats } = buildWeekCharts({ load, rhythm, now: NOW });
  assert.equal(stats.weekHours, 13.4);
  assert.equal(stats.usualWeekHours, 60, 'mediana de las semanas completas anteriores, sin la semana en curso');
  assert.equal(stats.due, 9);
  assert.deepEqual(stats.mostDue, { name: 'Kamila', count: 8 });
  assert.equal(stats.overdue, 10);
  assert.deepEqual(stats.mostOverdue, { name: 'Francisco', count: 10 });
  assert.equal(stats.coverage, 0.84);
});

test('el mapa de entregas: próximos cinco días hábiles, una fila por persona con algo, más cargada arriba', () => {
  const { heatmap } = buildWeekCharts({ load, rhythm, now: NOW });
  assert.deepEqual(heatmap.days, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-17']);
  assert.deepEqual(heatmap.rows.map(row => [row.name, row.counts, row.overdue]), [
    ['Francisco', [0, 0, 0, 0, 1], 10],
    ['Kamila', [2, 1, 0, 0, 0], 0]
  ]);
  assert.ok(!heatmap.rows.some(row => row.name === 'Brayan'), 'quien no tiene entregas ni vencidas no ocupa una fila');
});

test('horas por persona de mayor a menor; horas del equipo por semana con la semana en curso marcada', () => {
  const charts = buildWeekCharts({ load, rhythm, now: NOW });
  assert.deepEqual(charts.hoursByPerson.map(row => [row.name, row.hours]), [['Kamila', 8.7], ['Francisco', 4.7], ['Brayan', 0]]);
  assert.deepEqual(charts.weeklyHours, [
    { week: '2026-10-19', hours: 50, current: false },
    { week: '2026-10-26', hours: 70, current: false },
    { week: '2026-11-02', hours: 60, current: false },
    { week: '2026-11-09', hours: 14, current: true }
  ]);
});

test('quién casi no usa el cronómetro: con tres cerradas o más y menos del 70 % medido', () => {
  const { unmeasured } = buildWeekCharts({ load, rhythm, now: NOW });
  assert.deepEqual(unmeasured, [{ name: 'David', coverage: 0, closed: 4 }]);
});

test('la cobertura sale del último mes y la semana incompleta del inicio del periodo no se dibuja', () => {
  const recent = { team: { closed: 50, measured: 45, coverage: 0.9 }, people: [{ personId: 'k', personName: 'Kamila del Toro', closed: 10, measured: 9 }] };
  const charts = buildWeekCharts({ load, rhythm: { ...rhythm, period: { days: 21 } }, recent, now: NOW });
  assert.equal(charts.stats.coverage, 0.9);
  assert.deepEqual(charts.unmeasured, []);
  // 21 días hasta el 10 de noviembre empiezan el 21 de octubre: la semana del 19 queda fuera.
  assert.deepEqual(charts.weeklyHours.map(row => row.week), ['2026-10-26', '2026-11-02', '2026-11-09']);
});

test('sin datos no se inventa nada', () => {
  const empty = buildWeekCharts({ load: null, rhythm: null, now: NOW });
  assert.equal(empty.stats.weekHours, 0);
  assert.equal(empty.stats.usualWeekHours, null);
  assert.equal(empty.stats.coverage, null);
  assert.deepEqual(empty.heatmap.rows, []);
  assert.deepEqual(empty.weeklyHours, []);
});

test('dos personas con el mismo nombre se distinguen con el apellido', () => {
  assert.deepEqual(displayNames(['Melissa Castaño', 'Melissa Ruiz', 'Sara Herrera']), {
    'Melissa Castaño': 'Melissa Castaño', 'Melissa Ruiz': 'Melissa Ruiz', 'Sara Herrera': 'Sara'
  });
});
