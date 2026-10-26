// Evidencia de lecturas financieras ya autorizadas. No consulta, convierte
// monedas ni sustituye cifras contables: explicita unidades y suma filas en centavos.
import { financialCents } from '../utils/financialMoney.js';

const operations = new Set(['GET /financials/records', 'GET /financials/receivables-ledger', 'GET /financials/payables-ledger', 'GET /financials/dashboard']);
const filterKeys = ['year', 'month', 'quarter', 'scenario', 'type', 'category', 'status', 'clientId', 'accountId', 'thirdPartyId', 'q', 'scope', 'availableForLoan', 'availableForReceivable'];
const currencyOf = row => /^[A-Z]{3}$/.test(row?.currency || row?.account?.currency || '') ? row.currency || row.account.currency : null;
const centsOf = value => {
  const negative = typeof value === 'number' ? value < 0 : typeof value === 'string' && value.startsWith('-');
  const cents = financialCents(negative ? typeof value === 'number' ? -value : value.slice(1) : value);
  return cents === null ? null : BigInt(cents) * (negative ? -1n : 1n);
};
const decimal = cents => {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};
const money = (value, moneda) => {
  const cents = centsOf(value);
  return { moneda, importe: cents === null ? null : decimal(cents), centavos: cents === null ? null : String(cents) };
};
const summed = (campo, values, moneda) => {
  let cents = 0n, sinImporte = 0;
  for (const value of values) {
    const amount = centsOf(value);
    if (amount === null) sinImporte += 1; else cents += amount;
  }
  return { campo, moneda, importe: sinImporte ? null : decimal(cents), centavos: sinImporte ? null : String(cents),
    elementos: values.length, sinImporte, ...(sinImporte ? { subtotalVerificado: decimal(cents) } : {}) };
};
const groupsByCurrency = rows => {
  const groups = new Map();
  for (const row of rows) {
    const currency = currencyOf(row);
    if (!groups.has(currency)) groups.set(currency, []);
    groups.get(currency).push(row);
  }
  return groups;
};
const nativeTotals = (values, fields, moneda, alcance) => Object.entries(fields)
  .filter(([field]) => Object.hasOwn(values || {}, field))
  .map(([campo, definition]) => ({ campo, ...money(values[campo], moneda), alcance, ...definition }));
const differences = (totals, sums, complete) => !complete ? [] : totals.flatMap(source => {
  const rows = sums.find(row => row.campo === source.campo && row.moneda === source.moneda);
  if (source.centavos === null || !rows || rows.centavos === null || source.centavos === rows.centavos) return [];
  return [{ campo: source.campo, moneda: source.moneda, totalFuente: source.importe, sumaFilas: rows.importe,
    diferencia: decimal(BigInt(source.centavos) - BigInt(rows.centavos)) }];
});


