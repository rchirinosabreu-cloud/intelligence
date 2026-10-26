import test from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { createTeamLoadService } from '../src/services/teamLoadService.js';

const today = '2026-10-26';
const now = () => new Date('2026-10-26T15:00:00.000Z');
const task = overrides => ({ id: 'task', title: 'Trabajo editorial', status: 'PENDIENTE', assigneeId: 'person', clientId: 'client', dueDate: new Date('2026-10-30T12:00:00Z'), client: { name: 'Taller Faro' }, assignee: { name: 'Ana' }, workSessions: [], collaborators: [], ...overrides });
const loadFor = tasks => createTeamLoadService({ now, rhythm: { get: async () => ({ profiles: [], hours: [] }) }, db: {
  teamMember: { findMany: async () => [{ id: 'person', name: 'Ana' }] }, task: { findMany: async () => tasks }
} });

test('the load summary distinguishes past task deadlines from future tasks without exposing editorial detail', async () => {
  const tasks = [
    task({ id: 'old', dueDate: new Date('2026-10-23T12:00:00Z'), focusDeadlineAt: new Date('2026-10-26T20:00:00Z'), contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '15:00', status: 'PROGRAMADO' } }),
    ...[1, 2, 3].map(number => task({ id: 'future-' + number, title: 'Pieza ' + number, contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '15:00', status: 'APROBADO' } }))
  ];
  const result = await toolByName('carga_del_equipo').run({}, { load: loadFor(tasks), now });
  const person = result.data.prevision.personas[0];
  assert.equal(person.vencidas, 1);
  const old = person.tareas.find(row => row.id === 'old');
  assert.equal(old.origenLimite, 'fecha');
  assert.equal(old.plazos.entrega.fecha, '2026-10-23');
  assert.equal(old.plazos.entrega.vencida, true);
  assert.equal(old.plazos.publicacion, null);
  assert.equal(old.plazos.compromiso.hora, '15:00');
  for (const future of person.tareas.filter(row => row.id.startsWith('future-'))) {
    assert.equal(future.vencida, false, 'lack of an estimate is not an overdue obligation');
    assert.equal(future.plazos.entrega.fecha, '2026-10-30');
    assert.equal(future.plazos.publicacion, null);
  }
  assert.equal(person.tareas.filter(row => row.vencida).length, 1);
});

test('task lists preserve calendar dates and evaluate an explicit hour using the Bogotá instant', async () => {
  const at = () => new Date('2026-10-27T02:00:00Z'); // 26 October, 21:00 Bogotá
  const rows = [task({ dueDate: '2026-10-27', focusDeadlineAt: new Date('2026-10-27T01:00:00Z'), contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '08:00', status: 'APROBADO' } })];
  const result = await toolByName('tareas_de_cliente').run({ clientId: 'client' }, { getTasks: async () => rows, user: { id: 'viewer' }, today, now: at });
  const row = result.data.tareas[0];
  assert.equal(row.vence, '2026-10-27', 'a day-only value is already a calendar day, not UTC midnight');
  assert.equal(row.vencida, false);
  assert.equal(row.plazos.entrega.fecha, '2026-10-27');
  assert.equal(row.plazos.compromiso.fecha, '2026-10-26');
  assert.equal(row.plazos.compromiso.hora, '20:00');
  assert.equal(row.plazos.compromiso.vencido, true);
  assert.equal(row.plazos.publicacion, null, 'a task list does not expose editorial detail');
});

test('editorial dates distinguish a publication from the linked production task and do not invent missing hours', async () => {
  const content = { id: 'piece', objective: 'Trabajo editorial', format: 'Reel', publishDate: new Date('2026-10-30T00:00:00Z'), status: 'APROBADO', tasks: [task({ dueDate: new Date('2026-10-23T12:00:00Z') })] };
  const result = await toolByName('parrilla_de_cliente').run({ clientId: 'client' }, { today, now, user: { id: 'viewer', role: 'ADMIN' }, db: { contentPlan: { findFirst: async () => ({ id: 'plan', month: 10, year: 2026, contentItems: [content] }) } } });
  const piece = result.data.parrilla.piezas[0];
  assert.equal(piece.plazos.fecha, '2026-10-30');
  assert.equal(piece.plazos.hora, null);
  assert.equal(piece.plazos.instante, null);
  assert.equal(piece.plazos.vencida, false);
  assert.equal(piece.enProduccion.plazos.entrega.fecha, '2026-10-23');
  assert.equal(piece.enProduccion.plazos.entrega.vencida, true);
  assert.equal(result.data.parrilla.resumen.vencidas, 0);
});

