import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRhythmService, workTypeOf } from '../src/services/teamRhythmService.js';
import { buildTeamForecast } from '../src/lib/teamForecast.js';
import * as prediction from '../src/lib/workPrediction.js';

const H = 3_600_000, now = new Date('2026-10-14T20:00:00Z'); // 15:00 Bogotá
const task = (id, personId, clientId, complexity, hours) => ({ id, title: '[Producción] Reel: Prueba', status: 'REALIZADA', assigneeId: personId,
  completedAt: new Date('2026-10-13T22:00:00Z'), aiComplexity: complexity, clientId, client: { name: clientId }, contentItem: { format: 'Reel' }, duration: hours * H });
async function rhythm(tasks) {
  const sessions = tasks.map(t => ({ taskId: t.id, workerId: t.assigneeId, startedAt: new Date('2026-10-13T13:00:00Z'), endedAt: new Date( new Date('2026-10-13T13:00:00Z').getTime() + t.duration), durationMs: t.duration, cycle: { kind: 'INITIAL' } }));
  return createTeamRhythmService({ db: { task: { findMany: async () => tasks }, taskWorkSession: { findMany: async () => sessions }, teamMember: { findMany: async () => [{ id: 'r', name: 'Rodny' }, { id: 'b', name: 'Brayan' }] } }, now: () => now }).get({ days: 30 });
}
const records = () => [
  ...[1,2,3].map(i => task(`r${i}`, 'r', 'cliente-x', 'MEDIA', 1.5)),
  ...[1,2,3].map(i => task(`b${i}`, 'b', 'cliente-x', 'MEDIA', 4)),
  ...[1,2,3].map(i => task(`c${i}`, 'b', 'otro-cliente', 'MEDIA', 1)),
  ...[1,2,3].map(i => task(`d${i}`, 'b', 'cliente-x', 'ALTA', 6))
];
const forecastTask = (personId, extra = {}) => ({ id: 'new', title: 'Reel nuevo', personId, clientId: 'cliente-x', clientName: 'Cliente X', complexity: 'MEDIA', workType: 'Reel', dueDay: '2026-10-14', deadlineAt: '2026-10-14T23:00:00Z', ...extra });
const people = [{ personId: 'r', personName: 'Rodny' }, { personId: 'b', personName: 'Brayan' }];

test('an exact weekend publication keeps its hard deadline and belongs to this calendar week', async () => {
  const out = await rhythm(records());
  const result = buildTeamForecast({ people, rhythm: out, now: new Date('2026-10-16T20:00:00Z'), tasks: [forecastTask('b', { dueDay: '2026-10-17', deadlineAt: '2026-10-17T17:00:00Z' })] });
  const person = result.people[1];
  assert.equal(person.tasks[0].scheduledDay, '2026-10-17');
  assert.equal(person.tasks[0].capacityToDeadlineMs, 2.4 * H, 'Saturday adds no nominal capacity');
  assert.equal(person.riskCount, 1);
  assert.equal(result.summary.dueCount, 1);
});

test('history keeps separate person × format × client × complexity, with average, median and sample', async () => {
  const out = await rhythm(records());
  assert.ok(Array.isArray(out.profiles), 'contextual history is available to the screen and forecast');
  const row = out.profiles.find(p => p.personId === 'b' && p.clientId === 'cliente-x' && p.complexity === 'MEDIA');
  assert.equal(row.measured, 3);
  assert.equal(row.meanMs, 4 * H);
  assert.equal(row.medianMs, 4 * H);
  assert.equal(row.p75Ms, 4 * H);
});

test('at 15:00 a reel due at 18:00 is at risk for Brayan, while Rodny has margin for comparable work', async () => {
  const out = await rhythm(records());
  const b = buildTeamForecast({ people, tasks: [forecastTask('b')], rhythm: out, now });
  const r = buildTeamForecast({ people, tasks: [forecastTask('r')], rhythm: out, now });
  assert.equal(b.people[1].tasks[0].remainingMs, 4 * H);
  assert.equal(b.people[1].tasks[0].risk, 'riesgo');
  assert.equal(b.people[1].tasks[0].basis, 'persona_cliente_complejidad');
  assert.equal(r.people[0].tasks[0].remainingMs, 1.5 * H);
  assert.equal(r.people[0].tasks[0].risk, 'ok');
});

test('a different complexity never silently inherits the fastest client sample', async () => {
  const out = await rhythm(records());
  const map = buildTeamForecast({ people, tasks: [forecastTask('b', { complexity: 'ALTA' })], rhythm: out, now });
  assert.equal(map.people[1].tasks[0].remainingMs, 6 * H);
});

