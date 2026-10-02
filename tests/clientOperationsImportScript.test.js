import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlan, renderReport } from '../scripts/import-client-operations-excel.js';

// El script de carga solo escribe lo que dice el plan, cliente por cliente y en transacción, y volver a
// correrlo no duplica contratos ni tareas.

const plan = {
  updates: [
    { clientId: 'c1', client: 'Mimas', data: { agency: 'BRAIN' }, contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-15', endDate: null, cutDay: 1, deliverables: [{ format: 'Reel', quantity: 2 }] } },
    { clientId: 'c2', client: 'Nuva', data: {}, contract: null },
  ],
  tasks: [{ clientId: 'c1', assigneeId: 'm1', title: 'Pendientes que venían del Excel', comments: '- Programar' }],
  observations: [{ clientId: 'c1', client: 'Mimas', text: 'Todo realizado, falta programar.', label: 'Observaciones (MIO)' }],
  teamHighlights: [{ memberId: 'm1', name: 'Jarlan', text: 'Informes y prospección de clientes' }],
  differences: [{ clientId: 'c1', client: 'Mimas', text: 'Community manager distinto.' }],
  doubts: ['Mimas: empieza el día 15.'], notFound: ['Cliente Fantasma'], archived: ['Salsipuedes'],
};

function fakeDb({ contracts = 0, tasks = 0, observations = 0, highlightTaken = false } = {}) {
  const writes = [];
  const tx = {
    clientObservation: { count: async () => observations, create: async (args) => writes.push(['observation.create', args]) },
    teamMember: { updateMany: async (args) => { writes.push(['member.updateMany', args]); return { count: highlightTaken ? 0 : 1 }; } },
    client: { update: async (args) => writes.push(['client.update', args]) },
    clientContract: { count: async () => contracts, create: async (args) => writes.push(['contract.create', args]) },
    task: { count: async () => tasks, create: async (args) => writes.push(['task.create', args]) },
  };
  return { writes, db: { ...tx, $transaction: async (run) => run(tx) } };
}

test('aplica fichas y contratos; las tareas solo con --crear-tareas', async () => {
  const { db, writes } = fakeDb();
  assert.deepEqual(await applyPlan(db, plan, { creatorUserId: 'u1' }), { clients: 1, contracts: 1, tasks: 0, observations: 1, highlights: 1 });
  assert.deepEqual(writes.map(([kind]) => kind), ['client.update', 'contract.create', 'observation.create', 'member.updateMany']);
  assert.equal(writes[1][1].data.source, 'EXCEL');
  assert.deepEqual(writes[2][1].data, { clientId: 'c1', text: 'Todo realizado, falta programar.', source: 'EXCEL', sourceLabel: 'Observaciones (MIO)', authorId: 'u1' });
  assert.deepEqual(writes[3][1].where, { id: 'm1', highlightedAction: null }, 'la acción destacada solo llena un hueco');
  const second = fakeDb();
  assert.deepEqual(await applyPlan(second.db, plan, { withTasks: true, creatorUserId: 'u1' }), { clients: 1, contracts: 1, tasks: 1, observations: 1, highlights: 1 });
  assert.equal(second.writes.find(([kind]) => kind === 'task.create')[1].data.creatorId, 'u1');
});

test('volver a correrlo no duplica contratos ni tareas', async () => {
  const { db, writes } = fakeDb({ contracts: 1, tasks: 1, observations: 1, highlightTaken: true });
  assert.deepEqual(await applyPlan(db, plan, { withTasks: true, creatorUserId: 'u1' }), { clients: 1, contracts: 0, tasks: 0, observations: 0, highlights: 0 });
  assert.deepEqual(writes.map(([kind]) => kind), ['client.update', 'member.updateMany']);
});

test('el informe dice el modo y cada sección', () => {
  const report = renderReport(plan, { confirmed: false, withTasks: false });
  assert.match(report, /simulación\*\*\. No se escribió nada/);
  for (const text of ['**Mimas** (Observaciones (MIO)): Todo realizado', '**Jarlan**: Informes', '**Mimas**: agency: BRAIN', 'contrato 2 Reel desde 2026-01-15', 'Community manager distinto.', 'Cliente Fantasma', 'Salsipuedes', 'no se crean sin `--crear-tareas`']) {
    assert.ok(report.includes(text), `falta «${text}»`);
  }
});
