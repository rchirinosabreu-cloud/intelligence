// Ritmo en el servidor: de tareas cerradas y sesiones del cronómetro a la lectura por persona (9 de octubre de
// 2026). Datos inventados; la base es un doble.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRhythmRecords, workTypeOf, createTeamRhythmService } from '../src/services/teamRhythmService.js';

const H = 3_600_000;
const at = (iso) => new Date(iso);

test('the type of work comes from the piece, then the production title, then the category', () => {
  assert.equal(workTypeOf({ title: '[Producción] Reel: Lanzamiento', contentItem: { format: 'reel' } }), 'Reel');
  assert.equal(workTypeOf({ title: '[Producción] Carrusel: Tips', contentItem: null }), 'Carrusel');
  assert.equal(workTypeOf({ title: '[Publicar] Reel: Lanzamiento', contentItem: { format: 'Reel' } }), 'Publicación');
  assert.equal(workTypeOf({ title: 'Editar video institucional', aiCategory: 'Producción Audiovisual' }), 'Producción Audiovisual');
  assert.equal(workTypeOf({ title: 'Algo', aiCategory: null }), 'Sin clasificar');
});

test('time goes to whoever worked it, rework and the longest session are kept, and the assignee without a clock still counts', () => {
  const tasks = [
    { id: 't1', title: '[Producción] Reel: A', completedAt: at('2026-10-06T22:00:00Z'), assigneeId: 'm-b', assignee: { id: 'm-b', name: 'Brayan' }, contentItem: { format: 'Reel' }, accumulatedWorkMs: 0 },
    { id: 't2', title: 'Diseñar banner', aiCategory: 'Creativo & Diseño', completedAt: at('2026-10-07T03:00:00Z'), assigneeId: 'm-h', assignee: { id: 'm-h', name: 'Helen' }, accumulatedWorkMs: 0 },
    { id: 't3', title: 'Tarea vieja', aiCategory: 'Creativo & Diseño', completedAt: at('2026-10-05T15:00:00Z'), assigneeId: 'm-h', assignee: { id: 'm-h', name: 'Helen' }, accumulatedWorkMs: 2 * H }
  ];
  const sessions = [
    { taskId: 't1', workerId: 'm-b', isCollaborator: false, durationMs: 3 * H, cycle: { kind: 'INITIAL' } },
    { taskId: 't1', workerId: 'm-b', isCollaborator: false, durationMs: 1 * H, cycle: { kind: 'REWORK' } },
    { taskId: 't1', workerId: 'm-c', isCollaborator: true, durationMs: 2 * H, cycle: { kind: 'INITIAL' } }
  ];
  const members = [{ id: 'm-b', name: 'Brayan' }, { id: 'm-h', name: 'Helen' }, { id: 'm-c', name: 'Camila' }];
  const records = buildRhythmRecords({ tasks, sessions, members });
  const brayan = records.find((r) => r.taskId === 't1' && r.personId === 'm-b');
  assert.deepEqual([brayan.measuredMs, brayan.reworkMs, brayan.longestSessionMs, brayan.workType, brayan.completedDay], [4 * H, 1 * H, 3 * H, 'Reel', '2026-10-06']);
  assert.equal(records.find((r) => r.taskId === 't1' && r.personId === 'm-c').measuredMs, 2 * H, 'a collaborator is credited with their own hours');
  assert.equal(records.find((r) => r.taskId === 't2').measuredMs, 0, 'closed without the clock: counted, not measured');
  assert.equal(records.find((r) => r.taskId === 't2').completedDay, '2026-10-06', 'the day is Bogotá’s, not UTC');
  assert.equal(records.find((r) => r.taskId === 't3').measuredMs, 2 * H, 'older tasks keep the time they had before sessions existed');
});