const receivableFields = { originalTotal: 'amount', paidTotal: 'paidAmount', settledTotal: 'settledAmount', retainedTotal: 'retainedAmount', outstandingTotal: 'outstanding' };
const sumsForRows = (operation, rows) => {
  if (!rows) return [];
  if (operation === 'GET /financials/receivables-ledger') return Object.entries(receivableFields)
    .map(([field, column]) => summed(field, rows.map(row => row[column]), 'COP'));
  return [...groupsByCurrency(rows)].flatMap(([currency, group]) => {
    if (operation === 'GET /financials/records') return [
      summed('income', group.filter(row => row.type === 'INCOME').map(row => row.amount), currency),
      summed('expense', group.filter(row => row.type === 'EXPENSE').map(row => row.amount), currency),
      summed('net', group.map(row => row.type === 'INCOME' ? row.amount : row.type === 'EXPENSE' && centsOf(row.amount) !== null ? decimal(-centsOf(row.amount)) : null), currency)
    ];
    const open = group.filter(row => !['PAGADA', 'ANULADA'].includes(row.status));
    return [summed('outstanding', open.map(row => row.outstanding), currency),
      summed('overdue', open.filter(row => row.dueState?.key === 'VENCIDA').map(row => row.outstanding), currency)];
  });
};
const selectedEvidence = ({ operation, rows, truncated, ids }) => {
  const rejected = (codigo, motivo) => ({ completa: false, error: { codigo, motivo }, idsEncontrados: [], idsNoDisponibles: [], sumasExactas: [] });
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id.trim() || id.trim().length > 128)
    || new Set(ids.map(id => id.trim())).size !== ids.length) return rejected('SELECCION_INVALIDA', 'Selecciona entre 1 y 100 identificadores distintos de las filas de esta lectura, de hasta 128 caracteres.');
  if (operation === 'GET /financials/dashboard') return rejected('SELECCION_NO_ADMITIDA', 'El tablero contiene agregados. Selecciona filas de movimientos, cuentas por cobrar o cuentas por pagar.');
  const requested = ids.map(id => id.trim());
  const candidates = operation === 'GET /financials/payables-ledger' ? (rows || []).flatMap(group => Array.isArray(group.payables) ? group.payables : []) : rows || [];
  const matches = requested.map(id => ({ id, rows: candidates.filter(row => row.id === id) }));
  if (matches.some(match => match.rows.length > 1)) return rejected('SELECCION_AMBIGUA', 'La respuesta contiene identificadores repetidos; no se eligió ni sumó una fila arbitrariamente.');
  const idsEncontrados = matches.filter(match => match.rows.length).map(match => match.id);
  const idsNoDisponibles = matches.filter(match => !match.rows.length).map(match => match.id);
  const completa = !truncated && !idsNoDisponibles.length;
  const sums = idsEncontrados.length ? sumsForRows(operation, matches.flatMap(match => match.rows)) : [];
  // A known subset is not the requested total when any selection is unavailable.
  const sumasExactas = completa ? sums : sums.map(row => ({ ...row, subtotalVerificado: row.subtotalVerificado ?? row.importe, importe: null, centavos: null }));
  return { idsEncontrados, idsNoDisponibles, completa, sumasExactas };
};

