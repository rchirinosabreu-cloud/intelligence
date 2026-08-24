import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectManagerContinuityPlan, applyProjectManagerContinuityPlan } from '../src/services/payrollContinuityService.js';

test('separa a Gabriel y Kamila conservando el mismo cargo y las fechas confirmadas', () => {
  const plan = buildProjectManagerContinuityPlan({
    id: 'legacy', baseSalary: 3000000, socialSecurity: 0, positionId: 'position-1', importBatchId: 'batch-1'
  });
  assert.equal(plan.gabriel.endDate.toISOString(), '2026-06-16T12:00:00.000Z');
  assert.equal(plan.kamila.startDate.toISOString(), '2026-05-17T12:00:00.000Z');
  assert.equal(plan.gabriel.positionId, plan.kamila.positionId);
  assert.equal(plan.kamila.baseSalary, 3000000);
});

test('aplica la continuidad de forma transaccional sin mover la nómina de agosto de Kamila', async () => {
  const calls = [];
  const legacy = { id: 'kamila', displayName: 'Camila del toro', normalizedName: 'camila-del-toro', contracts: [{ id: 'contrato-k', baseSalary: 3000000, socialSecurity: 0, importBatchId: null }] };
  const tx = {
    financialCollaborator: {
      findFirst: async ({ where }) => where?.OR ? legacy : null,
      update: async ({ data }) => { calls.push(['kamila', data]); return legacy; },
      upsert: async ({ create }) => { calls.push(['gabriel', create]); return { id: 'gabriel' }; }
    },
    payrollPosition: { findFirst: async () => ({ id: 'pm' }) },
    payrollContract: {
      update: async ({ data }) => calls.push(['contrato-k', data]),
      findFirst: async () => null,
      create: async ({ data }) => calls.push(['contrato-g', data])
    },
    financialAuditEvent: { create: async ({ data }) => calls.push(['auditoria', data]) }
  };
  await applyProjectManagerContinuityPlan({ $transaction: async (callback) => callback(tx) }, { id: 'actor' });
  assert.equal(calls.find(([name]) => name === 'contrato-k')[1].startDate.toISOString().slice(0, 10), '2026-05-17');
  assert.equal(calls.find(([name]) => name === 'contrato-g')[1].endDate.toISOString().slice(0, 10), '2026-06-16');
  assert.equal(calls.some(([name]) => name === 'payrollTransaction'), false);
});
