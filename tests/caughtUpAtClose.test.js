// La insignia «Al día» al cierre de la jornada (Rodny, 12 de noviembre de 2026: «Dar "Al día" al cierre de la jornada a
// quien terminó el día sin nada vencido»). Antes se ganaba al ponerse al día con lo vencido, así que premiaba atrasarse:
// Brayan cerró a las 6:27 un video de la víspera y la ganó; Rodny terminó todo lo del 11 a tiempo y no la recibió.
import test from 'node:test';
import assert from 'node:assert/strict';
import { caughtUpAtClose, dayCloseCutoff, CAUGHT_UP_POLICY, taskAwardKinds } from '../src/services/recognitionRules.js';
import { awardCaughtUpAtClose } from '../src/services/caughtUpAtCloseService.js';

const DAY = '2026-11-11';
const at = (iso) => new Date(iso);

test('the day closes at 18:00 of Bogotá', () => {
  assert.equal(dayCloseCutoff(DAY).toISOString(), '2026-11-11T23:00:00.000Z');
  assert.equal(CAUGHT_UP_POLICY, 'cierre-del-dia-v4');
});

test('Rodny on the 11th: closed what was due that day before 18:00 and left nothing overdue', () => {
  const result = caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'REALIZADA', completedAt: at(`${DAY}T21:30:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-14T12:00:00Z') }
  ] });
  assert.deepEqual(result, { eligible: true, closed: 2, pending: 0, pendingTasks: [] });
});

test('something due that day or before still open at 18:00 loses it, even if it was closed later that night', () => {
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-09T12:00:00Z') }
  ] }).eligible, false, 'an older overdue task');
  assert.deepEqual(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'REALIZADA', title: 'Reel', completedAt: at(`${DAY}T23:40:00Z`), dueDate: at(`${DAY}T12:00:00Z`) }
  ] }), { eligible: false, closed: 1, pending: 1, pendingTasks: [{ title: 'Reel', dueDate: at(`${DAY}T12:00:00Z`) }] }, 'closing at 18:40 is after the close of the day');
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: null },
    { status: 'EN_CURSO', completedAt: null, dueDate: null, focusDeadlineAt: at(`${DAY}T20:00:00Z`) }
  ] }).eligible, false, 'a commitment with a time before 18:00 counts too');
});

test('a returned task waits for its creator and nobody earns it for doing nothing', () => {
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'REALIZADA', completedAt: at(`${DAY}T16:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'DEVUELTA', completedAt: null, dueDate: at('2026-11-05T12:00:00Z') }
  ] }).eligible, true);
  assert.deepEqual(caughtUpAtClose({ day: DAY, views: [{ status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-20T12:00:00Z') }] }),
    { eligible: false, closed: 0, pending: 0, pendingTasks: [] }, 'without closing anything that day there is no badge');
});

// Rodny, 18 de noviembre de 2026: Brayan la ganó el 12 y el 13 cerrando una sola tarea, con los mismos cinco puntos que
// Jesús con seis. Desde ahora pide al menos dos cierres.
test('one closing is not enough: the badge asks for at least two', () => {
  const one = caughtUpAtClose({ day: DAY, views: [{ status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) }] });
  assert.equal(one.eligible, false);
  assert.equal(one.closed, 1);
  assert.equal(one.pending, 0, 'nothing overdue: the habit Al día is still clean, only the badge waits for a second closing');
});

test('what was left overdue is named, the oldest first, so nobody loses it without knowing why', () => {
  const result = caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'PENDIENTE', title: 'Video Pablo Hoff', dueDate: at('2026-11-10T12:00:00Z') },
    { status: 'EN_CURSO', title: 'Informe octubre', dueDate: at('2026-10-02T12:00:00Z') }
  ] });
  assert.deepEqual(result.pendingTasks.map((task) => task.title), ['Informe octubre', 'Video Pablo Hoff']);
});

test('closing a task no longer grants Al día on the spot: catching up stopped being the rule', () => {
  assert.deepEqual(taskAwardKinds({ teamDayCount: 2, userDayCount: 1, userWeekCount: 1, early: false, caughtUp: true }), []);
});

