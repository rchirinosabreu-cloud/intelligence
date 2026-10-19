import test from 'node:test';
import assert from 'node:assert/strict';
import { clientSnapshot, personSnapshot, readSignals, streakDays, levelLabel } from '../src/lib/agencySnapshot.js';

// La memoria del tiempo (Rodny, 19 de octubre de 2026: «quiero que BRIA sea mi project, mis ojos, mi cerebro»).
// Cada día se guarda una foto de cada cuenta y de cada persona; las señales salen de comparar la foto de hoy con su
// propia historia, nunca con un número inventado. Sin historia, solo se dice lo que se ve hoy.

const H = 3_600_000;
const operation = (over = {}) => ({
  id: 'c1', name: 'Foobespain', slug: 'foobespain',
  projectManager: { id: 'pm1' }, communityManager: { id: 'cm1' },
  contract: { status: 'ACTIVO' },
  openTasks: [{ overdue: true }, { overdue: false }],
  cycles: { current: { label: 'Octubre', quota: 12, created: 12, reached: { publicada: 5, aprobada: 8 }, overdueItems: 1, day: 19, length: 31 } },
  evaluation: { level: 'red', reasons: [{ text: '1 pieza con fecha pasada y sin publicar.' }, { text: '1 tarea vencida en Gestión.' }] },
  ...over
});
const clientMetrics = (over = {}) => ({ level: 'green', reasons: [], contract: 'ACTIVO', cycle: null, awaitingApproval: 0, returnedPieces: 0, openTasks: 3, overdueTasks: 0, returnedTasks: 0, closedTasks: 1, hoursMs: 2 * H, ...over });
const personMetrics = (over = {}) => ({ open: 8, inProgress: 1, overdue: 0, returned: 0, closedTasks: 2, hoursMs: 6 * H, ...over });
const day = (value, clients = {}, people = {}) => ({ day: value, clients, people });

test('the client photo keeps what the operation already computed, plus what only the day can tell', () => {
  const snap = clientSnapshot(operation(), { awaitingApproval: 3, returnedPieces: 1, returnedTasks: 2, closedTasks: 4, hoursMs: 5 * H });
  assert.deepEqual(snap, {
    id: 'c1', name: 'Foobespain', slug: 'foobespain', pmId: 'pm1', cmId: 'cm1',
    metrics: {
      level: 'red', reasons: ['1 pieza con fecha pasada y sin publicar.', '1 tarea vencida en Gestión.'], contract: 'ACTIVO',
      cycle: { label: 'Octubre', quota: 12, created: 12, published: 5, approved: 8, overdueItems: 1, expected: 7, day: 19, length: 31 },
      awaitingApproval: 3, returnedPieces: 1, openTasks: 2, overdueTasks: 1, returnedTasks: 2, closedTasks: 4, hoursMs: 5 * H
    }
  });
  const services = clientSnapshot(operation({ cycles: {}, contract: null, evaluation: null, openTasks: [] }), {});
  assert.equal(services.metrics.cycle, null);
  assert.equal(services.metrics.level, 'gray');
  assert.equal(services.metrics.hoursMs, 0);
});

test('the person photo is workload in numbers, never a judgment', () => {
  assert.deepEqual(personSnapshot({ id: 'm1', name: 'Melissa Ruiz' }, { open: 9, inProgress: 1, overdue: 3, returned: 1, closedTasks: 2, hoursMs: 4 * H }), {
    id: 'm1', name: 'Melissa Ruiz', metrics: { open: 9, inProgress: 1, overdue: 3, returned: 1, closedTasks: 2, hoursMs: 4 * H }
  });
  assert.equal(levelLabel('yellow'), 'amarillo');
});

test('a streak counts back from today and breaks on a missing day', () => {
  assert.equal(streakDays([1, 0, 2, 3, 4], (v) => v > 0), 3);
  assert.equal(streakDays([1, null, 2], (v) => v > 0), 1);
  assert.equal(streakDays([0], (v) => v > 0), 0);
});

test('the first day there is no history: only what is seen today, and it says so', () => {
  const out = readSignals({
    today: '2026-10-20',
    current: { clients: [{ id: 'c1', name: 'Foobespain', slug: 'foobespain', metrics: clientMetrics({ level: 'red', reasons: ['Van 3 publicadas; a esta fecha deberían ir 6.'] }) }], people: [{ id: 'm1', name: 'Melissa Ruiz', metrics: personMetrics({ overdue: 4 }) }] },
    history: []
  });
  assert.equal(out.baseDay, null);
  assert.equal(out.summary.historyDays, 1);
  assert.deepEqual(out.summary.clients, { red: 1, yellow: 0, green: 0, gray: 0 });
  assert.equal(out.summary.baseClients, null);
  assert.deepEqual(out.signals, [], 'without history nothing is a change or a streak');
});

