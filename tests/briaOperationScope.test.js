import test from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/services/briaAssistantTools.js';

const row = () => ({
  id: 'client-synthetic', name: 'Cuenta de prueba', slug: 'cuenta-prueba',
  projectManager: { name: 'Responsable PM' }, communityManager: { name: 'Responsable CM' },
  contract: {
    serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-11-01', endDate: '2026-12-31',
    deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Post', quantity: 4 }],
    storiesPerWeek: 3, productionDays: 1, monthlyReport: true
  },
  cycles: { current: { label: 'Noviembre 2026', quota: 6, created: 5, reached: { publicada: 2 }, report: null } },
  evaluation: { level: 'green', reasons: [] }, openTasks: []
});
const context = account => ({
  user: { userId: 'user-synthetic', role: 'PROJECT_MANAGER' },
  operations: { getOperation: async () => account, listOperations: async () => [account] }
});
const detail = async account => (await toolByName('operacion_de_cliente').run({ slug: account.slug }, context(account))).data.operacion;

test('an existing report is delivered only when sent; earlier workflow states never prove delivery', async t => {
  for (const status of ['PENDIENTE', 'EN_ELABORACION', 'EN_REVISION', 'ENVIADO', 'DESCONOCIDO']) {
    await t.test(status, async () => {
      const account = row();
      account.cycles.current.report = { status, deliveredAt: '2026-11-03', link: 'https://example.test/report' };
      const result = await detail(account);
      assert.equal(result.mesActual.informeEntregado, status === 'ENVIADO');
      assert.equal(result.mesActual.estadoInforme, status);
      assert.equal(result.mesActual.fechaEntregaInforme, status === 'ENVIADO' ? '2026-11-03' : null);
    });
  }
});

test('legacy reports require delivery evidence, not merely an object, link or note', async t => {
  const cases = [
    { report: null, delivered: false },
    { report: {}, delivered: false },
    { report: { link: 'https://example.test/report', note: 'Borrador' }, delivered: false },
    { report: { deliveredAt: 'not-a-date' }, delivered: false },
    { report: { deliveredAt: '2026-02-30' }, delivered: false },
    { report: { deliveredAt: null }, delivered: false },
    { report: { status: '', deliveredAt: '2026-11-03' }, delivered: false },
    { report: { deliveredAt: '2026-11-03' }, delivered: true },
    { report: { status: null, deliveredAt: '2026-11-03T15:30:00.000Z' }, delivered: true }
  ];
  for (const [index, item] of cases.entries()) await t.test(String(index), async () => {
    const account = row(); account.cycles.current.report = item.report;
    const result = await detail(account);
    assert.equal(result.mesActual.informeEntregado, item.delivered);
    if (item.report) assert.equal(result.mesActual.estadoInforme, item.report.status ?? null);
  });
});

test('sent reports keep their status but never present an invalid delivery date as evidence', async t => {
  for (const deliveredAt of ['not-a-date', '2026-02-30', 42, false, { privateDate: 'NOT_A_DATE' }, null]) {
    await t.test(JSON.stringify(deliveredAt), async () => {
      const account = row(); account.cycles.current.report = { status: 'ENVIADO', deliveredAt };
      const result = await detail(account);
      assert.equal(result.mesActual.informeEntregado, true);
      assert.equal(result.mesActual.estadoInforme, 'ENVIADO');
      assert.equal(result.mesActual.fechaEntregaInforme, null);
    });
  }
});

const scope = () => ({
  version: 1,
  contentLimits: [
    { format: 'Reel', quantity: 6, rule: 'MAXIMO' },
    { format: 'Carrusel', quantity: 2, rule: 'MINIMO' },
    { format: 'Otro', quantity: null, rule: 'EXACTA' }
  ],
  stories: { quantity: 8, period: 'MES', perOccasion: null },
  production: { included: true, quantity: 2, period: 'CONTRATO', hours: 2.5, rule: 'MAXIMO', hoursRule: 'MAXIMO' },
  additionalServices: [
    { id: 'blog', category: 'BLOG', label: 'Artículos', quantity: 2, unit: 'artículos', frequency: 'MES', notes: null },
    { id: 'web', category: 'WEB', label: 'Mantenimiento', quantity: null, unit: null, frequency: 'PUNTUAL', notes: 'Falta definir cobertura' },
    { id: 'community', category: 'COMUNIDAD', label: 'Comunidad', quantity: 0, unit: 'horas', frequency: null, notes: null },
    { id: 'brands', category: 'MARCAS', label: 'Marcas', quantity: 3, unit: 'marcas', frequency: 'CONTRATO', notes: 'Bolsa compartida' },
    { id: 'profiles', category: 'PERFILES', label: 'Perfiles', quantity: 7, unit: 'perfiles', frequency: 'CONTRATO', notes: null },
    { id: 'other', category: 'OTRO', label: 'Evento', quantity: null, unit: null, frequency: null, notes: null }
  ],
  reviewPending: 'Confirmar fecha de aplicación y cobertura del servicio web'
});

