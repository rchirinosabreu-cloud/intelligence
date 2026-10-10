// Mapa de carga (Rodny, 10 de octubre de 2026, Fase A de Ritmo): quién está saturado y quién tiene espacio en
// los próximos días hábiles, con lo comprometido según las tareas abiertas y lo que suele tomar cada tipo de
// trabajo. Datos inventados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadMap, estimateFor, nextWorkingDays, LOAD_CAPACITY_MS, DEFAULT_ESTIMATE_MS, loadSignals } from '../src/lib/teamLoad.js';

const H = 3_600_000;
const people = [{ personId: 'b', personName: 'Brayan', avatarUrl: null }, { personId: 'h', personName: 'Helen', avatarUrl: null }];
const estimates = { byPersonType: { 'b|Video': 4 * H, 'h|Post': 0.5 * H }, byType: { Video: 2 * H, Post: 0.75 * H } };
const task = (id, personId, workType, dueDay, extra = {}) => ({ id, title: `${workType} ${id}`, status: 'PENDIENTE', personId, workType, dueDay, clientName: 'Cliente de ejemplo', ...extra });

test('working days skip weekends and Colombian holidays', () => {
  // El lunes 12 de octubre de 2026 es festivo (Día de la Raza, trasladado al lunes).
  assert.deepEqual(nextWorkingDays('2026-10-09', 4), ['2026-10-09', '2026-10-13', '2026-10-14', '2026-10-15']);
});

test('the estimate comes from the person’s own median, then the team’s, then an assumption', () => {
  assert.deepEqual(estimateFor({ personId: 'b', workType: 'Video' }, estimates), { ms: 4 * H, source: 'persona' });
  assert.deepEqual(estimateFor({ personId: 'h', workType: 'Video' }, estimates), { ms: 2 * H, source: 'equipo' });
  assert.deepEqual(estimateFor({ personId: 'h', workType: 'Reel' }, estimates), { ms: DEFAULT_ESTIMATE_MS, source: 'supuesto' });
});

test('each person gets a cell per working day with hours, level and the tasks behind it; overdue and undated go apart', () => {
  const tasks = [
    task('t1', 'b', 'Video', '2026-10-13'), task('t2', 'b', 'Video', '2026-10-13'), task('t3', 'b', 'Video', '2026-10-13'),
    task('t4', 'b', 'Post', '2026-10-14'),
    task('t5', 'h', 'Post', '2026-10-13'), task('t6', 'h', 'Post', '2026-10-08'), task('t7', 'h', 'Post', null),
    task('t8', 'x', 'Post', '2026-10-13')
  ];
  const map = buildLoadMap({ people, tasks, estimates, today: '2026-10-09', days: 3 });
  assert.deepEqual(map.days, ['2026-10-09', '2026-10-13', '2026-10-14']);
  const brayan = map.people.find((p) => p.personId === 'b');
  const tuesday = brayan.cells.find((c) => c.day === '2026-10-13');
  assert.equal(tuesday.ms, 12 * H);
  assert.equal(tuesday.level, 'excedida', 'three four-hour videos in one day');
  assert.deepEqual(tuesday.tasks.map((t) => t.id), ['t1', 't2', 't3']);
  assert.equal(brayan.cells.find((c) => c.day === '2026-10-14').level, 'libre');
  assert.equal(brayan.cells.find((c) => c.day === '2026-10-14').tasks[0].source, 'equipo');
  const helen = map.people.find((p) => p.personId === 'h');
  assert.deepEqual([helen.overdue.count, helen.overdue.taskIds, helen.undated.count], [1, ['t6'], 1]);
  assert.equal(helen.cells.find((c) => c.day === '2026-10-13').ms, 0.5 * H);
  assert.equal(map.people.some((p) => p.personId === 'x'), false, 'only active team members');
  assert.equal(map.capacityMs, LOAD_CAPACITY_MS);
  assert.equal(map.totals.find((t) => t.day === '2026-10-13').ms, 12.5 * H);
});

test('levels: free under half a day, ok under a full day, a full day is already high, past a day and a quarter is exceeded', () => {
  const at = (ms) => buildLoadMap({ people: [people[0]], tasks: [{ ...task('t', 'b', 'Otro', '2026-10-09'), estimateMs: ms }], estimates: { byPersonType: {}, byType: {} }, today: '2026-10-09', days: 1 }).people[0].cells[0].level;
  assert.deepEqual([at(3 * H), at(7 * H), at(8 * H), at(10 * H), at(11 * H)], ['libre', 'ok', 'alta', 'alta', 'excedida'], 'two four-hour videos in a day are already a full day');
});

test('load signals say who is over and who has room, as questions with evidence', () => {
  const tasks = [task('t1', 'b', 'Video', '2026-10-13'), task('t2', 'b', 'Video', '2026-10-13'), task('t3', 'b', 'Video', '2026-10-13'), task('t6', 'h', 'Post', '2026-10-08')];
  const map = buildLoadMap({ people, tasks, estimates, today: '2026-10-09', days: 5 });
  const signals = loadSignals(map);
  const over = signals.find((s) => s.kind === 'DIA_EXCEDIDO' && s.personId === 'b');
  assert.match(over.message, /Brayan/);
  assert.match(over.message, /13 de octubre/);
  assert.deepEqual(over.taskIds, ['t1', 't2', 't3']);
  assert.ok(signals.some((s) => s.kind === 'CON_ESPACIO' && s.personId === 'h'));
  assert.ok(signals.some((s) => s.kind === 'VENCIDAS' && s.personId === 'h'));
  for (const signal of signals) assert.doesNotMatch(signal.message, /\b(mal|flojo|lento)\b/i);
});