test('a clock running at the same time as another one is not counted twice', () => {
  const tasks = ['t1', 't2', 't3'].map((id) => ({ id, title: `[Publicar] Reel: ${id}`, completedAt: at('2026-10-06T20:00:00Z'), assigneeId: 'm-j', assignee: { id: 'm-j', name: 'Jarlan' }, accumulatedWorkMs: 0 }));
  const sessions = [
    { taskId: 't1', workerId: 'm-j', isCollaborator: false, isOverlapping: false, durationMs: 4.8 * H, cycle: { kind: 'INITIAL' } },
    { taskId: 't2', workerId: 'm-j', isCollaborator: false, isOverlapping: true, durationMs: 4.8 * H, cycle: { kind: 'INITIAL' } },
    { taskId: 't3', workerId: 'm-j', isCollaborator: false, isOverlapping: true, durationMs: 4.8 * H, cycle: { kind: 'INITIAL' } }
  ];
  const records = buildRhythmRecords({ tasks, sessions, members: [{ id: 'm-j', name: 'Jarlan' }] });
  assert.deepEqual(records.map((r) => [r.taskId, r.measuredMs, r.overlappedMs]), [['t1', 4.8 * H, 0], ['t2', 0, 4.8 * H], ['t3', 0, 4.8 * H]]);
});

test('time declared on closing counts as measured, is told apart, and a long one is not a forgotten clock', () => {
  const tasks = [{ id: 't1', title: 'Post', completedAt: at('2026-10-09T20:00:00Z'), assigneeId: 'm-m', assignee: { id: 'm-m', name: 'Melissa' }, accumulatedWorkMs: 8 * H }];
  const sessions = [{ taskId: 't1', workerId: 'm-m', isCollaborator: false, isOverlapping: false, closeReason: 'DECLARED', durationMs: 8 * H, cycle: { kind: 'INITIAL' } }];
  const [record] = buildRhythmRecords({ tasks, sessions, members: [{ id: 'm-m', name: 'Melissa' }] });
  assert.deepEqual([record.measuredMs, record.declaredMs, record.longestSessionMs], [8 * H, 8 * H, 0]);
});

test('the service reads one period, answers with people, types and the tasks behind every finding', async () => {
  const calls = [];
  const db = {
    task: { findMany: async (args) => { calls.push(args); return [
      { id: 't1', title: '[Producción] Video: A', completedAt: at('2026-10-06T15:00:00Z'), assigneeId: 'm-b', assignee: { id: 'm-b', name: 'Brayan' }, contentItem: { format: 'Video' }, accumulatedWorkMs: 0 },
      { id: 't2', title: '[Producción] Video: B', completedAt: at('2026-10-06T20:00:00Z'), assigneeId: 'm-b', assignee: { id: 'm-b', name: 'Brayan' }, contentItem: { format: 'Video' }, accumulatedWorkMs: 0 }
    ]; } },
    taskWorkSession: { findMany: async () => [
      { taskId: 't1', workerId: 'm-b', isCollaborator: false, durationMs: 4 * H, cycle: { kind: 'INITIAL' } },
      { taskId: 't2', workerId: 'm-b', isCollaborator: false, durationMs: 4 * H, cycle: { kind: 'INITIAL' } }
    ] },
    teamMember: { findMany: async () => [{ id: 'm-b', name: 'Brayan' }] }
  };
  const service = createTeamRhythmService({ db, now: () => at('2026-10-09T15:00:00Z') });
  const out = await service.get({ days: 30 });
  assert.equal(calls[0].where.status, 'REALIZADA');
  assert.equal(calls[0].where.completedAt.gte.toISOString(), '2026-09-09T15:00:00.000Z');
  assert.equal(out.period.days, 30);
  assert.deepEqual(out.team, { closed: 2, measured: 2, declared: 0, coverage: 1 });
  const heavy = out.people[0].findings.find((f) => f.kind === 'HEAVY_DAY');
  assert.ok(heavy);
  assert.deepEqual(heavy.taskIds.map((id) => out.tasks[id].title).sort(), ['[Producción] Video: A', '[Producción] Video: B']);
  assert.equal((await service.get({ days: 45 })).period.days, 30, 'only the periods the screen offers');
});
