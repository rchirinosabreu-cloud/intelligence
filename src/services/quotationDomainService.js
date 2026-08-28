export const QUOTATION_VALIDITY_DAYS = 15;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_QUOTATION_ITEMS = 100;

export class QuotationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotationValidationError';
    this.statusCode = 400;
  }
}

const toFiniteNumber = (value, fieldName, { min = 0 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new QuotationValidationError(`${fieldName} invalido`);
  }
  return parsed;
};

const toOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPercentage = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

export const addQuotationValidityDays = (date) => (
  new Date(new Date(date).getTime() + QUOTATION_VALIDITY_DAYS * DAY_IN_MS)
);

export const buildNewQuotationValidity = (status, now = new Date()) => ({
  issued_at: status === 'ACTIVA' ? now : null,
  reactivated_at: null,
  expires_at: addQuotationValidityDays(now)
});

export const buildQuotationValidityUpdate = (existing, targetStatus, now = new Date()) => {
  if (targetStatus !== 'ACTIVA') return {};

  const wasDraft = existing?.status === 'BORRADOR';
  const expiration = existing?.expires_at ? new Date(existing.expires_at) : null;
  const wasExpired = existing?.status === 'ACTIVA' && expiration && now > expiration;
  if (!wasDraft && !wasExpired) return {};

  return {
    issued_at: now,
    reactivated_at: wasExpired ? now : null,
    expires_at: addQuotationValidityDays(now)
  };
};

export const calculateServiceEconomics = ({ estimatedCost, currentPrice, finalPrice }) => {
  const normalizedCost = toFiniteNumber(estimatedCost, 'Costo estimado');
  const normalizedCurrent = toFiniteNumber(currentPrice, 'Precio actual');
  const normalizedFinal = toFiniteNumber(finalPrice, 'Precio final');
  const estimatedProfit = roundMoney(normalizedFinal - normalizedCost);

  return {
    estimatedCost: normalizedCost,
    currentPrice: normalizedCurrent,
    finalPrice: normalizedFinal,
    estimatedProfit,
    estimatedMargin: normalizedFinal > 0
      ? roundPercentage((estimatedProfit / normalizedFinal) * 100)
      : 0
  };
};

export const serializeCatalogService = (service) => {
  const estimatedCost = toOptionalNumber(service.costo_real_estimado);
  const currentPrice = toOptionalNumber(service.valor_neto_actual) ?? 0;
  const finalPrice = toOptionalNumber(service.valor_neto) ?? currentPrice;
  const economics = estimatedCost === null
    ? { estimatedProfit: null, estimatedMargin: null }
    : calculateServiceEconomics({ estimatedCost, currentPrice, finalPrice });

  return {
    ...service,
    costo_real_estimado: estimatedCost,
    valor_neto_actual: currentPrice,
    valor_neto: finalPrice,
    precio_comercial_sugerido: toOptionalNumber(service.precio_comercial_sugerido),
    ganancia_estimada: economics.estimatedProfit,
    margen_estimado: economics.estimatedMargin
  };
};

