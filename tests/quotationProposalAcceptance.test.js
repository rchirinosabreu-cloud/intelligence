import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptQuotationBySlug } from '../src/services/quotationAcceptanceService.js';
import { proposalDemo } from './fixtures/quotation-proposal-data.js';
test('accepting an enhanced proposal protects the exact commercial version the client saw', async () => {
  const quotation = { ...proposalDemo, status: 'ACTIVA', updated_at: new Date('2026-09-08T12:00:00Z'), subtotal: 14000000, tax_amount: 2660000, total_amount: 16660000 };
  let update;
  const tx = { quotation: { findUnique: async () => quotation, updateMany: async query => { update = query; return { count: 1 }; } }, user: { findMany: async () => [] } };
  const db = { $transaction: fn => fn(tx) };
  await assert.rejects(() => acceptQuotationBySlug({ db, slug: quotation.uuid_slug, expectedUpdatedAt: '2026-09-07T12:00:00Z' }), /versión/);
  assert.equal(update, undefined);
  const result = await acceptQuotationBySlug({ db, slug: quotation.uuid_slug, expectedUpdatedAt: quotation.updated_at.toISOString() });
  assert.equal(update.where.updated_at, quotation.updated_at);
  assert.deepEqual(result.quotation.proposal_details, quotation.proposal_details);
});
