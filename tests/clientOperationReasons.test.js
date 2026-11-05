import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClientOperation } from '../src/lib/clientOperations.js';

const today = '2026-11-05';
const base = () => ({
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', endDate: '2027-03-31', deliverables: [{ format: 'Post', quantity: 12 }], monthlyReport: false },
  cycles: {
    current: { year: 2026, month: 11, label: 'Noviembre', day: 5, length: 30, quota: 12, created: 12, reached: { publicada: 1 }, overdueItems: 0, longestGap: null, sameDay: [] },
    previous: { year: 2026, month: 10, label: 'Octubre', quota: 12, created: 12, reached: { publicada: 12 }, report: null },
  },
  openTasks: [],
});

// Cada motivo apunta al recurso que permite revisar su causa. El periodo pertenece al motivo,
// no a la fecha en que se abre la ficha: octubre no puede terminar abriendo noviembre.
for (const [code, category, level, action, setup] of [
  ['CURRENT_OVERDUE', 'operation', 'red', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.overdueItems = 1; }],
  ['PREVIOUS_SHORTFALL', 'operation', 'red', { type: 'previous_plan', year: 2026, month: 10 }, (c) => { c.cycles.previous.reached.publicada = 9; }],
  ['NO_PLAN', 'operation', 'red', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.created = 0; }],
  ['PUBLISHING_BEHIND', 'operation', 'red', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.day = 20; }],
  ['MISSING_PIECES', 'planning', 'yellow', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.created = 2; }],
  ['REPORT_PENDING', 'operation', 'yellow', { type: 'report', year: 2026, month: 10 }, (c) => { c.contract.monthlyReport = true; }],
  ['TASKS_OVERDUE', 'operation', 'yellow', { type: 'tasks' }, (c) => { c.openTasks = [{ overdue: true }]; }],
  ['PLANNED_GAP', 'planning', 'yellow', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.longestGap = { days: 7, from: '2026-11-10', to: '2026-11-17' }; }],
  ['PLANNED_SAME_DAY', 'planning', 'yellow', { type: 'current_plan', year: 2026, month: 11 }, (c) => { c.cycles.current.sameDay = [{ count: 2, date: '2026-11-10' }]; }],
  ['CONTRACT_EXPIRED', 'contract', 'yellow', { type: 'profile' }, (c) => { c.contract.endDate = '2026-10-31'; }],
  ['CONTRACT_EXPIRING', 'contract', 'yellow', { type: 'profile' }, (c) => { c.contract.endDate = '2026-11-30'; }],
  ['UNBACKED_WORK', 'contract', 'yellow', { type: 'profile' }, (c) => { c.contract.endDate = '2026-10-31'; c.work = { openTasks: 11, plans: ['noviembre', 'diciembre'] }; }],
  ['NO_CONTRACT', 'contract', 'gray', { type: 'profile' }, (c) => { c.contract = null; }],
  ['PAUSED', 'status', 'gray', { type: 'profile' }, (c) => { c.contract.status = 'STAND_BY'; }],
  ['TERMINATED', 'status', 'gray', { type: 'profile' }, (c) => { c.contract.status = 'TERMINADO'; }],
  ['NO_SERVICE_TASKS', 'status', 'gray', { type: 'tasks' }, (c) => { c.contract.serviceType = 'SERVICIOS'; }],
]) {
  test(`${code} identifica la causa y el destino sin alterar el color ni la cantidad de motivos`, () => {
    const client = base(); setup(client);
    const result = evaluateClientOperation(client, { today });
    assert.equal(result.level, level);
    assert.equal(result.reasons.length, 1);
    const reason = result.reasons[0];
    assert.deepEqual({ code: reason.code, category: reason.category, level: reason.level, action: reason.action }, { code, category, level, action });
    assert.equal(typeof reason.text, 'string');
  });
}

test('el déficit previo sigue visible con cierre registrado y no afirma un cierre formal', () => {
  const client = base();
  client.cycles.previous.reached.publicada = 9;
  client.cycles.previous.close = { closedAt: '2026-11-02T10:00:00Z', pendingDecision: 'PRIORITIZE' };
  const result = evaluateClientOperation(client, { today });
  assert.equal(result.level, 'red');
  assert.equal(result.reasons[0].code, 'PREVIOUS_SHORTFALL');
  assert.equal(result.reasons[0].text, 'Octubre: 9 de 12 publicadas; faltan 3 piezas.');
  assert.deepEqual(result.reasons[0].action, { type: 'previous_plan', year: 2026, month: 10 });
});

test('los avisos sobre distribución describen las fechas de la parrilla, incluso cuando son futuras', () => {
  const client = base();
  client.cycles.current.longestGap = { days: 7, from: '2026-11-10', to: '2026-11-17' };
  client.cycles.current.sameDay = [{ count: 2, date: '2026-11-10' }];
  assert.deepEqual(evaluateClientOperation(client, { today }).reasons.map((r) => r.text), [
    '7 días entre fechas de la parrilla (del 10 nov al 17 nov).',
    '2 piezas con la misma fecha en la parrilla: 10 nov.',
  ]);
});

test('no se inventa un periodo a partir del nombre del mes ni de la fecha de consulta', () => {
  const client = base();
  delete client.cycles.previous.year;
  delete client.cycles.previous.month;
  delete client.cycles.current.year;
  delete client.cycles.current.month;
  client.cycles.previous.reached.publicada = 9;
  client.cycles.current.overdueItems = 1;
  client.contract.monthlyReport = true;
  assert.deepEqual(evaluateClientOperation(client, { today }).reasons.map((r) => r.action), [
    { type: 'previous_plan' }, { type: 'current_plan' }, { type: 'report' },
  ]);
});

test('una autorización vigente conserva el motivo informativo sin convertirlo en alerta', () => {
  const client = base();
  client.contract = null;
  client.work = { openTasks: 1 };
  client.workAuthorization = { until: '2026-11-10', reason: 'Renovación en proceso' };
  const result = evaluateClientOperation(client, { today });
  assert.equal(result.level, 'gray');
  assert.equal(result.reasons.length, 1);
  assert.deepEqual({ ...result.reasons[0], text: undefined }, { level: 'gray', code: 'UNBACKED_WORK', category: 'contract', action: { type: 'profile' }, text: undefined });
});