export const prepareQuotationItems = (items, catalogServices = [], trustedExistingItems = []) => {
  if (!Array.isArray(items)) throw new QuotationValidationError('Los servicios deben ser una lista valida');
  if (items.length > MAX_QUOTATION_ITEMS) throw new QuotationValidationError('La cotizacion supera el limite de servicios');

  const catalogById = new Map(catalogServices.map((service) => [service.id, service]));
  const existingByServiceId = new Map(
    trustedExistingItems
      .filter((item) => item?.serviceId)
      .map((item) => [item.serviceId, item])
  );

  return items.map((item, index) => {
    const name = String(item?.name || '').trim();
    if (!name) throw new QuotationValidationError(`El servicio ${index + 1} no tiene nombre`);

    const price = toFiniteNumber(item.price, `Precio del servicio ${index + 1}`);
    const quantity = toFiniteNumber(item.quantity, `Cantidad del servicio ${index + 1}`, { min: 1 });
    if (!Number.isInteger(quantity)) throw new QuotationValidationError(`Cantidad del servicio ${index + 1} invalida`);

    const serviceId = typeof item.serviceId === 'string' ? item.serviceId : null;
    const catalogService = serviceId ? catalogById.get(serviceId) : null;
    const existingItem = serviceId ? existingByServiceId.get(serviceId) : null;
    const estimatedCost = toOptionalNumber(
      catalogService?.costo_real_estimado ?? existingItem?.estimatedCost
    );
    const catalogFinalPrice = toOptionalNumber(
      catalogService?.valor_neto ?? existingItem?.catalogFinalPrice
    );

    return {
      ...(serviceId ? { serviceId } : {}),
      name: name.slice(0, 200),
      description: String(item.description || '').slice(0, 5000),
      price,
      quantity,
      note: String(item.note || '').slice(0, 2000),
      estimatedCost,
      catalogFinalPrice,
      ...(item?.scenarioId ? {
        scenarioId: String(item.scenarioId).slice(0, 100),
        scenarioName: String(item.scenarioName || 'Escenario').slice(0, 200),
        scenarioDescription: String(item.scenarioDescription || '').slice(0, 2000),
        scenarioExternalBudget: toOptionalNumber(item.scenarioExternalBudget),
        scenarioExternalBudgetNote: String(item.scenarioExternalBudgetNote || '').slice(0, 1000),
        scenarioOrder: Math.max(0, Number.parseInt(item.scenarioOrder, 10) || 0),
        selectedScenario: Boolean(item.selectedScenario)
      } : {})
    };
  });
};

export const resolveQuotationTaxExemption = ({
  currency,
  emisorType,
  clientType,
  manualTaxExempt
}) => {
  if (currency === 'USD') return true;
  if (typeof manualTaxExempt === 'boolean') return manualTaxExempt;
  return emisorType === 'FRANCISCO_VILLA' || clientType === 'PERSONA_NATURAL';
};

export const normalizeQuotationTaxForCurrency = (quotation) => {
  if (!quotation || quotation.currency !== 'USD') return quotation;

  const normalized = {
    ...quotation,
    is_tax_exempt: true,
    tax_amount: 0,
    total_amount: quotation.subtotal
  };
  if (Object.prototype.hasOwnProperty.call(quotation, 'terms_and_conditions')) {
    normalized.terms_and_conditions = String(quotation.terms_and_conditions || '')
      .split('\n')
      .filter((line) => !/19% de IVA/i.test(line))
      .join('\n');
  }
  return normalized;
};

export const calculateQuotationTotals = (items, isTaxExempt) => {
  const subtotal = roundMoney(items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  ));
  const taxAmount = isTaxExempt ? 0 : roundMoney(subtotal * 0.19);
  return { subtotal, taxAmount, totalAmount: roundMoney(subtotal + taxAmount) };
};

export const calculateQuotationEconomics = (items = [], options = {}) => {
  const currency = options.currency || 'COP';
  const rawExchangeRate = Number(options.exchangeRate);
  if (currency === 'USD' && (!Number.isFinite(rawExchangeRate) || rawExchangeRate <= 0)) {
    let estimatedCost = 0;
    let pricedItems = 0;
    items.forEach((item) => {
      const unitCost = toOptionalNumber(item.estimatedCost);
      if (unitCost === null) return;
      pricedItems += 1;
      estimatedCost += unitCost * (Number(item.quantity) || 0);
    });
    return {
      revenue: null,
      estimatedCost: roundMoney(estimatedCost),
      estimatedProfit: null,
      estimatedMargin: null,
      pricedItems,
      totalItems: items.length,
      hasCompleteCostData: pricedItems === items.length,
      hasExchangeRate: false
    };
  }
  const exchangeRate = currency === 'USD'
    ? rawExchangeRate
    : 1;
  let revenue = 0;
  let pricedRevenue = 0;
  let estimatedCost = 0;
  let pricedItems = 0;

  items.forEach((item) => {
    const quotedRevenue = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const lineRevenue = quotedRevenue * exchangeRate;
    revenue += lineRevenue;
    const unitCost = toOptionalNumber(item.estimatedCost);
    if (unitCost === null) return;
    pricedItems += 1;
    pricedRevenue += lineRevenue;
    estimatedCost += unitCost * (Number(item.quantity) || 0);
  });

  const estimatedProfit = roundMoney(pricedRevenue - estimatedCost);
  return {
    revenue: roundMoney(revenue),
    estimatedCost: roundMoney(estimatedCost),
    estimatedProfit,
    estimatedMargin: pricedRevenue > 0
      ? roundPercentage((estimatedProfit / pricedRevenue) * 100)
      : 0,
    pricedItems,
    totalItems: items.length,
    hasCompleteCostData: pricedItems === items.length
  };
};

