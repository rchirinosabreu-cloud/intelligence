import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finishTaskRecognition } from '../src/services/recognitionService.js';
import { dayStartCutoff } from '../src/services/recognitionRules.js';

// Rodny, 20 de noviembre de 2026: «pon buen comienzo con regla desde las 8am». Sara cerró a la 1:07 a. m. y se lo llevó.
function fakeTx(states) {
  const awards = [];
  return {
    awards,
    user: { findUnique: async () => ({ isActive: true }) },
    recognitionTaskState: {
      update: async ({ where, data }) => { states.set(where.taskId, { ...states.get(where.taskId), ...data }); },
      count: async ({ where }) => [...states.values()].filter(s => s.dayKey === where.dayKey
        && (!where.recipientId || s.recipientId === where.recipientId)
        && (!where.weekKey || s.weekKey === where.weekKey)
        && (!where.firstCompletedAt || (s.firstCompletedAt && s.firstCompletedAt >= where.firstCompletedAt.gte))).length,
    },
    recognitionAward: { createMany: async ({ data }) => { awards.push(...data); return { count: data.length }; } },
    operationalTraceEvent: { create: async () => ({}) },
  };
}
const close = async (tx, states, id, userId, at) => {
  states.set(id, { taskId: id });
  const task = { id, status: 'EN_CURSO', assigneeId: `m-${userId}`, assignee: { isActive: true, userId } };
  await finishTaskRecognition(tx, { task, state: states.get(id) }, { status: 'REALIZADA', assigneeId: task.assigneeId }, new Date(at));
};

test('Buen comienzo starts at 8:00 Bogotá: a dawn closing does not take it, the first one after 8 does', async () => {
  const states = new Map(), tx = fakeTx(states);
  await close(tx, states, 't1', 'sara', '2026-11-20T06:07:00Z');      // 1:07 a. m.
  assert.deepEqual(tx.awards.map(a => a.kind), [], 'la madrugada no compite por Buen comienzo');
  await close(tx, states, 't2', 'helen', '2026-11-20T13:20:00Z');     // 8:20 a. m.
  assert.deepEqual(tx.awards.map(a => [a.kind, a.recipientId]), [['FIRST_TASK', 'helen']]);
  await close(tx, states, 't3', 'brayan', '2026-11-20T13:40:00Z');    // 8:40 a. m.
  assert.equal(tx.awards.filter(a => a.kind === 'FIRST_TASK').length, 1, 'solo uno por día');
});

test('the 8:00 cutoff is Bogotá time and the badge text does not mention the hour', () => {
  assert.equal(dayStartCutoff('2026-11-20').toISOString(), '2026-11-20T13:00:00.000Z');
  const copy = readFileSync('src/lib/recognitionPresentation.js', 'utf8');
  assert.doesNotMatch(copy, /8:00|8 ?a\.? ?m|las 8/i, 'la descripción del logro no dice la hora (Rodny)');
});