test('an account that got worse, one that stays red and one that improved, each with its reason', () => {
  const history = [
    day('2026-10-15', { c2: clientMetrics({ level: 'red' }), c3: clientMetrics({ level: 'red' }) }),
    day('2026-10-16', { c1: clientMetrics({ level: 'green' }), c2: clientMetrics({ level: 'red' }), c3: clientMetrics({ level: 'red' }) }),
    day('2026-10-17', { c1: clientMetrics({ level: 'green' }), c2: clientMetrics({ level: 'red' }), c3: clientMetrics({ level: 'red' }) }),
    day('2026-10-18', { c1: clientMetrics({ level: 'green' }), c2: clientMetrics({ level: 'red' }), c3: clientMetrics({ level: 'red' }) }),
    day('2026-10-19', { c1: clientMetrics({ level: 'green' }), c2: clientMetrics({ level: 'red' }), c3: clientMetrics({ level: 'red' }) })
  ];
  const out = readSignals({
    today: '2026-10-20',
    current: { clients: [
      { id: 'c1', name: 'Foobespain', slug: 'foobespain', metrics: clientMetrics({ level: 'yellow', reasons: ['Octubre: 9 de 12 piezas creadas, faltan 3.'] }) },
      { id: 'c2', name: 'Aristea', slug: 'aristea', metrics: clientMetrics({ level: 'red', reasons: ['2 piezas con fecha pasada y sin publicar.'] }) },
      { id: 'c3', name: 'Endova', slug: 'endova', metrics: clientMetrics({ level: 'green' }) }
    ], people: [] },
    history
  });
  assert.equal(out.baseDay, '2026-10-19');
  const byId = new Map(out.signals.map((s) => [s.id, s]));
  assert.equal(byId.get('CUENTA_EMPEORO:c1').text, 'Foobespain pasó de verde a amarillo: Octubre: 9 de 12 piezas creadas, faltan 3.');
  assert.equal(byId.get('CUENTA_EMPEORO:c1').url, '/clientes/operacion/foobespain');
  assert.equal(byId.get('ROJO_SOSTENIDO:c2').text, 'Aristea lleva 6 días en rojo: 2 piezas con fecha pasada y sin publicar.');
  assert.equal(byId.get('CUENTA_MEJORO:c3').direction, 'mejor');
  assert.equal(byId.get('CUENTA_MEJORO:c3').text, 'Endova volvió a verde: estaba en rojo.');
  assert.deepEqual(out.signals.map((s) => s.direction), ['peor', 'peor', 'mejor'], 'what got worse goes first');
  assert.deepEqual(out.summary.baseClients, { red: 2, yellow: 0, green: 1, gray: 0 });
});

test('approvals that do not move, returns that pile up and an account nobody touched', () => {
  const quiet = clientMetrics({ closedTasks: 0, hoursMs: 0, openTasks: 4 });
  const waiting = (n) => clientMetrics({ awaitingApproval: n });
  const history = [
    day('2026-10-13', { c1: waiting(2), c2: clientMetrics({ returnedPieces: 0 }), c4: quiet }),
    day('2026-10-14', { c1: waiting(3), c2: clientMetrics({ returnedPieces: 0 }), c4: quiet }),
    day('2026-10-15', { c1: waiting(3), c2: clientMetrics({ returnedPieces: 0 }), c4: quiet }),
    day('2026-10-16', { c1: waiting(4), c2: clientMetrics({ returnedPieces: 1 }), c4: quiet }),
    day('2026-10-17', { c1: waiting(4), c2: clientMetrics(), c4: quiet }),
    day('2026-10-18', { c1: waiting(4), c2: clientMetrics(), c4: quiet }),
    day('2026-10-19', { c1: waiting(4), c2: clientMetrics({ returnedPieces: 1 }), c4: quiet })
  ];
  const out = readSignals({
    today: '2026-10-20',
    current: { clients: [
      { id: 'c1', name: 'Foobespain', slug: 'foobespain', metrics: waiting(4) },
      { id: 'c2', name: 'Aristea', slug: 'aristea', metrics: clientMetrics({ returnedPieces: 2, returnedTasks: 1 }) },
      { id: 'c4', name: 'Wine Summit', slug: 'wine-summit', metrics: quiet }
    ], people: [] },
    history
  });
  const byId = new Map(out.signals.map((s) => [s.id, s]));
  assert.equal(byId.get('APROBACION_DETENIDA:c1').text, 'Foobespain lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).');
  assert.equal(byId.get('DEVOLUCIONES:c2').text, 'Aristea tiene 3 devoluciones abiertas entre piezas y tareas; en la última lectura eran 1.');
  // Las fotos del 13 al 20 cubren la actividad del 12 (festivo) al 19: cinco días hábiles sin tiempo ni cierres.
  assert.equal(byId.get('SIN_MOVIMIENTO:c4').text, 'Nadie registró tiempo ni cerró tareas de Wine Summit en los últimos 5 días hábiles; tiene 4 tareas abiertas.');
});

test('a missing photo breaks a quiet streak: a day without data is unknown, not quiet', () => {
  const quiet = clientMetrics({ closedTasks: 0, hoursMs: 0, openTasks: 4 });
  const history = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18', '2026-10-19'].map((d) => day(d, { c4: quiet }));
  const out = readSignals({ today: '2026-10-20', current: { clients: [{ id: 'c4', name: 'Wine Summit', slug: 'wine-summit', metrics: quiet }], people: [] }, history });
  assert.equal(out.signals.some((s) => s.kind === 'SIN_MOVIMIENTO'), false, 'only 19 and 16 are known in a row: too short');
});