test('detailed scope preserves limits, units, categories and unknowns without combining legacy quantities', async () => {
  const account = row(); account.contract.scopeDetails = scope();
  const before = structuredClone(account);
  const result = await detail(account);
  assert.deepEqual(result.contrato.alcanceDetallado, scope());
  assert.equal(Object.hasOwn(result.contrato, 'historiasPorSemana'), false, '8 per month must not coexist with the old weekly quantity');
  assert.equal(Object.hasOwn(result.contrato, 'jornadasPorMes'), false, '2 per contract must not become a monthly quantity');
  assert.equal(result.contrato.piezasPorMes, 6, 'limits are not added to the native quota');
  assert.deepEqual(result.contrato.entregablesPorFormato, [{ formato: 'Reel', cantidad: 2 }, { formato: 'Post', cantidad: 4 }]);
  assert.equal(result.mesActual.piezasContratadas, 6);
  assert.equal(result.mesActual.publicadas, 2);
  assert.equal(result.semaforo, 'verde');
  assert.deepEqual(account, before, 'a Bria read never changes contract or execution');
});

test('shared format groups reach detail and portfolio without becoming individual quotas', async () => {
  const account = row();
  const contentGroups = [
    { formats: ['Reel', 'Video', 'Carrusel', 'Post'], quantity: 20, rule: 'EXACTA' },
    { formats: ['Reel', 'Video'], quantity: 6, rule: 'MAXIMO' },
    { formats: ['Post', 'Carrusel'], quantity: null, rule: 'MINIMO' },
  ];
  account.contract.scopeDetails = { ...scope(), contentGroups };
  const before = structuredClone(account);
  account.contract.scopeDetails.contentGroups[0].price = { invoice: 'PRIVATE_FINANCE_VALUE' };
  const result = await detail(account);
  assert.deepEqual(result.contrato.alcanceDetallado, before.contract.scopeDetails);
  assert.equal(result.contrato.piezasPorMes, 6);
  const portfolio = await toolByName('cartera_de_operacion').run({}, context(account));
  assert.deepEqual(portfolio.data.cuentas[0].contrato.alcanceDetallado.contentGroups, contentGroups.map(({ formats, quantity, rule }) => ({ formats, quantity, rule })));
  assert.equal(portfolio.data.cuentas[0].mesActual.contratadas, 6);
  assert.doesNotMatch(JSON.stringify({ result, portfolio }), /PRIVATE_FINANCE_VALUE/);
  for (const name of ['operacion_de_cliente', 'cartera_de_operacion']) {
    assert.match(toolByName(name).description, /contentGroups/);
    assert.match(toolByName(name).description, /conjunto/);
  }
});

test('unknown detailed quantities override old counts and preserve days-per-week without inventing pieces', async () => {
  const account = row(); account.contract.scopeDetails = {
    version: 1, contentLimits: [],
    stories: { quantity: 3, period: 'DIAS_SEMANA', perOccasion: null },
    production: { included: null, quantity: null, period: null, hours: null, rule: 'EXACTA', hoursRule: 'EXACTA' },
    additionalServices: [], reviewPending: null
  };
  const result = await detail(account);
  assert.deepEqual(result.contrato.alcanceDetallado, account.contract.scopeDetails);
  assert.equal(Object.hasOwn(result.contrato, 'historiasPorSemana'), false);
  assert.equal(Object.hasOwn(result.contrato, 'jornadasPorMes'), false);
});

test('absent detailed sections retain known legacy quantities, including an explicit zero', async () => {
  const account = row(); account.contract.storiesPerWeek = 0;
  account.contract.scopeDetails = { version: 1, contentLimits: [], stories: null, production: null, additionalServices: [], reviewPending: null };
  const result = await detail(account);
  assert.equal(result.contrato.historiasPorSemana, 0);
  assert.equal(result.contrato.jornadasPorMes, 1);
  assert.deepEqual(result.contrato.alcanceDetallado, account.contract.scopeDetails);
});

test('an incompatible scope remains explicitly unreadable and never falls back to old story or production quantities', async t => {
  for (const [label, value] of [['future-version', { ...scope(), version: 2 }], ['missing-version', {}], ['array', []], ['boolean', false]]) {
    await t.test(label, async () => {
      const account = row(); account.contract.scopeDetails = value;
      const result = await detail(account);
      assert.equal(result.contrato.alcanceDetallado, null);
      assert.equal(result.contrato.estadoAlcanceDetallado, 'NO_INTERPRETABLE');
      assert.equal(Object.hasOwn(result.contrato, 'historiasPorSemana'), false);
      assert.equal(Object.hasOwn(result.contrato, 'jornadasPorMes'), false);
      assert.equal(result.mesActual.piezasContratadas, 6);
      const portfolio = await toolByName('cartera_de_operacion').run({}, context(account));
      assert.equal(portfolio.data.cuentas[0].contrato.alcanceDetallado, null);
      assert.equal(portfolio.data.cuentas[0].contrato.estadoAlcanceDetallado, 'NO_INTERPRETABLE');
    });
  }
});