test('the requested correction retires only a dawn Buen comienzo of that day, keeps the row and runs once', async () => {
  const { applyRecognitionCorrections, RECOGNITION_CORRECTIONS } = await import('../src/services/recognitionCorrections.js');
  assert.deepEqual(RECOGNITION_CORRECTIONS.map(c => [c.kind, c.day || c.month]), [['FIRST_TASK', '2026-11-20'], ['EARLY_DELIVERY', '2026-11-20']]);
  const rows = [
    { id: 'sara', kind: 'FIRST_TASK', dayKey: '2026-11-20', recipientId: 'u-sara', occurredAt: new Date('2026-11-20T06:07:00Z'), evidence: { teamDayCount: 1 } },
    { id: 'otro-dia', kind: 'FIRST_TASK', dayKey: '2026-11-19', recipientId: 'u-x', occurredAt: new Date('2026-11-19T06:00:00Z'), evidence: {} },
    { id: 'manana', kind: 'FIRST_TASK', dayKey: '2026-11-21', recipientId: 'u-y', occurredAt: new Date('2026-11-21T14:00:00Z'), evidence: {} },
  ];
  const db = { task: { findMany: async () => [] }, recognitionAward: {
    findMany: async ({ where }) => rows.filter(r => r.kind === where.kind && r.dayKey === where.dayKey && (!where.occurredAt || r.occurredAt < where.occurredAt.lt)),
    update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
  } };
  const now = new Date('2026-11-20T17:00:00Z');
  assert.deepEqual((await applyRecognitionCorrections(db, { now })).map(r => r.id), ['sara']);
  const sara = rows.find(r => r.id === 'sara');
  assert.equal(sara.kind, 'FIRST_TASK_RETIRADO', 'la liga y los logros ya no lo cuentan');
  assert.equal(sara.evidence.teamDayCount, 1, 'conserva la evidencia original');
  assert.equal(sara.evidence.retired.previousKind, 'FIRST_TASK');
  assert.equal(rows.find(r => r.id === 'otro-dia').kind, 'FIRST_TASK', 'otros días no se tocan');
  assert.deepEqual(await applyRecognitionCorrections(db, { now }), [], 'no se repite');
  const { LEAGUE_RECOGNITION_KINDS } = await import('../src/lib/platformLeague.js');
  assert.ok(!LEAGUE_RECOGNITION_KINDS.includes('FIRST_TASK_RETIRADO'));
});

test('a retired recognition no longer shows on the task card', () => {
  const service = readFileSync('src/services/recognitionService.js', 'utf8');
  const attach = service.slice(service.indexOf('export async function attachTaskRecognitions'));
  assert.match(attach, /NOT: \{ kind: \{ endsWith: '_RETIRADO' \} \}/);
});

function correctionDb(rows, tasks) {
  return { task: { findMany: async ({ where }) => tasks.filter(t => where.id.in.includes(t.id)) }, recognitionAward: {
    findMany: async ({ where }) => rows.filter(r => r.kind === where.kind
      && (typeof where.dayKey === 'string' ? r.dayKey === where.dayKey : r.dayKey.startsWith(where.dayKey.startsWith))
      && (!where.recipient || r.name.startsWith(where.recipient.name.startsWith))),
    update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
  } };
}
const saraCorrection = async () => (await import('../src/services/recognitionCorrections.js')).RECOGNITION_CORRECTIONS.filter(c => c.kind === 'EARLY_DELIVERY');

test('Sara: retires only her two early deliveries of November 20 (Nattal and Fundación Grit), and only when there are exactly two', async () => {
  const { applyRecognitionCorrections } = await import('../src/services/recognitionCorrections.js');
  const corrections = await saraCorrection();
  const tasks = [{ id: 't-nattal', title: 'Actualizar parrilla', client: { name: 'Nattal' } }, { id: 't-grit', title: 'Enviar para aprobación', client: { name: 'Fundación Grit' } }, { id: 't-otro', title: 'Otra', client: { name: 'Verona' } }];
  const rows = [
    { id: 'a1', kind: 'EARLY_DELIVERY', dayKey: '2026-11-20', name: 'Sara Herrera', taskId: 't-nattal', occurredAt: new Date('2026-11-20T16:33:00Z'), evidence: {} },
    { id: 'a2', kind: 'EARLY_DELIVERY', dayKey: '2026-11-20', name: 'Sara Herrera', taskId: 't-grit', occurredAt: new Date('2026-11-20T15:39:00Z'), evidence: {} },
    { id: 'a3', kind: 'EARLY_DELIVERY', dayKey: '2026-11-19', name: 'Sara Herrera', taskId: 't-grit', occurredAt: new Date('2026-11-19T15:39:00Z'), evidence: {} },
    { id: 'a4', kind: 'EARLY_DELIVERY', dayKey: '2026-11-20', name: 'Helen', taskId: 't-nattal', occurredAt: new Date('2026-11-20T16:00:00Z'), evidence: {} },
    { id: 'a5', kind: 'EARLY_DELIVERY', dayKey: '2026-11-20', name: 'Sara Herrera', taskId: 't-otro', occurredAt: new Date('2026-11-20T17:00:00Z'), evidence: {} },
  ];
  const retired = await applyRecognitionCorrections(correctionDb(rows, tasks), { corrections });
  assert.deepEqual(retired.map(r => r.id).sort(), ['a1', 'a2']);
  assert.equal(rows.find(r => r.id === 'a3').kind, 'EARLY_DELIVERY', 'otro día no se toca');
  assert.equal(rows.find(r => r.id === 'a5').kind, 'EARLY_DELIVERY', 'otro cliente no se toca');
  assert.equal(rows.find(r => r.id === 'a4').kind, 'EARLY_DELIVERY', 'la de otra persona se queda');
  assert.deepEqual(await applyRecognitionCorrections(correctionDb(rows, tasks), { corrections }), [], 'no se repite');
});

