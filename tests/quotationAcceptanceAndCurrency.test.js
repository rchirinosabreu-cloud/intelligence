import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loadModule = async (path) => {
  try {
    return await import(path);
  } catch {
    return {};
  }
};

test('official TRM parsing preserves its certified value and validity dates', async () => {
  const rates = await loadModule('../src/services/exchangeRateService.js');
  assert.equal(typeof rates.parseOfficialTrmResponse, 'function');

  assert.deepEqual(rates.parseOfficialTrmResponse(JSON.stringify([{
    valor: '4,125.37',
    vigenciadesde: '2026-08-11T00:00:00.000',
    vigenciahasta: '2026-08-11T23:59:59.999'
  }])), {
    rate: 4125.37,
    source: 'SUPERFINANCIERA_TRM',
    validFrom: '2026-08-11T00:00:00.000',
    validTo: '2026-08-11T23:59:59.999'
  });
});

test('official TRM provider uses the Colombian open-data endpoint with bounded fetching', async () => {
  const rates = await loadModule('../src/services/exchangeRateService.js');
  assert.equal(typeof rates.fetchOfficialUsdCopRate, 'function');
  let request;

  const result = await rates.fetchOfficialUsdCopRate({
    fetchText: async (url, options) => {
      request = { url, options };
      return {
        text: JSON.stringify([{
          valor: '4125.37',
          vigenciadesde: '2026-08-11T00:00:00.000',
          vigenciahasta: '2026-08-11T23:59:59.999'
        }])
      };
    }
  });

  assert.match(request.url, /^https:\/\/www\.datos\.gov\.co\/resource\/ceyp-9c7c\.json/);
  assert.equal(request.options.maxBytes <= 64 * 1024, true);
  assert.equal(request.options.timeoutMs <= 10_000, true);
  assert.equal(result.rate, 4125.37);
});

test('USD quotation snapshots require a positive exchange rate while COP clears it', async () => {
  const domain = await loadModule('../src/services/quotationDomainService.js');
  assert.equal(typeof domain.normalizeQuotationExchangeRate, 'function');

  assert.deepEqual(domain.normalizeQuotationExchangeRate({ currency: 'COP' }), {
    exchange_rate: null,
    exchange_rate_source: null,
    exchange_rate_date: null
  });
  assert.throws(
    () => domain.normalizeQuotationExchangeRate({ currency: 'USD', exchangeRate: 0 }),
    /tasa/i
  );

  const snapshot = domain.normalizeQuotationExchangeRate({
    currency: 'USD',
    exchangeRate: 4125.37,
    exchangeRateSource: 'SUPERFINANCIERA_TRM',
    exchangeRateDate: '2026-08-11T00:00:00.000Z'
  });
  assert.equal(snapshot.exchange_rate, 4125.37);
  assert.equal(snapshot.exchange_rate_source, 'SUPERFINANCIERA_TRM');
  assert.equal(snapshot.exchange_rate_date.toISOString(), '2026-08-11T00:00:00.000Z');
});

test('USD profitability converts quoted revenue to COP before comparing catalog costs', async () => {
  const domain = await loadModule('../src/services/quotationDomainService.js');
  assert.equal(typeof domain.calculateQuotationEconomics, 'function');

  assert.deepEqual(domain.calculateQuotationEconomics([
    { price: 200, quantity: 1, estimatedCost: 400000 }
  ], { currency: 'USD', exchangeRate: 4000 }), {
    revenue: 800000,
    estimatedCost: 400000,
    estimatedProfit: 400000,
    estimatedMargin: 50,
    pricedItems: 1,
    totalItems: 1,
    hasCompleteCostData: true
  });
});

test('legacy USD quotations without a stored rate remain readable without inventing profitability', async () => {
  const domain = await loadModule('../src/services/quotationDomainService.js');

  assert.deepEqual(domain.calculateQuotationEconomics([
    { price: 200, quantity: 1, estimatedCost: 400000 }
  ], { currency: 'USD', exchangeRate: null }), {
    revenue: null,
    estimatedCost: 400000,
    estimatedProfit: null,
    estimatedMargin: null,
    pricedItems: 1,
    totalItems: 1,
    hasCompleteCostData: true,
    hasExchangeRate: false
  });
});

