// Ritmo: cuánto tarda cada persona, qué tan parejo trabaja y dónde se le va el tiempo (Rodny, 9 de octubre de
// 2026: «si Brayan hace en un día dos vídeos y en cada uno se demora 4 horas … o si en un vídeo se demora 5 horas
// y en otro 30 minutos, hay que ver por qué tanta diferencia»). Datos inventados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTeamRhythm, RHYTHM_LIMITS } from '../src/lib/teamRhythm.js';

const H = 3_600_000, M = 60_000;
let seq = 0;
const task = (person, type, ms, day, extra = {}) => ({ id: `t${++seq}`, title: `${type} ${seq}`, personId: person, personName: { b: 'Brayan', h: 'Helen', c: 'Camila' }[person], workType: type, completedDay: day, measuredMs: ms, reworkMs: 0, longestSessionMs: Math.min(ms, 3 * H), ...extra });

test('coverage comes first: closed tasks without the clock are counted, never read as fast', () => {
  const tasks = [task('b', 'Video', 2 * H, '2026-10-01'), task('b', 'Video', 0, '2026-10-02'), task('b', 'Video', 0, '2026-10-03'), task('b', 'Video', 3 * M, '2026-10-04')];
  const { people } = analyzeTeamRhythm({ tasks });
  const brayan = people.find((p) => p.personId === 'b');
  assert.equal(brayan.closed, 4);
  assert.equal(brayan.measured, 1, 'a few minutes is not a measurement');
  assert.equal(brayan.coverage, 0.25);
  assert.equal(brayan.byType[0].medianMs, 2 * H, 'statistics only use measured tasks');
  assert.ok(brayan.findings.some((f) => f.kind === 'LOW_COVERAGE'));
});

test('two four-hour videos in the same day are a heavy day, with the tasks as evidence', () => {
  const a = task('b', 'Video', 4 * H, '2026-10-06'), b = task('b', 'Video', 4 * H, '2026-10-06');
  const { people } = analyzeTeamRhythm({ tasks: [a, b, task('b', 'Video', 1 * H, '2026-10-07')] });
  const heavy = people[0].findings.find((f) => f.kind === 'HEAVY_DAY');
  assert.ok(heavy);
  assert.deepEqual(heavy.taskIds.sort(), [a.id, b.id].sort());
  assert.match(heavy.message, /2 tareas de Video el 6 de octubre/);
  assert.match(heavy.message, /8 h/);
});

test('five hours on one video and thirty minutes on another is flagged as uneven, naming both', () => {
  const slow = task('b', 'Video', 5 * H, '2026-10-01'), fast = task('b', 'Video', 30 * M, '2026-10-02');
  const { people } = analyzeTeamRhythm({ tasks: [slow, fast, task('b', 'Video', 2 * H, '2026-10-03')] });
  const uneven = people[0].findings.find((f) => f.kind === 'UNEVEN');
  assert.ok(uneven);
  assert.deepEqual(uneven.taskIds, [slow.id, fast.id]);
  assert.match(uneven.message, /de 30 min a 5 h/);
});

test('compared with the team only with enough tasks on both sides', () => {
  const tasks = [
    ...[3, 3.5, 4].map((h, i) => task('b', 'Reel', h * H, `2026-10-0${i + 1}`)),
    ...[1, 1.5, 1.2, 1.1].map((h, i) => task('h', 'Reel', h * H, `2026-10-0${i + 1}`)),
    task('c', 'Reel', 1 * H, '2026-10-01')
  ];
  const { people, types } = analyzeTeamRhythm({ tasks });
  const brayan = people.find((p) => p.personId === 'b');
  const slower = brayan.findings.find((f) => f.kind === 'SLOWER_THAN_TEAM');
  assert.ok(slower, 'three of his against the rest of the team');
  assert.match(slower.message, /Reel/);
  assert.equal(people.find((p) => p.personId === 'c').findings.some((f) => f.kind === 'SLOWER_THAN_TEAM' || f.kind === 'FASTER_THAN_TEAM'), false, 'one task is not enough to compare');
  assert.equal(types.find((t) => t.workType === 'Reel').measured, 8);
});