test('hours on an account that jump against its own last three weeks', () => {
  const history = [];
  for (let i = 27; i >= 1; i -= 1) {
    const date = new Date(Date.UTC(2026, 9, 20 - i)).toISOString().slice(0, 10);
    history.push(day(date, { c1: clientMetrics({ hoursMs: i <= 6 ? 4 * H : 1 * H }) }));
  }
  const out = readSignals({ today: '2026-10-20', current: { clients: [{ id: 'c1', name: 'Foobespain', slug: 'foobespain', metrics: clientMetrics({ hoursMs: 4 * H }) }], people: [] }, history });
  const signal = out.signals.find((s) => s.id === 'HORAS_SUBEN:c1');
  assert.ok(signal, 'the jump is seen');
  assert.equal(signal.text, 'En Foobespain se registraron 28 h en los últimos 7 días; las tres semanas anteriores promediaron 7 h por semana.');
  const short = readSignals({ today: '2026-10-20', current: { clients: [{ id: 'c1', name: 'Foobespain', slug: 'foobespain', metrics: clientMetrics({ hoursMs: 4 * H }) }], people: [] }, history: history.slice(-10) });
  assert.equal(short.signals.some((s) => s.kind === 'HORAS_SUBEN'), false, 'with less than four weeks of history there is nothing to compare');
});

test('people: overdue that lasts, overdue that jumps, an unusual load and the overdue that cleared', () => {
  const history = [];
  for (let i = 10; i >= 1; i -= 1) {
    const date = new Date(Date.UTC(2026, 9, 20 - i)).toISOString().slice(0, 10);
    history.push(day(date, {}, {
      m1: personMetrics({ overdue: i <= 4 ? 2 : 0 }),
      m2: personMetrics({ overdue: 1 }),
      m3: personMetrics({ open: 10 }),
      m4: personMetrics({ overdue: 4 })
    }));
  }
  const out = readSignals({ today: '2026-10-20', current: { clients: [], people: [
    { id: 'm1', name: 'Melissa Ruiz', metrics: personMetrics({ overdue: 3 }) },
    { id: 'm2', name: 'Jesús Pérez', metrics: personMetrics({ overdue: 4 }) },
    { id: 'm3', name: 'Kamila Díaz', metrics: personMetrics({ open: 19 }) },
    { id: 'm4', name: 'Jarlan Gómez', metrics: personMetrics({ overdue: 0 }) }
  ] }, history });
  const byId = new Map(out.signals.map((s) => [s.id, s]));
  assert.equal(byId.get('VENCIDAS_SOSTENIDAS:m1').text, 'Melissa Ruiz lleva 5 días con tareas vencidas (hoy 3).');
  assert.equal(byId.get('VENCIDAS_SOSTENIDAS:m1').url, '/gestion?responsable=Melissa%20Ruiz');
  assert.equal(byId.get('VENCIDAS_SUBEN:m2').text, 'Jesús Pérez pasó de 1 a 4 tareas vencidas desde la última lectura.');
  assert.equal(byId.has('VENCIDAS_SOSTENIDAS:m2'), true, 'a long streak is said too');
  assert.equal(byId.get('CARGA_INUSUAL:m3').text, 'Kamila Díaz tiene 19 pendientes abiertos; lo habitual en las últimas semanas eran 10.');
  assert.equal(byId.get('VENCIDAS_RESUELTAS:m4').text, 'Jarlan Gómez quedó sin tareas vencidas; en la última lectura tenía 4.');
  assert.equal(byId.get('VENCIDAS_RESUELTAS:m4').direction, 'mejor');
  assert.equal(out.summary.team.overdue, 7);
  assert.equal(out.summary.baseTeam.overdue, 2 + 1 + 0 + 4);
  for (const signal of out.signals) assert.doesNotMatch(signal.text, /lent|floj|mal|desempeño|rendimiento/i, 'facts, never judgments');
});

test('activity since the last reading adds up the weekend', () => {
  const history = [day('2026-10-16', {}, { m1: personMetrics({ closedTasks: 3, hoursMs: 7 * H }) }), day('2026-10-17', {}, { m1: personMetrics({ closedTasks: 2, hoursMs: 5 * H }) }), day('2026-10-18', {}, { m1: personMetrics({ closedTasks: 0, hoursMs: 0 }) })];
  const out = readSignals({ today: '2026-10-19', current: { clients: [], people: [{ id: 'm1', name: 'Melissa Ruiz', metrics: personMetrics({ closedTasks: 1, hoursMs: 2 * H }) }] }, history });
  assert.equal(out.baseDay, '2026-10-16');
  // Desde la foto del viernes: sábado (cubre el viernes), domingo (cubre el sábado) y lunes (cubre el domingo).
  assert.deepEqual(out.summary.sinceBase, { closedTasks: 3, hoursMs: 7 * H });
});
