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
  assert.equal(CAUGHT_UP_POLICY, 'cierre-del-dia-v2');
});

test('Rodny on the 11th: closed what was due that day before 18:00 and left nothing overdue', () => {
  const result = caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'REALIZADA', completedAt: at(`${DAY}T21:30:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-14T12:00:00Z') }
  ] });
  assert.deepEqual(result, { eligible: true, closed: 2, pending: 0 });
});

test('something due that day or before still open at 18:00 loses it, even if it was closed later that night', () => {
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-09T12:00:00Z') }
  ] }).eligible, false, 'an older overdue task');
  assert.deepEqual(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'REALIZADA', completedAt: at(`${DAY}T23:40:00Z`), dueDate: at(`${DAY}T12:00:00Z`) }
  ] }), { eligible: false, closed: 1, pending: 1 }, 'closing at 18:40 is after the close of the day');
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: null },
    { status: 'EN_CURSO', completedAt: null, dueDate: null, focusDeadlineAt: at(`${DAY}T20:00:00Z`) }
  ] }).eligible, false, 'a commitment with a time before 18:00 counts too');
});

test('a returned task waits for its creator and nobody earns it for doing nothing', () => {
  assert.equal(caughtUpAtClose({ day: DAY, views: [
    { status: 'REALIZADA', completedAt: at(`${DAY}T15:00:00Z`), dueDate: at(`${DAY}T12:00:00Z`) },
    { status: 'DEVUELTA', completedAt: null, dueDate: at('2026-11-05T12:00:00Z') }
  ] }).eligible, true);
  assert.deepEqual(caughtUpAtClose({ day: DAY, views: [{ status: 'PENDIENTE', completedAt: null, dueDate: at('2026-11-20T12:00:00Z') }] }),
    { eligible: false, closed: 0, pending: 0 }, 'without closing anything that day there is no badge');
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
  assert.equal(award.ruleVersion, 2);
  assert.equal(award.dedupeKey, `v1:CAUGHT_UP:u-rodny:${DAY}`, 'one Al día per person and day, old or new');
  assert.deepEqual(award.evidence, { policy: CAUGHT_UP_POLICY, closedToday: 1, cutoff: '2026-11-11T23:00:00.000Z' });
  assert.equal(db.traces[0].eventType, 'RECOGNITION_GRANTED');
  // La consulta se limita a las tareas vigentes (sin clientes archivados ni piezas retiradas).
  assert.ok(JSON.stringify(db.queries[0].where).includes('isArchived'));
  // Volver a pasar no repite.
  await awardCaughtUpAtClose(db, { now: at(`${DAY}T23:50:00Z`) });
  assert.equal(db.awards.length, 1);
});

test('before 18:00, on a weekend or after the day ended, nothing is granted', async () => {
  const db = fakeDb();
  assert.equal((await awardCaughtUpAtClose(db, { now: at(`${DAY}T22:30:00Z`) })).skipped, 'ANTES_DEL_CIERRE');
  assert.equal((await awardCaughtUpAtClose(db, { now: at('2026-11-14T23:30:00Z') })).skipped, 'DIA_NO_HABIL');
  assert.equal(db.awards.length, 0);
});
