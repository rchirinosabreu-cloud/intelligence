import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareQuotationItems, serializePublicQuotation } from '../src/services/quotationDomainService.js';
const url = new URL('../src/services/quotationProposalDetails.js', import.meta.url);
const subject = fs.existsSync(url) ? await import(url.href) : {};
const call = (name, ...args) => { assert.equal(typeof subject[name], 'function', name); return subject[name](...args); };
const installments = [
  { id: 'a', label: 'Inicio', value: 50, dueType: 'MILESTONE', milestone: 'Al iniciar' },
  { id: 'b', label: 'Núcleo CRM', value: 30, dueType: 'DATE', date: '2026-10-15' },
  { id: 'c', label: 'Entrega', value: 20, dueType: 'AFTER_START', days: 60 }
];
const plan = { mode: 'PERCENTAGE', scenarioId: null, installments };
const totals = { subtotal: 14000000, taxAmount: 2660000, totalAmount: 16660000 };
const options = { issue: true, totalsByScenario: [{ id: null, totals }] };

test('old quotations remain without proposal details', () => {
  assert.equal(call('normalizeProposalDetails', null, options), null);
});
test('custom items retain rich descriptions and duration without needing catalog products', () => {
  const [item] = prepareQuotationItems([{ name: 'CRM a medida', price: 1000, quantity: 1, billingType: 'ONE_TIME', descriptionHtml: '<p><strong>Incluye</strong> CRM</p>', group: 'Desarrollo 1', execution: { min: 2, max: 4, unit: 'WEEKS', startNote: 'Con accesos completos' } }]);
  assert.equal(item.serviceId, undefined);
  assert.equal(item.estimatedCost, null);
  assert.equal(item.descriptionHtml, '<p><strong>Incluye</strong> CRM</p>');
  assert.equal(item.execution.max, 4);
  assert.equal(item.group, 'Desarrollo 1');
});
test('safe formatting survives while scripts, styles, images and unsafe links are removed', () => {
  const html = call('sanitizeProposalHtml', '<h2>Título</h2><p><strong>Claro</strong> <u>subrayado</u><a href="javascript:alert(1)">no</a><a href="https://brainstudio.co/">Caso</a><img src=x onerror=alert(1)><script>alert(1)</script></p>');
  assert.match(html, /<strong>Claro<\/strong>/); assert.match(html, /<u>subrayado<\/u>/);
  assert.match(html, /href="https:\/\/brainstudio.co\/"/); assert.doesNotMatch(html, /javascript:|script|<img|onerror/);
  assert.throws(() => call('sanitizeProposalHtml', 'x'.repeat(20001)), /límite/);
});
test('rich text blocks preserve bold, underline, links and bullet paragraphs for PDF', () => {
  const blocks = call('proposalRichTextBlocks', '<h2>Entregables</h2><ul><li><p><strong>CRM</strong> con <u>trazabilidad</u> y <a href="https://example.com/">demo</a></p></li></ul>');
  assert.equal(blocks[0].heading, 2);
  assert.equal(blocks[1].bullet, true);
  assert.ok(blocks[1].runs.some(run => run.bold && run.text === 'CRM'));
  assert.ok(blocks[1].runs.some(run => run.underline && run.text === 'trazabilidad'));
  assert.ok(blocks[1].runs.some(run => run.href === 'https://example.com/'));
});
test('payment installments allocate base and VAT once and sum exactly to the discounted total', () => {
  const schedule = call('calculateProposalPayments', plan, totals);
  assert.deepEqual(schedule.map(row => row.amount), [8330000, 4998000, 3332000]);
  assert.deepEqual(schedule.map(row => row.baseAmount), [7000000, 4200000, 2800000]);
  assert.equal(schedule.reduce((sum, row) => sum + row.taxAmount, 0), 2660000);
});
test('rounding assigns the final cent explicitly without changing the proposal total', () => {
  const schedule = call('calculateProposalPayments', { ...plan, installments: installments.map((row, i) => ({ ...row, value: [33.33,33.33,33.34][i] })) }, { subtotal: 0.05, taxAmount: 0.01, totalAmount: 0.06 });
  assert.equal(Math.round(schedule.reduce((sum, row) => sum + row.amount, 0) * 100), 6);
  assert.equal(Math.round(schedule.reduce((sum, row) => sum + row.taxAmount, 0) * 100), 1);
});
test('issuing rejects missing money, mismatched percentages, invalid dates and duplicate ids', () => {
  for (const bad of [
    { ...plan, installments: installments.slice(0,2) },
    { ...plan, installments: installments.map(row => ({ ...row, id: 'same' })) },
    { ...plan, installments: installments.map(row => ({ ...row, dueType: 'DATE', date: '2026-02-30' })) },
    { ...plan, mode: 'FIXED', installments }
  ]) assert.throws(() => call('normalizeProposalDetails', { version: 1, paymentPlans: [bad], paymentTermsConfirmed: true }, options));
});
test('payment plan requires explicit confirmation of compatible terms before issue, not to save a draft', () => {
  assert.throws(() => call('normalizeProposalDetails', { version: 1, paymentPlans: [plan] }, options), /condiciones/);
  const draft = call('normalizeProposalDetails', { version: 1, paymentPlans: [{ ...plan, installments: [] }] }, { ...options, issue: false });
  assert.equal(draft.paymentPlans.length, 1);
});
test('execution units do not multiply billing and phase order is independent of scenarios', () => {
  const result = call('normalizeProposalDetails', { version: 1, execution: { min: 9, max: 12, unit: 'WEEKS' }, phases: [{ id: 'f1', title: 'CRM', execution: { min: 3, max: 4, unit: 'WEEKS' }, starts: 'AT_START' }, { id: 'f2', title: 'Remisiones', execution: { min: 1, max: 2, unit: 'WEEKS' }, starts: 'PARALLEL' }] }, options);
  assert.equal(result.execution.max, 12); assert.equal(result.phases[1].starts, 'PARALLEL');
  assert.equal(result.duration_months, undefined);
  assert.throws(() => call('normalizeProposalDetails', { version: 1, execution: { min: 4, max: 2, unit: 'WEEKS' } }, options), /duración/i);
});
test('scenario payment plans must apply to real alternatives with a valid total for each', () => {
  const context = { issue: true, totalsByScenario: [{ id: 'a', totals }, { id: 'b', totals: { subtotal: 100, taxAmount: 0, totalAmount: 100 } }] };
  assert.throws(() => call('normalizeProposalDetails', { version: 1, paymentPlans: [{ ...plan, scenarioId: 'unknown' }], paymentTermsConfirmed: true }, context), /escenario/);
  const result = call('normalizeProposalDetails', { version: 1, paymentPlans: [plan], paymentTermsConfirmed: true }, context);
  assert.equal(result.paymentPlans[0].scenarioId, null);
});
test('public serialization allows proposal content and custom fields, never internal margins', () => {
  const data = serializePublicQuotation({ status: 'ACTIVA', proposal_details: { version: 1, title: 'SunPartners', secret: 'private' }, items: [{ name: 'CRM', descriptionHtml: '<p>Hola</p>', group: 'Desarrollo 1', estimatedCost: 100, price: 500, quantity: 1 }] });
  assert.equal(data.proposal_details.title, 'SunPartners');
  assert.equal(data.proposal_details.secret, undefined);
  assert.equal(data.items[0].descriptionHtml, '<p>Hola</p>');
  assert.equal(data.items[0].estimatedCost, undefined);
});
test('numbered lists keep their order, and a zero maximum duration is not accepted', () => {
  const blocks = call('proposalRichTextBlocks', '<ol><li>Primero</li><li>Segundo</li></ol>');
  assert.deepEqual(blocks.map(block => block.ordinal), [1, 2]);
  assert.throws(() => call('normalizeExecution', { min: 1, max: 0, unit: 'WEEKS' }), /duración/);
});
test('malformed nested values produce a validation error, not an internal exception', () => {
  for (const payload of [{ version: 1, phases: [null] }, { version: 1, paymentPlans: [null] }, { version: 1, paymentPlans: [{ mode: 'FIXED', installments: [null] }] }]) {
    assert.throws(() => call('normalizeProposalDetails', payload), error => error.statusCode === 400);
  }
});