test('malformed scope sections stay unreadable without hiding the rest of the portfolio or exposing nested data', async t => {
  const cases = [
    ['group list object', { contentGroups: { invoice: 'PRIVATE_FINANCE_VALUE' } }],
    ['null group row', { contentGroups: [null] }],
    ['nested group formats', { contentGroups: [{ formats: [{ invoice: 'PRIVATE_FINANCE_VALUE' }], quantity: 6, rule: 'MAXIMO' }] }],
    ['formats are not a list', { contentGroups: [{ formats: 'PRIVATE_FINANCE_VALUE', quantity: 6, rule: 'MAXIMO' }] }],
    ['nested group quantity', { contentGroups: [{ formats: ['Reel', 'Video'], quantity: { invoice: 'PRIVATE_FINANCE_VALUE' }, rule: 'MAXIMO' }] }],
    ['null content row', { contentLimits: [null] }],
    ['null service row', { additionalServices: [null] }],
    ['primitive content row', { contentLimits: [42] }],
    ['primitive service row', { additionalServices: ['PRIVATE_FINANCE_VALUE'] }],
    ['content list object', { contentLimits: { invoice: 'PRIVATE_FINANCE_VALUE' } }],
    ['service list object', { additionalServices: { invoice: 'PRIVATE_FINANCE_VALUE' } }],
    ['primitive stories', { stories: false }],
    ['production array', { production: [] }],
    ['nested quantity', { stories: { quantity: { invoice: 'PRIVATE_FINANCE_VALUE' }, period: 'MES' } }],
    ['wrong quantity type', { production: { quantity: 'PRIVATE_FINANCE_VALUE' } }],
    ['nested notes', { additionalServices: [{ id: 'web', notes: { invoice: 'PRIVATE_FINANCE_VALUE' } }] }],
    ['nested review', { reviewPending: { invoice: 'PRIVATE_FINANCE_VALUE' } }]
  ];
  for (const [label, malformed] of cases) await t.test(label, async () => {
    const account = row(); account.contract.scopeDetails = { ...scope(), ...malformed };
    const healthy = row(); healthy.id = 'healthy-client'; healthy.contract.scopeDetails = scope();
    const ctx = context(account); ctx.operations.listOperations = async () => [account, healthy];
    const operation = await detail(account);
    assert.equal(operation.contrato.alcanceDetallado, null);
    assert.equal(operation.contrato.estadoAlcanceDetallado, 'NO_INTERPRETABLE');
    assert.equal(Object.hasOwn(operation.contrato, 'historiasPorSemana'), false);
    assert.equal(Object.hasOwn(operation.contrato, 'jornadasPorMes'), false);
    const portfolio = await toolByName('cartera_de_operacion').run({}, ctx);
    assert.equal(portfolio.data.cuentas.length, 2);
    assert.equal(portfolio.data.cuentas.find(item => item.clientId === account.id).contrato.estadoAlcanceDetallado, 'NO_INTERPRETABLE');
    assert.deepEqual(portfolio.data.cuentas.find(item => item.clientId === healthy.id).contrato.alcanceDetallado, scope());
    assert.doesNotMatch(JSON.stringify({ operation, portfolio }), /PRIVATE_FINANCE_VALUE/);
  });
});

test('scope projection ignores unknown fields at every level and preserves partial unknown operational fields', async () => {
  const account = row(); account.contract.scopeDetails = scope();
  const privateValue = { invoice: 'PRIVATE_FINANCE_VALUE' };
  account.contract.scopeDetails.financials = privateValue;
  account.contract.scopeDetails.contentLimits[0].price = privateValue;
  account.contract.scopeDetails.stories.cost = privateValue;
  account.contract.scopeDetails.production.budget = privateValue;
  account.contract.scopeDetails.additionalServices[0].payment = privateValue;
  assert.deepEqual((await detail(account)).contrato.alcanceDetallado, scope());
  account.contract.scopeDetails = { version: 1, stories: { quantity: null, period: null } };
  assert.deepEqual((await detail(account)).contrato.alcanceDetallado, account.contract.scopeDetails);
});

test('the portfolio also exposes detailed scope under the existing operation permission and memory context', async () => {
  const account = row(); account.contract.scopeDetails = scope();
  const result = await toolByName('cartera_de_operacion').run({}, context(account));
  assert.deepEqual(result.data.cuentas[0].contrato.alcanceDetallado, scope());
  assert.equal(result.data.cuentas[0].contrato.fin, '2026-12-31');
  assert.equal(result.data.cuentas[0].mesActual.contratadas, 6);
  assert.equal(result.data.cuentas[0].contexto.estado, 'NO_DISPONIBLE');
  assert.deepEqual(result.sources, [{ kind: 'cliente', id: account.id, label: account.name, url: '/clientes/operacion/cuenta-prueba' }]);
  for (const name of ['operacion_de_cliente', 'cartera_de_operacion']) {
    assert.equal(toolByName(name).allowed({ role: 'EDITOR' }), false);
    assert.equal(toolByName(name).allowed({ role: 'PROJECT_MANAGER' }), true);
  }
});