/** The operation key comes from the native catalog, never from a phrase in a chat. */
export const financialEvidence = ({ operation, path, data, truncated = false, idsParaSumar } = {}) => {
  if (!operations.has(operation) || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const query = new URLSearchParams(String(path || '').split('?')[1] || '');
  const filtrosSolicitados = Object.fromEntries(filterKeys.filter(key => query.has(key)).map(key => [key, query.get(key)]));
  const isRecords = operation === 'GET /financials/records';
  const rows = Array.isArray(data.items) ? data.items : null;
  const totalRegistros = isRecords ? Number.isSafeInteger(data.total) && data.total >= 0 ? data.total : null : rows?.length ?? null;
  const pagina = isRecords ? Number.isSafeInteger(data.page) && data.page >= 1 ? data.page : null : null;
  const alcance = { filtrosSolicitados, recortada: Boolean(truncated), filasVisibles: rows?.length ?? null,
    totalRegistros, pagina, filasCompletas: Boolean(rows && !truncated && (!isRecords || pagina === 1 && totalRegistros === rows.length)) };
  let totalesFuente = [], sumasFilasVisibles = [], sameCurrency = true;
  const extra = {};

  if (isRecords) {
    const groups = rows ? groupsByCurrency(rows) : new Map();
    sameCurrency = groups.size <= 1;
    // A currency seen on one page does not identify the currency of the full query.
    const moneda = alcance.filasCompletas && groups.size === 1 ? groups.keys().next().value : null;
    totalesFuente = nativeTotals(data.totals, { income: {}, expense: {}, net: {} }, moneda, 'FILTRO_COMPLETO');
    sumasFilasVisibles = sumsForRows(operation, rows);
    alcance.sinClasificar = rows?.filter(row => !['INCOME', 'EXPENSE'].includes(row.type)).length ?? null;
  } else if (operation === 'GET /financials/receivables-ledger') {
    const fields = receivableFields;
    totalesFuente = nativeTotals(data.totals, Object.fromEntries(Object.keys(fields).map(key => [key, {}])), 'COP', 'CARTERA_ANIO_MES_BUSQUEDA');
    sumasFilasVisibles = sumsForRows(operation, rows);
    alcance.anioDevuelto = Number.isSafeInteger(data.year) ? data.year : null;
    alcance.porVerificar = rows?.filter(row => row.balanceReviewRequired).length ?? null;
    // The receivable's currency describes its document; accounting amounts remain COP.
    extra.documentos = (rows || []).filter(row => row.currency && row.currency !== 'COP')
      .map(row => ({ id: row.id, ...money(row.documentTotal, currencyOf(row)) }));
    extra.unidadesCampos = { amount: 'COP', paidAmount: 'COP', settledAmount: 'COP', retainedAmount: 'COP', outstanding: 'COP', documentTotal: 'currency', foreignAmount: 'currency' };
  } else if (operation === 'GET /financials/payables-ledger') {
    const payables = rows?.flatMap(group => Array.isArray(group.payables) ? group.payables : []);
    alcance.gruposVisibles = rows?.length ?? null;
    alcance.filasVisibles = payables?.length ?? null;
    alcance.totalRegistros = payables?.length ?? null;
    alcance.filasCompletas = Boolean(rows && rows.every(group => Array.isArray(group.payables)) && !truncated);
    const groups = groupsByCurrency(payables || []);
    sameCurrency = groups.size <= 1;
    const moneda = alcance.filasCompletas && groups.size === 1 ? groups.keys().next().value : null;
    totalesFuente = [...nativeTotals(data.totals, { outstanding: {}, overdue: {} }, moneda, 'ABIERTAS_CUALQUIER_FECHA'),
      ...nativeTotals(data.totals, { paidInPeriod: {} }, moneda, 'PAGOS_DEL_PERIODO')];
    sumasFilasVisibles = sumsForRows(operation, payables);
  } else {
    const flow = Array.isArray(data.cashFlow) ? data.cashFlow : null;
    const debts = Array.isArray(data.accountsReceivable) ? data.accountsReceivable : null;
    alcance.filasCompletas = Boolean(flow && debts && !truncated);
    alcance.filasVisibles = null;
    alcance.periodosFlujoVisibles = flow?.length ?? null;
    alcance.cuentasCarteraVisibles = debts?.length ?? null;
    alcance.escenario = data.sourceSummary?.scenario || null;
    totalesFuente = [...nativeTotals(data.sourceSummary?.totals,
      { income: {}, expense: {}, netFlow: {}, loanRepayments: { incluidoEn: 'income' }, loansGranted: { incluidoEn: 'expense' } },
      null, 'MOVIMIENTOS_DEL_PERIODO_Y_FILTROS'),
    ...nativeTotals(data.sourceSummary?.totals, { receivable: {} }, 'COP', 'CARTERA_ANIO_MES_BUSQUEDA')];
    if (flow) sumasFilasVisibles.push(...['income', 'expense', 'netFlow'].map(field => summed(field, flow.map(row => row[field]), null)));
    if (debts) sumasFilasVisibles.push(summed('receivable', debts.map(row => row.totalOutstanding), 'COP'));
  }
  if (idsParaSumar !== undefined) extra.seleccion = selectedEvidence({ operation, rows, truncated, ids: idsParaSumar });
  alcance.totalesComparables = alcance.filasCompletas && sameCurrency;
  return { operacion: operation, unidad: 'UNIDAD_MONETARIA', decimales: 2, alcance, totalesFuente, sumasFilasVisibles,
    diferencias: differences(totalesFuente, sumasFilasVisibles, alcance.totalesComparables), ...extra };
};