export const normalizeQuotationExchangeRate = ({
  currency,
  exchangeRate,
  exchangeRateSource,
  exchangeRateDate
}) => {
  if (currency !== 'USD') {
    return {
      exchange_rate: null,
      exchange_rate_source: null,
      exchange_rate_date: null
    };
  }

  const normalizedRate = toFiniteNumber(exchangeRate, 'Tasa de cambio', { min: Number.EPSILON });
  const normalizedDate = exchangeRateDate ? new Date(exchangeRateDate) : new Date();
  if (Number.isNaN(normalizedDate.getTime())) {
    throw new QuotationValidationError('Fecha de tasa de cambio invalida');
  }

  return {
    exchange_rate: normalizedRate,
    exchange_rate_source: exchangeRateSource === 'SUPERFINANCIERA_TRM' ? 'SUPERFINANCIERA_TRM' : 'MANUAL',
    exchange_rate_date: normalizedDate
  };
};

const serializePublicItem = (item) => ({
  name: String(item?.name || ''),
  description: String(item?.description || ''),
  price: Number(item?.price) || 0,
  quantity: Number(item?.quantity) || 0,
  note: String(item?.note || ''),
  ...(item?.scenarioId ? {
    scenarioId: String(item.scenarioId),
    scenarioName: String(item.scenarioName || 'Escenario'),
    scenarioDescription: String(item.scenarioDescription || ''),
    scenarioExternalBudget: toOptionalNumber(item.scenarioExternalBudget),
    scenarioExternalBudgetNote: String(item.scenarioExternalBudgetNote || ''),
    scenarioOrder: Number(item.scenarioOrder) || 0,
    selectedScenario: Boolean(item.selectedScenario)
  } : {})
});

export const isScenarioQuotation = (items = []) => Array.isArray(items) && items.some((item) => item?.scenarioId);

export const groupQuotationScenarios = (items = []) => {
  const groups = new Map();
  items.forEach((item) => {
    if (!item?.scenarioId) return;
    if (!groups.has(item.scenarioId)) groups.set(item.scenarioId, {
      id: item.scenarioId,
      name: item.scenarioName || 'Escenario',
      description: item.scenarioDescription || '',
      externalBudget: toOptionalNumber(item.scenarioExternalBudget),
      externalBudgetNote: item.scenarioExternalBudgetNote || '',
      order: Number(item.scenarioOrder) || 0,
      selected: Boolean(item.selectedScenario),
      items: []
    });
    groups.get(item.scenarioId).items.push(item);
  });
  return [...groups.values()].sort((a, b) => a.order - b.order);
};

export const serializePublicQuotation = (quotation) => {
  if (!quotation || !['ACTIVA', 'APROBADA'].includes(quotation.status)) return null;
  const normalizedQuotation = normalizeQuotationTaxForCurrency(quotation);

  const publicFields = [
    'uuid_slug',
    'emisor_type',
    'status',
    'client_name',
    'client_company',
    'client_email',
    'client_phone',
    'is_tax_exempt',
    'currency',
    'exchange_rate',
    'exchange_rate_source',
    'exchange_rate_date',
    'subtotal',
    'tax_amount',
    'total_amount',
    'terms_and_conditions',
    'created_at',
    'issued_at',
    'reactivated_at',
    'accepted_at',
    'expires_at'
  ];
  const serialized = Object.fromEntries(
    publicFields
      .filter((field) => normalizedQuotation[field] !== undefined)
      .map((field) => [field, normalizedQuotation[field]])
  );

  return {
    ...serialized,
    items: Array.isArray(normalizedQuotation.items) ? normalizedQuotation.items.map(serializePublicItem) : []
  };
};