const createAcceptanceDb = ({ quotation, updateCount = 1 }) => {
  const state = { quotation: { ...quotation }, notifications: [] };
  const db = {
    $transaction: async (work) => work(db),
    quotation: {
      findUnique: async () => ({ ...state.quotation }),
      updateMany: async ({ data }) => {
        if (updateCount > 0) state.quotation = { ...state.quotation, ...data };
        return { count: updateCount };
      }
    },
    user: {
      findMany: async () => [
        { id: 'admin-1' },
        { id: 'pm-1' }
      ]
    },
    notification: {
      createMany: async ({ data }) => {
        state.notifications.push(...data);
        return { count: data.length };
      }
    }
  };
  return { db, state };
};

test('public acceptance atomically approves an active quotation and notifies commercial owners', async () => {
  const acceptance = await loadModule('../src/services/quotationAcceptanceService.js');
  assert.equal(typeof acceptance.acceptQuotationBySlug, 'function');
  const now = new Date('2026-08-11T15:00:00.000Z');
  const { db, state } = createAcceptanceDb({
    quotation: {
      id: 'quotation-1',
      uuid_slug: 'public-token',
      consecutive: 25,
      status: 'ACTIVA',
      client_name: 'Cliente Uno',
      expires_at: new Date('2026-08-20T15:00:00.000Z')
    }
  });

  const result = await acceptance.acceptQuotationBySlug({ db, slug: 'public-token', now });
  assert.equal(result.quotation.status, 'APROBADA');
  assert.equal(result.quotation.accepted_at, now);
  assert.equal(result.alreadyAccepted, false);
  assert.equal(state.notifications.length, 2);
  assert.equal(state.notifications.every((item) => item.type === 'QUOTATION_ACCEPTED'), true);
  assert.equal(state.notifications.every((item) => item.resourceId === 'quotation-1'), true);
});

test('public acceptance is idempotent and rejects expired quotations', async () => {
  const acceptance = await loadModule('../src/services/quotationAcceptanceService.js');
  assert.equal(typeof acceptance.acceptQuotationBySlug, 'function');
  const now = new Date('2026-08-11T15:00:00.000Z');

  const approved = createAcceptanceDb({
    quotation: {
      id: 'quotation-1',
      status: 'APROBADA',
      accepted_at: new Date('2026-08-10T15:00:00.000Z'),
      expires_at: new Date('2026-08-20T15:00:00.000Z')
    },
    updateCount: 0
  });
  const repeated = await acceptance.acceptQuotationBySlug({ db: approved.db, slug: 'token', now });
  assert.equal(repeated.alreadyAccepted, true);
  assert.equal(approved.state.notifications.length, 0);

  const expired = createAcceptanceDb({
    quotation: {
      id: 'quotation-2',
      status: 'ACTIVA',
      expires_at: new Date('2026-08-01T15:00:00.000Z')
    }
  });
  await assert.rejects(
    acceptance.acceptQuotationBySlug({ db: expired.db, slug: 'expired', now }),
    (error) => error.statusCode === 409 && /vencida/i.test(error.message)
  );
});

test('quotation schema and API expose exchange snapshots and approved acceptance state', async () => {
  const [schema, controller, routes, server] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/quotationController.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api/quotations.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.js', import.meta.url), 'utf8')
  ]);

  assert.match(schema, /APROBADA/);
  assert.match(schema, /exchange_rate\s+Decimal\?/);
  assert.match(schema, /exchange_rate_source\s+String\?/);
  assert.match(schema, /exchange_rate_date\s+DateTime\?/);
  assert.match(schema, /accepted_at\s+DateTime\?/);
  assert.match(routes, /post\('\/public\/:uuid_slug\/accept'/);
  assert.match(controller, /acceptPublicQuotation/);
  assert.match(server, /app\.use\('\/api\/quotations\/public',\s*publicRateLimiter\)/);
});

test('public proposal removes PDF actions and presents acceptance, WhatsApp, and readable terms', async () => {
  const [publicView, confirmDialog] = await Promise.all([
    readFile(new URL('../src/components/public/Quotations/PublicQuotation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/ConfirmDialog.jsx', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(publicView, /Descargar PDF/);
  assert.match(publicView, /Aceptar cotizaci[oó]n/i);
  assert.match(publicView, /Contactar por WhatsApp/);
  assert.match(publicView, /\/accept/);
  assert.match(publicView, /<ol/);
  assert.match(publicView, /text-(?:sm|base)[^"']*leading-(?:6|7|relaxed)/);
  assert.match(confirmDialog, /request\?\.tone === 'danger'\s*\?\s*AlertTriangle\s*:\s*CheckCircle2/);
});