test('forecast temporal evidence does not disclose the linked content of a private task', async () => {
  const result = await toolByName('carga_del_equipo').run({}, { now, load: loadFor([task({ isPrivate: true, contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '21:47', status: 'APROBADO' } })]) });
  const row = result.data.prevision.personas[0].tareas[0];
  assert.equal(row.plazos.publicacion, null);
  assert.doesNotMatch(JSON.stringify(row.plazos), /21:47|APROBADO/);
});



test('private task headers do not become permission to expose a linked publication', async () => {
  const rows = [task({ isPrivate: true, creatorId: 'viewer', contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '21:47', status: 'APROBADO' } })];
  const result = await toolByName('buscar_pendientes').run({}, { db: { task: { count: async () => 1, findMany: async () => rows } }, user: { id: 'viewer' }, today, now });
  assert.equal(result.sources[0].kind, 'tarea_resumen');
  assert.equal(result.data.tareas[0].plazos.publicacion, null, 'header source can survive loss of detail access');
});

test('publication hours are compared on the same Bogotá day, while published items stay fulfilled', async () => {
  const at = () => new Date('2026-10-27T02:00:00Z');
  const items = [
    { id: 'past', publishTime: '20:00', status: 'APROBADO' },
    { id: 'future', publishTime: '22:00', status: 'APROBADO' },
    { id: 'day-only', publishTime: null, status: 'APROBADO' },
    { id: 'done', publishTime: '20:00', status: 'PUBLICADO' }
  ].map(row => ({ ...row, objective: 'Pieza', format: 'Reel', publishDate: new Date('2026-10-26T00:00:00Z') }));
  const result = await toolByName('parrilla_de_cliente').run({ clientId: 'client' }, { today, now: at, user: { role: 'ADMIN' }, db: { contentPlan: { findFirst: async () => ({ id: 'plan', month: 10, year: 2026, contentItems: items }) } } });
  const pieces = result.data.parrilla.piezas;
  assert.deepEqual(pieces.map(row => row.plazos.vencida), [true, false, false, false]);
  assert.equal(pieces[0].plazos.instante, '2026-10-27T01:00:00.000Z');
});



test('task lists keep header authorization and do not expose linked editorial content', async () => {
  const rows = [task({ contentItem: { publishDate: new Date('2026-10-30T00:00:00Z'), publishTime: '15:00', status: 'APROBADO' } })];
  const ctx = { user: { id: 'viewer' }, today, now };
  const byClient = await toolByName('tareas_de_cliente').run({ clientId: 'client' }, { ...ctx, getTasks: async () => rows });
  const search = await toolByName('buscar_pendientes').run({}, { ...ctx, db: { task: { count: async () => 1, findMany: async () => rows } } });
  for (const result of [byClient, search]) {
    assert.equal(result.data.tareas[0].plazos.publicacion, null);
    assert.equal(result.sources[0].kind, 'tarea_resumen');
  }
});



test('a Gestión-only reader gets task dates without selecting or returning editorial data', async () => {
  let query;
  const result = await toolByName('buscar_pendientes').run({}, {
    today, now, user: { id: 'viewer', role: 'EDITOR', modulePermissions: { gestion: true, parrillas: false } },
    db: { task: { count: async () => 1, findMany: async args => { query = args; return [task({ contentItem: { publishDate: '2026-10-30', publishTime: '21:47', status: 'APROBADO' } })]; } } }
  });
  assert.equal(query.select.contentItem, undefined);
  assert.equal(result.data.tareas[0].plazos.entrega.fecha, '2026-10-30');
  assert.equal(result.data.tareas[0].plazos.publicacion, null);
  assert.equal(result.sources[0].kind, 'tarea_resumen');
  assert.doesNotMatch(JSON.stringify(result), /21:47|APROBADO/);
});

test('native load metadata does not expand Manager access into the linked editorial record', async () => {
  const map = await loadFor([task({ contentItem: { publishDate: '2026-10-30', publishTime: '21:47', status: 'APROBADO' } })]).get();
  const metadata = map.forecast.people[0].tasks[0].temporal;
  assert.equal(metadata.dueDate, '2026-10-30');
  assert.equal(metadata.contentItem, undefined);
  assert.doesNotMatch(JSON.stringify(metadata), /21:47|APROBADO/);
});