test('planning a parrilla is its own work type; reviewing one is not treated as creating it', () => {
  assert.equal(workTypeOf({ title: 'Crear la parrilla de noviembre', aiCategory: 'Marketing & Social Media' }), 'Parrilla');
  assert.notEqual(workTypeOf({ title: 'Revisar la parrilla con el cliente', aiCategory: 'Operaciones & Reuniones' }), 'Parrilla');
});

test('a deadline earlier than another one is checked before later work, independent of the input order', async () => {
  const out = await rhythm(records());
  const map = buildTeamForecast({ people, rhythm: out, now, tasks: [
    forecastTask('r', { id: 'late', deadlineAt: '2026-10-14T23:00:00Z' }),
    forecastTask('r', { id: 'early', deadlineAt: '2026-10-14T21:00:00Z' })
  ] });
  const early = map.people[0].tasks.find(t => t.id === 'early');
  assert.equal(early.risk, 'riesgo', 'one hour until 16:00 is insufficient for 1.5 h');
  assert.equal(early.committedToDeadlineMs, 1.5 * H, 'later work does not precede the earlier commitment');
});

test('a tomorrow view uses the next Colombian business day and next week covers the full following week', async () => {
  const out = await rhythm(records());
  const tomorrow = buildTeamForecast({ people, tasks: [], rhythm: out, now: new Date('2026-10-09T20:00:00Z'), window: 'tomorrow' });
  assert.deepEqual(tomorrow.days, ['2026-10-13']);
  const next = buildTeamForecast({ people, tasks: [], rhythm: out, now, window: 'next_week' });
  assert.deepEqual(next.days, ['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23']);
});

test('recorded hours split a session across Bogotá days and weeks, even if the task is still open', () => {
  assert.equal(typeof prediction.recordedWorkHours, 'function', 'actual hours are measured by session dates');
  const result = prediction.recordedWorkHours({ now: new Date('2026-10-13T15:00:00Z'), from: new Date('2026-10-01T05:00:00Z'), sessions: [
    { id: '1', workerId: 'r', startedAt: '2026-10-12T04:00:00Z', endedAt: '2026-10-12T06:00:00Z', durationMs: 2 * H },
    { id: '2', workerId: 'r', startedAt: '2026-10-13T14:00:00Z', endedAt: null, durationMs: null },
    { id: '3', workerId: 'r', startedAt: '2026-10-13T14:00:00Z', endedAt: null, isOverlapping: true },
    { id: '4', workerId: 'r', startedAt: '2026-10-12T06:00:00Z', endedAt: '2026-10-12T16:00:00Z', durationMs: 10 * H },
    { id: '5', workerId: 'r', startedAt: '2026-10-13T12:00:00Z', endedAt: '2026-10-13T14:00:00Z', durationMs: 2 * H, closeReason: 'DECLARED' }
  ] });
  const r = result.find(p => p.personId === 'r');
  assert.deepEqual(r.days.map(d => [d.day, d.measuredMs, d.declaredMs]), [['2026-10-11', H, 0], ['2026-10-12', H, 0], ['2026-10-13', H, 2 * H]]);
  assert.equal(r.weeks.length, 2);
  assert.equal(r.excludedSessions, 2);
});

test('an adjusted stored duration is apportioned across the actual span, clipped to the requested period', () => {
  assert.equal(typeof prediction.recordedWorkHours, 'function');
  const [r] = prediction.recordedWorkHours({ now: new Date('2026-10-14T23:00:00Z'), from: new Date('2026-10-14T05:00:00Z'), sessions: [
    { workerId: 'r', startedAt: '2026-10-14T04:00:00Z', endedAt: '2026-10-14T06:00:00Z', durationMs: H }
  ] });
  assert.equal(r.days[0].measuredMs, 0.5 * H);
});

test('private task context and partial collaborator time are not used to infer a full production duration', () => {
  const profiles = prediction.buildContextProfiles([
    { personId: 'r', workType: 'Reel', clientId: 'x', complexity: 'MEDIA', measuredMs: H, isPrivate: true },
    { personId: 'r', workType: 'Reel', clientId: 'x', complexity: 'MEDIA', measuredMs: H, isCollaborator: true },
    { personId: 'b', workType: 'Reel', clientId: 'x', complexity: 'MEDIA', measuredMs: 4 * H }
  ]);
  assert.deepEqual(profiles.map(p => p.personId), ['b']);
});

test('an empty contextual sample never falls back to excluded collaborator or private measurements', () => {
  const f = buildTeamForecast({ people, tasks: [forecastTask('r')], now,
    rhythm: { profiles: [], people: [{ personId: 'r', coverage: 1, byType: [{ workType: 'Reel', measured: 10, medianMs: 0.25 * H }] }], types: [] } });
  assert.equal(f.people[0].tasks[0].source, 'supuesto');
  assert.equal(f.people[0].tasks[0].confidence, 'baja');
});