test('Sara: with three matches nothing is retired and the list is logged for review', async () => {
  const { applyRecognitionCorrections } = await import('../src/services/recognitionCorrections.js');
  const tasks = [{ id: 't-nattal', title: 'Actualizar parrilla', client: { name: 'Nattal' } }];
  const rows = ['b1', 'b2', 'b3'].map((id, i) => ({ id, kind: 'EARLY_DELIVERY', dayKey: '2026-11-20', name: 'Sara', taskId: 't-nattal', occurredAt: new Date(`2026-11-20T1${i}:00:00Z`), evidence: {} }));
  const warn = console.warn; const logged = []; console.warn = (...args) => logged.push(args.join(' '));
  try { assert.deepEqual(await applyRecognitionCorrections(correctionDb(rows, tasks), { corrections: await saraCorrection() }), []); }
  finally { console.warn = warn; }
  assert.ok(rows.every(r => r.kind === 'EARLY_DELIVERY'));
  assert.match(logged.join('\n'), /se esperaban 2 y hay 3/);
});

test('early delivery: the first of the day is worth 5, each additional one 2; other days start over', async () => {
  const { recognitionPointsById, recognitionPoints, leagueScore } = await import('../src/lib/platformLeague.js');
  const awards = [
    { id: 'e1', kind: 'EARLY_DELIVERY', recipientId: 'sara', occurredAt: '2026-11-20T14:00:00Z' },
    { id: 'e2', kind: 'EARLY_DELIVERY', recipientId: 'sara', occurredAt: '2026-11-20T16:00:00Z' },
    { id: 'e3', kind: 'EARLY_DELIVERY', recipientId: 'sara', occurredAt: '2026-11-20T22:00:00Z' },
    { id: 'e4', kind: 'EARLY_DELIVERY', recipientId: 'sara', occurredAt: '2026-11-21T14:00:00Z' },
    { id: 'e5', kind: 'EARLY_DELIVERY', recipientId: 'helen', occurredAt: '2026-11-20T15:00:00Z' },
    { id: 'f1', kind: 'FIRST_TASK', recipientId: 'sara', occurredAt: '2026-11-20T13:30:00Z' },
  ];
  const points = recognitionPointsById(awards);
  assert.deepEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'f1'].map(id => points.get(id)), [5, 2, 2, 5, 5, 5]);
  assert.equal(recognitionPoints(awards.filter(a => a.recipientId === 'sara')), 19);
  assert.equal(leagueScore({ recognitionPoints: 9 }), 9);
  assert.equal(leagueScore({ recognitions: 2 }), 10, 'quien solo cuenta reconocimientos sigue igual');
  const service = readFileSync('src/services/platformLeagueService.js', 'utf8');
  assert.doesNotMatch(service, /recognitions: awardsOf\(memberId\)\.length/);
  assert.match(readFileSync('src/components/recognitions/RecognitionNotice.jsx', 'utf8'), /event\.points \?\? RECOGNITION_POINTS/);
});
