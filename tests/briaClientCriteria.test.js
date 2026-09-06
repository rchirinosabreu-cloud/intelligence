import test from 'node:test';
import assert from 'node:assert/strict';
import { canValidateClientCriterion, validateCriterionProposal, criterionDecision } from '../src/lib/briaClientCriteria.js';

const owner = { id: 'user-owner', role: 'EDITOR', isActive: true, modulePermissions: { parrillas: true } };
const plan = { owner: { userId: owner.id }, deletedAt: null };
test('criteria validation uses the plan owner user relation, plus active PM/admin; never names or team IDs', () => {
  assert.equal(canValidateClientCriterion(owner, plan), true);
  for (const role of ['ADMIN', 'PROJECT_MANAGER']) assert.equal(canValidateClientCriterion({ ...owner, id: 'manager', role }, plan), true);
  assert.equal(canValidateClientCriterion({ ...owner, id: 'someone-else' }, plan), false);
  assert.equal(canValidateClientCriterion({ ...owner, isActive: false }, plan), false);
  assert.equal(canValidateClientCriterion({ ...owner, modulePermissions: {} }, plan), false);
  assert.equal(canValidateClientCriterion(owner, { ...plan, deletedAt: new Date() }), false);
  assert.equal(canValidateClientCriterion({ ...owner, role: 'ADMIN' }, null), true);
});
test('proposal requires bounded explicit rule and justification, with a known category', () => {
  assert.deepEqual(validateCriterionProposal({ text: ' Usar tú en el contenido. ', reason: ' Aprobado en la guía actual. ', category: 'MARCA' }), {
    text: 'Usar tú en el contenido.', reason: 'Aprobado en la guía actual.', category: 'MARCA'
  });
  for (const bad of [{}, { text: 'x', reason: 'y', category: 'BAD' }, { text: 'x'.repeat(801), reason: 'y', category: 'MARCA' }]) {
    assert.throws(() => validateCriterionProposal(bad), { status: 400 });
  }
});
test('approval/rejection/revocation require a reason and exact expected version; no silent undo or auto-learning', () => {
  const criterion = { status: 'PROPOSED', version: 1 };
  assert.equal(criterionDecision(criterion, { action: 'APPROVE', version: 1, reason: 'Guía vigente confirmada.' }).status, 'APPROVED');
  assert.equal(criterionDecision(criterion, { action: 'REJECT', version: 1, reason: 'No es una regla general.' }).status, 'REJECTED');
  assert.equal(criterionDecision({ status: 'APPROVED', version: 2 }, { action: 'REVOKE', version: 2, reason: 'Cambió la estrategia.' }).status, 'REVOKED');
  assert.throws(() => criterionDecision(criterion, { action: 'APPROVE', version: 0, reason: 'Motivo' }), { status: 409 });
  assert.throws(() => criterionDecision(criterion, { action: 'APPROVE', version: 1, reason: ' ' }), { status: 400 });
  assert.throws(() => criterionDecision(criterion, { action: 'DISMISS', version: 1, reason: 'Motivo' }), { status: 400 });
  assert.throws(() => criterionDecision({ status: 'REVOKED', version: 3 }, { action: 'APPROVE', version: 3, reason: 'Motivo' }), { status: 409 });
});
