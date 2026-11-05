import { FINANCIAL_CATEGORY_OPTIONS } from './financialCategories.js';

// Las consultas de navegación no alteran datos ni conceden acceso. Las guardas de cada vista
// siguen siendo las de Financiero; estos nombres conservan los enlaces ya enviados por Bria.
const TAB_NAMES = Object.freeze({
  records: 'movimientos', receivables: 'cartera', formalizations: 'formalizacion',
  payables: 'por-pagar', payroll: 'nomina', parties: 'terceros', flow: 'flujo', profitability: 'rentabilidad',
});
const TAB_VIEWS = Object.fromEntries(Object.entries(TAB_NAMES).flatMap(([view, name]) => [[name, view], [view, view]]));
const categories = new Set(FINANCIAL_CATEGORY_OPTIONS.map(([value]) => value));
const oneOf = (value, choices, fallback = '') => choices.includes(value) ? value : fallback;

export function readFinancialNavigation(search) {
  const params = new URLSearchParams(search);
  const rawYear = params.get('year') || '';
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  const rawMonth = params.get('month') || '';
  const month = /^\d{1,2}$/.test(rawMonth) ? Number(rawMonth) : NaN;
  const requestedTab = params.get('tab');
  const activeTab = Object.hasOwn(TAB_VIEWS, requestedTab) ? TAB_VIEWS[requestedTab] : 'records';
  const selectedYear = year >= 2000 && year <= 2200 ? year : 2026;
  const filters = {
    scenario: oneOf(params.get('scenario'), ['ACTUAL', 'FORECAST', 'BUDGET'], 'ACTUAL'),
    month: month >= 1 && month <= 12 ? String(month) : '',
    type: oneOf(params.get('type'), ['INCOME', 'EXPENSE']),
    category: categories.has(params.get('category')) ? params.get('category') : '',
    q: (params.get('q') || '').slice(0, 200),
  };
  return { activeTab, selectedYear, filters,
    linkedMonth: activeTab === 'profitability' && filters.month ? `${selectedYear}-${filters.month.padStart(2, '0')}-01` : '',
  };
}

export function writeFinancialNavigation(search, patch) {
  const params = new URLSearchParams(search);
  const current = readFinancialNavigation(params);
  const next = { ...current, ...patch, filters: { ...current.filters, ...(patch.filters || {}) } };
  params.set('tab', Object.hasOwn(TAB_NAMES, next.activeTab) ? TAB_NAMES[next.activeTab] : TAB_NAMES.records);
  params.set('year', String(next.selectedYear));
  for (const key of ['scenario', 'month', 'type', 'category', 'q']) {
    if (next.filters[key]) params.set(key, String(next.filters[key])); else params.delete(key);
  }
  return params;
}
