import test from 'node:test';
import assert from 'node:assert/strict';
const { prepareGovernedReview } = await import('../src/services/aiGovernanceGate.js').catch(() => ({}));
test('un bloqueo impide enviar al proveedor y consultar memoria', async () => {
  assert.equal(typeof prepareGovernedReview, 'function');
  let sent = 0;
  const service = { policy: async () => ({ enabled: true }), assertUse: async () => { throw new Error('blocked'); } };
  await assert.rejects(prepareGovernedReview({ ai: { generate: async () => sent++ }, clientId: 'c', governance: service }), /blocked/);
  assert.equal(sent, 0);
});
test('revalida antes de cada lote; revocar detiene la próxima llamada', async () => {
  assert.equal(typeof prepareGovernedReview, 'function');
  let revoked = false, calls = 0;
  const service = { policy: async () => ({ enabled: true }), assertUse: async () => { if (revoked) throw new Error('revoked'); return { enforced: true }; } };
  const result = await prepareGovernedReview({ ai: { generate: async () => { calls++; return { text: 'test' }; } }, clientId: 'c', governance: service });
  assert.equal(result.useHistoricalMemory, false);
  await result.ai.generate({ model: 'm', prompt: 'test' });
  revoked = true;
  await assert.rejects(result.ai.generate({ model: 'm', prompt: 'test' }), /revoked/);
  assert.equal(calls, 1);
});
test('activar el control durante un análisis sin control interrumpe la ejecución', async () => {
  assert.equal(typeof prepareGovernedReview, 'function');
  let enabled = false;
  const service = { policy: async () => ({ enabled }), assertUse: async () => ({ enforced: enabled }) };
  const result = await prepareGovernedReview({ ai: { generate: async () => { throw new Error('must not send'); } }, clientId: 'c', governance: service });
  assert.equal(result.useHistoricalMemory, true); enabled = true;
  await assert.rejects(result.ai.generate({ model: 'm' }), e => e.code === 'AI_GOVERNANCE_CHANGED');
});

test('si la activación ocurre entre la consulta de política y la autorización tampoco envía memoria anterior', async () => {
  const result = await prepareGovernedReview({ clientId: 'c', ai: { generate: async () => 'unsafe' }, governance: {
    policy: async () => ({ enabled: false }), assertUse: async () => ({ enforced: true })
  } });
  await assert.rejects(result.ai.generate({ model: 'm' }), e => e.code === 'AI_GOVERNANCE_CHANGED');
});

test('la revisión real valida antes de consultar memoria y no llama al proveedor sin permiso', async () => {
  const { reviewContentPlanWithBria } = await import('../src/services/briaContentPlanReviewService.js');
  let memory = 0, calls = 0;
  await assert.rejects(reviewContentPlanWithBria({
    planId: 'p', getPlan: async () => ({ id: 'p', clientId: 'c', items: [] }),
    searchMemory: async () => { memory++; return []; }, ai: { generate: async () => { calls++; } },
    governance: { policy: async () => ({ enabled: true }), assertUse: async () => { throw new Error('no permission'); } }
  }), /no permission/);
  assert.equal(memory, 0); assert.equal(calls, 0);
});
