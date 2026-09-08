import test from 'node:test';
import assert from 'node:assert/strict';
import * as terms from '../src/services/quotationContractTerms.js';
test('structured payment plan replaces only the known default clause, not custom agreements', () => {
  assert.equal(typeof terms.termsWithProposalPayments, 'function');
  const original = terms.buildContractTermsText(['general-payment', 'general-validity'], ['Cuota especial acordada con el cliente.']);
  assert.equal(terms.termsWithProposalPayments(original, false), original);
  const updated = terms.termsWithProposalPayments(original, true);
  assert.doesNotMatch(updated, /abono del 50%/); assert.match(updated, /plan de pagos detallado/);
  assert.match(updated, /Cuota especial acordada/); assert.match(updated, /15 días/);
  assert.equal(terms.termsWithProposalPayments(updated, true), updated);
});
