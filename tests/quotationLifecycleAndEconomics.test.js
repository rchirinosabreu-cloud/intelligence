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

test('quotation product titles are normalized to title case at the domain boundary', async () => {
  const domain = await loadQuotationDomain();

  assert.equal(
    domain.normalizeQuotationItemTitle('  EVOLUCIÓN INTEGRAL DE IDENTIDAD VISUAL Y APLICACIONES DE MARCA  '),
    'Evolución Integral De Identidad Visual Y Aplicaciones De Marca'
  );
  assert.equal(domain.normalizeQuotationItemTitle('DISEÑO WEB - E-COMMERCE'), 'Diseño Web - E-Commerce');
  assert.equal(
    domain.prepareQuotationItems([{ name: 'MARKETING ESTÁNDAR', price: 100, quantity: 1 }])[0].name,
    'Marketing Estándar'
  );
});

test('quotation editor normalizes manually edited product titles when leaving the field', async () => {
  const form = await readFile(
    new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url),
    'utf8'
  );

  assert.match(form, /normalizeQuotationItemTitle/);
  assert.match(form, /onBlur=\{\(\) => updateItem\(idx, 'name', normalizeQuotationItemTitle\(item\.name\)\)\}/);
});

test('quotation totals multiply monthly services by duration and charge one-time services once', async () => {
  const domain = await loadQuotationDomain();

  assert.deepEqual(domain.calculateQuotationTotals([
    { price: 1000000, quantity: 1, billingType: 'MONTHLY' },
    { price: 500000, quantity: 1, billingType: 'ONE_TIME' }
  ], false, { durationMonths: 3 }), {
    durationMonths: 3,
    monthlySubtotal: 1000000,
    oneTimeSubtotal: 500000,
    grossSubtotal: 3500000,
    discountAmount: 0,
    subtotal: 3500000,
    taxAmount: 665000,
    totalAmount: 4165000
  });
});

test('quotation discounts apply before tax and cannot exceed the contractual gross subtotal', async () => {
  const domain = await loadQuotationDomain();
  const items = [{ price: 1000000, quantity: 1, billingType: 'MONTHLY' }];

  assert.equal(domain.calculateQuotationTotals(items, false, {
    durationMonths: 3,
    discountType: 'PERCENTAGE',
    discountValue: 10
  }).totalAmount, 3213000);
  assert.deepEqual(domain.calculateQuotationTotals(items, true, {
    durationMonths: 2,
    discountType: 'FIXED',
    discountValue: 2500000
  }), {
    durationMonths: 2,
    monthlySubtotal: 1000000,
    oneTimeSubtotal: 0,
    grossSubtotal: 2000000,
    discountAmount: 2000000,
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0
  });
});

test('commercial configuration validates duration, billing type and discount values', async () => {
  const domain = await loadQuotationDomain();

  assert.equal(domain.normalizeQuotationDuration(6), 6);
  assert.throws(() => domain.normalizeQuotationDuration(0), /duraci[oó]n/i);
  assert.throws(() => domain.normalizeQuotationDuration(2.5), /duraci[oó]n/i);
  assert.throws(
    () => domain.prepareQuotationItems([{ name: 'Servicio', price: 10, quantity: 1, billingType: 'WEEKLY' }]),
    /periodicidad/i
  );
  assert.throws(
    () => domain.normalizeQuotationDiscount({ type: 'PERCENTAGE', value: 101 }),
    /descuento/i
  );
});

