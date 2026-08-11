import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loadQuotationDomain = async () => {
  try {
    return await import('../src/services/quotationDomainService.js');
  } catch {
    return {};
  }
};

test('an expired active quotation receives a fresh 15-day validity window when reissued', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.buildQuotationValidityUpdate, 'function');

  const now = new Date('2026-08-11T15:00:00.000Z');
  const update = domain.buildQuotationValidityUpdate({
    status: 'ACTIVA',
    expires_at: new Date('2026-08-01T15:00:00.000Z')
  }, 'ACTIVA', now);

  assert.deepEqual(update, {
    issued_at: now,
    reactivated_at: now,
    expires_at: new Date('2026-08-26T15:00:00.000Z')
  });
});

test('editing an unexpired active quotation does not silently extend its validity', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.buildQuotationValidityUpdate, 'function');

  const update = domain.buildQuotationValidityUpdate({
    status: 'ACTIVA',
    expires_at: new Date('2026-08-20T15:00:00.000Z')
  }, 'ACTIVA', new Date('2026-08-11T15:00:00.000Z'));

  assert.deepEqual(update, {});
});

test('issuing a draft starts its first 15-day validity window without marking it reactivated', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.buildQuotationValidityUpdate, 'function');

  const now = new Date('2026-08-11T15:00:00.000Z');
  const update = domain.buildQuotationValidityUpdate({
    status: 'BORRADOR',
    expires_at: new Date('2026-08-01T15:00:00.000Z')
  }, 'ACTIVA', now);

  assert.deepEqual(update, {
    issued_at: now,
    reactivated_at: null,
    expires_at: new Date('2026-08-26T15:00:00.000Z')
  });
});

test('catalog economics calculate real gain and margin from estimated cost and final price', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.calculateServiceEconomics, 'function');

  assert.deepEqual(domain.calculateServiceEconomics({
    estimatedCost: 433625,
    currentPrice: 350000,
    finalPrice: 730000
  }), {
    estimatedCost: 433625,
    currentPrice: 350000,
    finalPrice: 730000,
    estimatedProfit: 296375,
    estimatedMargin: 40.6
  });
});

test('quotation items use server catalog costs and reject invalid commercial values', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.prepareQuotationItems, 'function');

  const items = domain.prepareQuotationItems([{
    serviceId: 'service-1',
    name: 'Auditoria de marca',
    description: 'Diagnostico',
    price: 700000,
    quantity: 2,
    estimatedCost: 1,
    note: ''
  }], [{
    id: 'service-1',
    costo_real_estimado: 400000,
    valor_neto: 730000
  }]);

  assert.equal(items[0].estimatedCost, 400000);
  assert.equal(items[0].catalogFinalPrice, 730000);
  assert.throws(
    () => domain.prepareQuotationItems([{ name: 'Servicio', price: -1, quantity: 1 }], []),
    /precio/i
  );
  assert.throws(
    () => domain.prepareQuotationItems([{ name: 'Servicio', price: 10, quantity: 0 }], []),
    /cantidad/i
  );
});

test('quotation economics reflect the edited selling price and report incomplete cost coverage', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.calculateQuotationEconomics, 'function');

  assert.deepEqual(domain.calculateQuotationEconomics([
    { price: 700000, quantity: 2, estimatedCost: 400000 },
    { price: 100000, quantity: 1, estimatedCost: null }
  ]), {
    revenue: 1500000,
    estimatedCost: 800000,
    estimatedProfit: 600000,
    estimatedMargin: 42.9,
    pricedItems: 1,
    totalItems: 2,
    hasCompleteCostData: false
  });
});

test('public quotation serialization removes internal costs, margins, ids, and drafts', async () => {
  const domain = await loadQuotationDomain();
  assert.equal(typeof domain.serializePublicQuotation, 'function');

  assert.equal(domain.serializePublicQuotation({ status: 'BORRADOR' }), null);

  const result = domain.serializePublicQuotation({
    id: 'internal-id',
    uuid_slug: 'public-token',
    consecutive: 12,
    status: 'ACTIVA',
    emisor_type: 'BRAIN_STUDIO',
    client_name: 'Cliente',
    items: [{
      serviceId: 'service-1',
      name: 'Servicio',
      description: 'Detalle',
      price: 700000,
      quantity: 1,
      note: '',
      estimatedCost: 400000,
      estimatedProfit: 300000,
      catalogFinalPrice: 730000
    }],
    subtotal: 700000,
    tax_amount: 133000,
    total_amount: 833000
  });

  assert.equal(result.id, undefined);
  assert.equal(result.items[0].serviceId, undefined);
  assert.equal(result.items[0].estimatedCost, undefined);
  assert.equal(result.items[0].estimatedProfit, undefined);
  assert.equal(result.items[0].catalogFinalPrice, undefined);
  assert.equal(result.items[0].price, 700000);
});

test('quotation schema and UI expose the approved financial vocabulary', async () => {
  const [schema, catalog, form] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Quotations/CatalogManagement.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(schema, /costo_real_estimado\s+Decimal\?/);
  assert.match(schema, /issued_at\s+DateTime\?/);
  assert.match(schema, /reactivated_at\s+DateTime\?/);
  assert.match(schema, /updated_at\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/);
  assert.match(catalog, /Precio actual/);
  assert.doesNotMatch(catalog, /Precio Actual \(Neto\)/);
  assert.match(catalog, /Precio final/);
  assert.match(catalog, /Ganancia/);
  assert.match(form, /Margen estimado/);
});

test('internal catalog endpoints require authentication and public views avoid client debug logs', async () => {
  const [quotationRoutes, serviceRoutes, publicView] = await Promise.all([
    readFile(new URL('../src/routes/api/quotations.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api/services.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/Quotations/PublicQuotation.jsx', import.meta.url), 'utf8')
  ]);

  assert.ok(
    quotationRoutes.indexOf('router.use(authenticateToken') < quotationRoutes.indexOf("router.get('/catalog'"),
    'quotation catalog route must be declared after authentication'
  );
  assert.ok(
    serviceRoutes.indexOf('router.use(authenticateToken') < serviceRoutes.indexOf("router.get('/'"),
    'service catalog route must be declared after authentication'
  );
  assert.doesNotMatch(publicView, /console\.log/);
});

test('historical catalog cost backfill is additive and only targets missing costs', async () => {
  const script = await readFile(
    new URL('../scripts/backfill-service-costs.js', import.meta.url),
    'utf8'
  ).catch(() => '');

  assert.match(script, /costo_real_estimado:\s*null/);
  assert.match(script, /costo_real_estimado:\s*costByName\.get/);
  assert.doesNotMatch(script, /deleteMany|delete\(/);
});

test('drafts stay private and expired quotations can be filtered independently', async () => {
  const [form, list] = await Promise.all([
    readFile(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Quotations/QuotationList.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(form, /const shouldShare = targetStatus === 'ACTIVA'/);
  assert.match(list, /value="EXPIRADA"/);
  assert.match(list, /statusFilter === 'ACTIVA'[\s\S]{0,120}!q\.isExpired/);
});