// La base falsa: dos personas con Gestión (Rodny y Brayan) y una sin Gestión (Elisa).
const people = [
  { id: 'm-rodny', name: 'Rodny', user: { id: 'u-rodny', role: 'ADMIN', isActive: true, modulePermissions: {} } },
  { id: 'm-brayan', name: 'Brayan', user: { id: 'u-brayan', role: 'EDITOR', isActive: true, modulePermissions: { gestion: true } } },
  { id: 'm-elisa', name: 'Elisa', user: { id: 'u-elisa', role: 'EDITOR', isActive: true, modulePermissions: { financiero: true, gestion: false } } }
];
const fakeDb = () => {
  const awards = [], traces = [], queries = [];
  const tx = {
    $executeRaw: async () => 0,
    teamMember: { findMany: async () => people },
    task: { findMany: async (args) => { queries.push(args); return [
      { id: 't1', status: 'REALIZADA', assigneeId: 'm-rodny', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`), focusDeadlineAt: null },
      { id: 't1b', status: 'REALIZADA', assigneeId: 'm-rodny', completedAt: at(`${DAY}T17:00:00Z`), dueDate: at('2026-11-13T12:00:00Z'), focusDeadlineAt: null },
      { id: 't2', status: 'REALIZADA', assigneeId: 'm-brayan', completedAt: at(`${DAY}T16:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`), focusDeadlineAt: null },
      { id: 't3', status: 'PENDIENTE', assigneeId: 'm-brayan', completedAt: null, dueDate: at('2026-11-10T12:00:00Z'), focusDeadlineAt: null },
      { id: 't4', status: 'REALIZADA', assigneeId: 'm-elisa', completedAt: at(`${DAY}T16:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`), focusDeadlineAt: null }
    ]; } },
    recognitionAward: { createMany: async ({ data, skipDuplicates }) => {
      assert.equal(skipDuplicates, true);
      const fresh = data.filter((row) => !awards.some((saved) => saved.dedupeKey === row.dedupeKey));
      awards.push(...fresh);
      return { count: fresh.length };
    } },
    operationalTraceEvent: { create: async ({ data }) => { traces.push(data); return data; } }
  };
  return { awards, traces, queries, $transaction: async (work) => work(tx) };
};

test('at the close of a business day only who ended clean receives it, once, and only people with Gestión', async () => {
  const db = fakeDb();
  const result = await awardCaughtUpAtClose(db, { now: at(`${DAY}T23:10:00Z`) });
  assert.deepEqual(result, { day: DAY, granted: 1 });
  assert.equal(db.awards.length, 1);
  const [award] = db.awards;
  assert.equal(award.kind, 'CAUGHT_UP');
  assert.equal(award.recipientId, 'u-rodny');
  assert.equal(award.dayKey, DAY);
  assert.equal(award.ruleVersion, 4);
  assert.equal(award.dedupeKey, `v1:CAUGHT_UP:u-rodny:${DAY}`, 'one Al día per person and day, old or new');
  assert.deepEqual(award.evidence, { policy: CAUGHT_UP_POLICY, closedToday: 2, cutoff: '2026-11-11T23:00:00.000Z' });
  assert.equal(db.traces[0].eventType, 'RECOGNITION_GRANTED');
  // La consulta se limita a las tareas vigentes (sin clientes archivados ni piezas retiradas).
  assert.ok(JSON.stringify(db.queries[0].where).includes('isArchived'));
  // Volver a pasar no repite.
  await awardCaughtUpAtClose(db, { now: at(`${DAY}T23:20:00Z`) });
  assert.equal(db.awards.length, 1);
});

// Sara, 12 de noviembre de 2026: la recibió a las 18:49. Más tarde que el corte, reprogramar una vencida la saca del
// cálculo; por eso la pasada solo entrega en la media hora que sigue a las 18:00.
test('after the half hour that follows the close, the day is settled and nothing new is granted', async () => {
  const db = fakeDb();
  assert.deepEqual(await awardCaughtUpAtClose(db, { now: at(`${DAY}T23:30:00Z`) }), { day: DAY, skipped: 'CIERRE_PASADO' });
  assert.equal(db.awards.length, 0);
});

test('before 18:00, on a weekend or after the day ended, nothing is granted', async () => {
  const db = fakeDb();
  assert.equal((await awardCaughtUpAtClose(db, { now: at(`${DAY}T22:30:00Z`) })).skipped, 'ANTES_DEL_CIERRE');
  assert.equal((await awardCaughtUpAtClose(db, { now: at('2026-11-14T23:30:00Z') })).skipped, 'DIA_NO_HABIL');
  assert.equal(db.awards.length, 0);
});

// Rodny, 21 de noviembre de 2026: «que se cierre a las 5pm, o sea si a esa hora la persona quedó con sus tareas al día,
// sin nada vencido sin tener que mover fechas, lo gana … las nuevas reglas deben comenzar este lunes 23».
test('from Monday 23 November the day closes at 17:00; earlier days keep their 18:00', () => {
  assert.equal(dayCloseCutoff('2026-11-20').toISOString(), '2026-11-20T23:00:00.000Z');
  assert.equal(dayCloseCutoff('2026-11-23').toISOString(), '2026-11-23T22:00:00.000Z');
  const closedAt1730 = [
    { status: 'REALIZADA', completedAt: at('2026-11-23T15:00:00Z'), dueDate: at('2026-11-23T12:00:00Z') },
    { status: 'REALIZADA', completedAt: at('2026-11-23T16:00:00Z'), dueDate: at('2026-11-23T12:00:00Z') },
    { status: 'REALIZADA', completedAt: at('2026-11-23T22:30:00Z'), dueDate: at('2026-11-23T12:00:00Z'), title: 'Reel' }
  ];
  assert.equal(caughtUpAtClose({ day: '2026-11-23', views: closedAt1730 }).eligible, false, 'closed at 17:30: it was open at 17:00');
});

test('moving the date of something due that day does not take it out of the count', () => {
  const closed = [
    { status: 'REALIZADA', completedAt: at('2026-11-23T15:00:00Z'), dueDate: at('2026-11-23T12:00:00Z') },
    { status: 'REALIZADA', completedAt: at('2026-11-23T16:00:00Z'), dueDate: at('2026-11-23T12:00:00Z') }
  ];
  const moved = { status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-27T12:00:00Z'), title: 'Carrusel', movedFrom: '2026-11-23' };
  const result = caughtUpAtClose({ day: '2026-11-23', views: [...closed, moved] });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.pendingTasks, [{ title: 'Carrusel', dueDate: at('2026-11-23T12:00:00.000Z'), moved: true }]);
  assert.equal(caughtUpAtClose({ day: '2026-11-23', views: [...closed, { ...moved, movedFrom: undefined }] }).eligible, true, 'a task that was never due that day does not count');
  assert.equal(caughtUpAtClose({ day: '2026-11-23', views: [...closed, { ...moved, status: 'REALIZADA', completedAt: at('2026-11-23T20:00:00Z') }] }).eligible, true, 'moved and then closed before 17:00 is done');
});

test('a date moved by an admin or a project manager on someone else\'s task does not cost that person Al día; moving your own still does', async () => {
  const { closeViewsFor } = await import('../src/services/caughtUpAtCloseService.js');
  const pm = { role: 'EDITOR', teamMember: { id: 'm-pm', areas: ['PROJECT_MANAGEMENT'], role: 'Project manager' } };
  const admin = { role: 'ADMIN', teamMember: { id: 'm-admin', areas: [], role: 'Director' } };
  const designer = { role: 'EDITOR', teamMember: { id: 'm-dis', areas: ['DISENO'], role: 'Diseñadora' } };
  const moves = [
    { taskId: 't-by-pm', fromValue: '2026-11-23', actor: pm },
    { taskId: 't-by-admin', fromValue: '2026-11-20', actor: admin },
    { taskId: 't-own', fromValue: '2026-11-23', actor: designer },
    { taskId: 't-pm-own', fromValue: '2026-11-23', actor: pm },
    { taskId: 't-both', fromValue: '2026-11-23', actor: pm },
    { taskId: 't-both', fromValue: '2026-11-24', actor: designer }
  ];
  const task = (id, assigneeId) => ({ id, title: id, status: 'PENDIENTE', assigneeId, completedAt: null, dueDate: at('2026-11-26T12:00:00Z'), focusDeadlineAt: null, participants: [] });
  const tx = {
    taskChangeEvent: { findMany: async ({ where }) => { assert.equal(where.kind, 'DUE_DATE'); return moves; } },
    task: { findMany: async () => [task('t-by-pm', 'm-dis'), task('t-by-admin', 'm-dis'), task('t-own', 'm-dis'), task('t-pm-own', 'm-pm'), task('t-both', 'm-dis')] }
  };
  const views = await closeViewsFor(tx, { day: '2026-11-23', memberIds: ['m-dis', 'm-pm'] });
  const moved = (memberId) => Object.fromEntries(views.get(memberId).map((view) => [view.title, view.movedFrom || null]));
  assert.deepEqual(moved('m-dis'), { 't-by-pm': null, 't-by-admin': null, 't-own': '2026-11-23', 't-both': null },
    'what the PM or the admin rescheduled is not held against her; her own move is; a later move from a future date never counts');
  assert.deepEqual(moved('m-pm'), { 't-pm-own': '2026-11-23' }, 'a project manager moving their own task is still moving dates');
});
