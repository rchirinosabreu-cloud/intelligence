import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/quotation_test?connect_timeout=1';
globalThis.prisma = { quotation: { create() { throw new Error('Unstubbed persistence'); }, update() { throw new Error('Unstubbed persistence'); }, findUnique() { throw new Error('Unstubbed persistence'); } } };
const { default: prisma } = await import('../src/lib/prisma.js');
const { createQuotation, updateQuotation } = await import('../src/controllers/quotationController.js');
const details = { version: 1, title: 'CRM', paymentTermsConfirmed: true, paymentPlans: [{ mode: 'PERCENTAGE', scenarioId: null, installments: [{ id: 'a', label: 'Anticipo', value: 100, dueType: 'MILESTONE', milestone: 'Inicio' }] }] };
const body = { emisor_type: 'BRAIN_STUDIO', client_name: 'Demo', client_phone: '123', client_type: 'EMPRESA', currency: 'COP', status: 'ACTIVA', items: [{ name: 'CRM', quantity: 1, price: 100, billingType: 'ONE_TIME' }], proposal_details: details };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
test('creation stores the validated optional snapshot and legacy creation stays legacy', async t => {
  const writes = [];
  t.mock.method(prisma.quotation, 'create', async ({ data }) => { writes.push(data); return { ...data, consecutive: 1 }; });
  const res = response(); await createQuotation({ body }, res);
  assert.equal(res.code, 201); assert.equal(writes[0].proposal_details.title, 'CRM');
  const legacy = { ...body }; delete legacy.proposal_details;
  await createQuotation({ body: legacy }, response());
  assert.equal(writes[1].proposal_details, undefined);
});
test('bad installments return 400 without creating data', async t => {
  let writes = 0;
  t.mock.method(prisma.quotation, 'create', async () => { writes++; return { consecutive: 1 }; });
  const res = response(); await createQuotation({ body: { ...body, proposal_details: { ...details, paymentTermsConfirmed: false } } }, res);
  assert.equal(res.code, 400); assert.equal(writes, 0);
});
test('editing retains omitted details and guards against acceptance racing the save', async t => {
  const existing = { ...body, id: 'demo', consecutive: 1, updated_at: new Date(), proposal_details: details };
  t.mock.method(prisma.quotation, 'findUnique', async () => existing);
  let query;
  t.mock.method(prisma.quotation, 'update', async args => { query = args; return { ...existing, ...args.data }; });
  const patch = { ...body }; delete patch.proposal_details;
  const res = response(); await updateQuotation({ params: { id: 'demo' }, body: patch }, res);
  assert.equal(res.code, 200); assert.equal(query.data.proposal_details.title, 'CRM');
  assert.deepEqual(query.where.status, { not: 'APROBADA' });
  assert.equal(query.where.updated_at, existing.updated_at);
});
test('approved quotation rejects edits to all proposal blocks', async t => {
  t.mock.method(prisma.quotation, 'findUnique', async () => ({ status: 'APROBADA' }));
  const res = response(); await updateQuotation({ params: { id: 'demo' }, body }, res);
  assert.equal(res.code, 409);
});

test('emitir no exige celular: basta el cliente o la empresa y un servicio (Rodny, 27 de noviembre de 2026)', async t => {
  t.mock.method(prisma.quotation, 'create', async ({ data }) => ({ ...data, consecutive: 2 }));
  const sinCelular = { ...body, client_phone: '' }; delete sinCelular.proposal_details;
  const res = response(); await createQuotation({ body: sinCelular }, res);
  assert.equal(res.code, 201);
  const soloEmpresa = { ...sinCelular, client_name: '', client_company: 'FoobeSpain' };
  const company = response(); await createQuotation({ body: soloEmpresa }, company);
  assert.equal(company.code, 201);
  const nadie = response(); await createQuotation({ body: { ...soloEmpresa, client_company: '' } }, nadie);
  assert.equal(nadie.code, 400); assert.match(nadie.data.error, /nombre del cliente o de la empresa/);
});