test('quotation economics account for duration, one-time costs and the commercial discount', async () => {
  const domain = await loadQuotationDomain();

  assert.deepEqual(domain.calculateQuotationEconomics([
    { price: 1000000, quantity: 1, estimatedCost: 400000, billingType: 'MONTHLY' },
    { price: 500000, quantity: 1, estimatedCost: 200000, billingType: 'ONE_TIME' }
  ], {
    durationMonths: 3,
    discountType: 'PERCENTAGE',
    discountValue: 10
  }), {
    revenue: 3150000,
    estimatedCost: 1400000,
    estimatedProfit: 1750000,
    estimatedMargin: 55.6,
    pricedItems: 2,
    totalItems: 2,
    hasCompleteCostData: true
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

test('scenario metadata survives sanitization and can be grouped without exposing costs', async () => {
  const domain = await loadQuotationDomain();
  const items = domain.prepareQuotationItems([{
    name: 'Plan básico', price: 1000000, quantity: 1, scenarioId: 'option-1',
    scenarioName: 'Reactivación básica', scenarioDescription: 'Seis contenidos',
    scenarioExternalBudget: 400000, scenarioExternalBudgetNote: 'Pago directo a Meta', scenarioOrder: 0
  }]);
  const scenarios = domain.groupQuotationScenarios(items);

  assert.equal(domain.isScenarioQuotation(items), true);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].name, 'Reactivación básica');
  assert.equal(scenarios[0].externalBudget, 400000);
  assert.equal(scenarios[0].items[0].price, 1000000);
});

test('scenario commercial metadata survives sanitization and remains independent per option', async () => {
  const domain = await loadQuotationDomain();
  const items = domain.prepareQuotationItems([
    {
      name: 'Plan A', price: 1000000, quantity: 1, billingType: 'MONTHLY', scenarioId: 'a',
      scenarioName: 'Base', scenarioOrder: 0, scenarioDiscountType: 'PERCENTAGE',
      scenarioDiscountValue: 10, scenarioDiscountLabel: 'Descuento de lanzamiento'
    },
    {
      name: 'Plan B', price: 1500000, quantity: 1, billingType: 'MONTHLY', scenarioId: 'b',
      scenarioName: 'Pro', scenarioOrder: 1, scenarioDiscountType: 'FIXED',
      scenarioDiscountValue: 200000, scenarioDiscountLabel: 'Beneficio comercial'
    }
  ]);
  const scenarios = domain.groupQuotationScenarios(items);

  assert.equal(scenarios[0].discountType, 'PERCENTAGE');
  assert.equal(scenarios[0].discountValue, 10);
  assert.equal(scenarios[0].discountLabel, 'Descuento de lanzamiento');
  assert.equal(scenarios[1].discountType, 'FIXED');
  assert.equal(scenarios[1].discountValue, 200000);
  assert.equal(items[0].billingType, 'MONTHLY');
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
  assert.match(catalog, /Precio oficial/);
  assert.match(catalog, /Costo de producción/);
  assert.doesNotMatch(catalog, /Costo de producir el servicio/);
  assert.doesNotMatch(catalog, /Precio base anterior/);
  assert.doesNotMatch(catalog, /Precio Actual \(Neto\)/);
  assert.match(catalog, /Precio comercial sugerido/);
  assert.match(catalog, /Valor variable/);
  assert.match(catalog, /flex flex-wrap gap-2/);
  assert.match(catalog, /md:w-72/);
  assert.match(catalog, /Ganancia/);
  assert.match(form, /Margen estimado/);
  assert.match(form, /Costo de producción/);
  assert.doesNotMatch(form, /Base anterior/);
  assert.match(form, /Number\(service\.valor_neto\)/);
  assert.doesNotMatch(form, /quotePrice[\s\S]{0,160}Number\(service\.valor_neto_actual\)/);
  assert.match(schema, /duration_months\s+Int\s+@default\(1\)/);
  assert.match(schema, /discount_type\s+QuotationDiscountType\?/);
  assert.match(schema, /discount_value\s+Decimal\s+@default\(0\)/);
  assert.match(schema, /discount_amount\s+Decimal\s+@default\(0\)/);
  assert.match(form, /Duraci[oó]n de la propuesta/i);
  assert.match(form, /Pago mensual/i);
  assert.match(form, /Pago [uú]nico/i);
  assert.match(form, /Aplicar a todos los escenarios/i);
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

test('quotation title normalization script updates catalog and stored JSON without destructive writes', async () => {
  const script = await readFile(
    new URL('../scripts/normalize-quotation-titles.js', import.meta.url),
    'utf8'
  ).catch(() => '');

  assert.match(script, /serviceCatalog\.findMany/);
  assert.match(script, /quotation\.findMany/);
  assert.match(script, /normalizeQuotationItemTitle/);
  assert.match(script, /\$transaction/);
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