test('rework and forgotten clocks are said apart; a forgotten clock does not count as work', () => {
  const rework = task('h', 'Diseño', 3 * H, '2026-10-01', { reworkMs: 2 * H });
  const forgotten = task('h', 'Diseño', 14 * H, '2026-10-02', { longestSessionMs: 13 * H });
  const { people } = analyzeTeamRhythm({ tasks: [rework, forgotten, task('h', 'Diseño', 1 * H, '2026-10-03')] });
  const helen = people[0];
  assert.ok(helen.findings.some((f) => f.kind === 'REWORK' && f.taskIds.includes(rework.id)));
  assert.ok(helen.findings.some((f) => f.kind === 'FORGOTTEN_CLOCK' && f.taskIds.includes(forgotten.id)));
  assert.equal(helen.byType[0].measured, 2, 'the forgotten clock is left out of the times');
  assert.ok(RHYTHM_LIMITS.forgottenSessionMs <= 10 * H);
});

test('with many tasks only the ones far above the usual are named; a catch-all category is never compared', () => {
  const posts = [30, 35, 40, 45, 50, 38].map((min, i) => task('h', 'Post', min * M, `2026-10-1${i}`));
  const long = task('h', 'Post', 3 * H, '2026-10-20');
  const ops = [task('h', 'Operaciones & Reuniones', 10 * M, '2026-10-01'), task('h', 'Operaciones & Reuniones', 5 * H, '2026-10-02'), task('h', 'Operaciones & Reuniones', 4 * H, '2026-10-02')];
  const others = [1, 1.2, 1.1].map((h, i) => task('b', 'Operaciones & Reuniones', h * H, `2026-10-0${i + 1}`));
  const { people } = analyzeTeamRhythm({ tasks: [...posts, long, ...ops, ...others] });
  const helen = people.find((p) => p.personId === 'h');
  const outlier = helen.findings.find((f) => f.kind === 'OUTLIER');
  assert.deepEqual(outlier?.taskIds, [long.id]);
  assert.match(outlier.message, /3 h/);
  assert.equal(helen.findings.some((f) => f.kind === 'UNEVEN' && f.workType === 'Post'), false, 'with many tasks the spread itself is not news');
  assert.equal(helen.findings.some((f) => f.workType === 'Operaciones & Reuniones'), false, 'mixed work is not compared, not called uneven');
});

test('a very long day is said whatever the work, and rework that is the whole time reads well', () => {
  const day = [task('c', 'Operaciones & Reuniones', 4 * H, '2026-10-06'), task('c', 'Post', 4 * H, '2026-10-06'), task('c', 'Reel', 3 * H, '2026-10-06', { reworkMs: 3 * H })];
  const { people } = analyzeTeamRhythm({ tasks: day });
  const long = people[0].findings.find((f) => f.kind === 'LONG_DAY');
  assert.ok(long);
  assert.match(long.message, /11 h/);
  assert.equal(long.taskIds.length, 3);
  assert.match(people[0].findings.find((f) => f.kind === 'REWORK').message, /todo su tiempo medido/);
});

test('time while another clock was running is said apart, never added', () => {
  const a = task('b', 'Publicación', 0, '2026-10-06', { overlappedMs: 4 * H }), b = task('b', 'Publicación', 0, '2026-10-06', { overlappedMs: 4 * H });
  const { people } = analyzeTeamRhythm({ tasks: [a, b, task('b', 'Publicación', 30 * M, '2026-10-06')] });
  const overlap = people[0].findings.find((f) => f.kind === 'OVERLAP');
  assert.deepEqual(overlap.taskIds.sort(), [a.id, b.id].sort());
  assert.match(overlap.message, /8 h/);
  assert.match(overlap.message, /a la vez/);
});

test('every finding reads as a question to look at, in plain Spanish, never as a verdict', () => {
  const { people } = analyzeTeamRhythm({ tasks: [task('b', 'Video', 4 * H, '2026-10-06'), task('b', 'Video', 4 * H, '2026-10-06'), task('b', 'Video', 30 * M, '2026-10-07')] });
  for (const finding of people[0].findings) {
    assert.ok(finding.message.length <= 220);
    assert.doesNotMatch(finding.message, /\b(mal|malo|flojo|lento|culpa)\b/i);
    assert.ok(finding.taskIds.length >= 1);
  }
});
