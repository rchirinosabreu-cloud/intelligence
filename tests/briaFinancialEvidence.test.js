import test from 'node:test';
import assert from 'node:assert/strict';
import { financialEvidence } from '../src/lib/briaFinancialEvidence.js';

const read = (operation, data, extra = {}) => financialEvidence({ operation: `GET /financials/${operation}`, path: `/financials/${operation}`, data, ...extra });
const total = (evidence, field) => evidence.totalesFuente.find(row => row.campo === field);
const sum = (evidence, field, currency = null) => evidence.sumasFilasVisibles.find(row => row.campo === field && row.moneda === currency);
const cash = amount => ({ type: 'INCOME', amount });

test('financial evidence sums exact cents from the source without rounded prose or binary drift', () => {
  const out = read('records', { items: [cash('1250000.49'), cash(0.1), cash(0.2)], total: 3, page: 1, pageSize: 50, totals: { income: '1250000.79', expense: 0, net: '1250000.79' } });
  assert.ok(out, 'recognized financial reads need numeric evidence');
  assert.equal(sum(out, 'income').importe, '1250000.79');
  assert.equal(sum(out, 'income').centavos, '125000079');
  assert.equal(total(out, 'income').importe, '1250000.79');
  assert.deepEqual(out.diferencias, []);
  assert.equal(out.unidad, 'UNIDAD_MONETARIA');
  assert.equal(total(out, 'income').moneda, null, 'the record DTO does not declare a currency');
});

test('page sums never replace the aggregate of every matching record', () => {
  const out = read('records', { items: [cash('100.25')], total: 51, page: 2, pageSize: 50, totals: { income: '8000.77', expense: '1200.10', net: '6800.67' } }, { path: '/financials/records?year=2026&month=10&clientId=account-a&page=2' });
  assert.ok(out);
  assert.equal(out.alcance.filasCompletas, false);
  assert.equal(out.alcance.totalRegistros, 51);
  assert.equal(out.alcance.pagina, 2);
  assert.equal(out.alcance.filtrosSolicitados.clientId, 'account-a');
  assert.equal(out.alcance.filtrosSolicitados.month, '10');
  assert.equal(total(out, 'income').alcance, 'FILTRO_COMPLETO');
  assert.equal(sum(out, 'income').importe, '100.25');
  assert.deepEqual(out.diferencias, [], 'a partial page cannot contradict a full aggregate');
});

test('unknown and malformed amounts remain unknown rather than quietly becoming zero', () => {
  for (const amount of [null, undefined, '', '1,2 millones', '1.200.000', '0.001', Infinity, '90071992547409.92']) {
    const out = read('records', { items: [cash(2), cash(amount)], total: 2, page: 1, totals: { income: null } });
    assert.ok(out);
    assert.equal(sum(out, 'income').importe, null, String(amount));
    assert.equal(sum(out, 'income').subtotalVerificado, '2.00');
    assert.equal(sum(out, 'income').sinImporte, 1);
    assert.equal(total(out, 'income').importe, null);
  }
});

test('exact accumulation survives sums above the Number safe-cent boundary', () => {
  const out = read('records', { items: [cash('90071992547409.91'), cash('90071992547409.91')], total: 2, page: 1, totals: {} });
  assert.ok(out);
  assert.equal(sum(out, 'income').importe, '180143985094819.82');
  assert.equal(sum(out, 'income').centavos, '18014398509481982');
});

test('complete comparable source discrepancies are visible without overwriting either value', () => {
  const data = { items: [cash('100.10'), { type: 'EXPENSE', amount: '200.20' }], total: 2, page: 1, totals: { income: '100.11', expense: '200.20', net: '-100.09' } };
  const before = JSON.stringify(data), out = read('records', data);
  assert.ok(out);
  assert.equal(total(out, 'income').importe, '100.11');
  assert.equal(sum(out, 'income').importe, '100.10');
  assert.equal(sum(out, 'net').importe, '-100.10');
  assert.deepEqual(out.diferencias.map(row => [row.campo, row.diferencia]), [['income', '0.01'], ['net', '0.01']]);
  assert.equal(JSON.stringify(data), before, 'evidence never mutates the platform result');
});

test('receivables separate COP accounting balances from each document currency and retain review gaps', () => {
  const out = read('receivables-ledger', { year: 2026, totals: { originalTotal: 4000000, outstandingTotal: 3000000, paidTotal: 1000000, retainedTotal: 0, settledTotal: 0, reviewCount: 1 }, items: [
    { id: 'usd-debt', currency: 'USD', documentTotal: '1000.25', amount: 4000000, outstanding: 3000000, paidAmount: 1000000, retainedAmount: 0, settledAmount: 0 },
    { id: 'needs-review', currency: 'COP', amount: 10, outstanding: null, paidAmount: 0, retainedAmount: 0, settledAmount: 0, balanceReviewRequired: true }
  ] });
  assert.ok(out);
  assert.equal(total(out, 'outstandingTotal').moneda, 'COP');
  assert.equal(sum(out, 'outstandingTotal', 'COP').importe, null);
  assert.equal(sum(out, 'outstandingTotal', 'COP').subtotalVerificado, '3000000.00');
  assert.equal(out.documentos[0].moneda, 'USD');
  assert.equal(out.documentos[0].importe, '1000.25');
  assert.equal(out.alcance.porVerificar, 1);
  assert.equal(out.diferencias.some(row => row.campo === 'outstandingTotal'), false);
});

test('payables keep currencies separate and state the open-any-date versus paid-in-period scope', () => {
  const out = read('payables-ledger', { totals: { outstanding: '4200.25', overdue: '4000.25', paidInPeriod: '20.00' }, items: [{ thirdParty: { id: 't1' }, payables: [
    { id: 'cop', currency: 'COP', status: 'POR_PAGAR', outstanding: '4000.25', dueState: { key: 'VENCIDA' } },
    { id: 'usd', currency: 'USD', status: 'POR_PAGAR', outstanding: '200.00', dueState: { key: 'A_TIEMPO' } },
    { id: 'void', currency: 'COP', status: 'ANULADA', outstanding: '999.00', dueState: { key: 'VENCIDA' } }
  ] }] }, { path: '/financials/payables-ledger?year=2026&month=10' });
  assert.ok(out);
  assert.equal(sum(out, 'outstanding', 'COP').importe, '4000.25');
  assert.equal(sum(out, 'outstanding', 'USD').importe, '200.00');
  assert.equal(sum(out, 'overdue', 'COP').importe, '4000.25');
  assert.equal(total(out, 'outstanding').moneda, null, 'mixed native totals must not be relabelled COP');
  assert.equal(total(out, 'outstanding').alcance, 'ABIERTAS_CUALQUIER_FECHA');
  assert.equal(total(out, 'paidInPeriod').alcance, 'PAGOS_DEL_PERIODO');
  assert.deepEqual(out.diferencias, [], 'mixed currencies cannot be reconciled as one converted total');
});

test('dashboard separates movement filters from receivables and does not add loans twice', () => {
  const out = read('dashboard', {
    cashFlow: [{ year: 2026, month: 10, income: '100.25', expense: '80.10', netFlow: '20.15' }],
    accountsReceivable: [{ totalOutstanding: '700.40' }],
    sourceSummary: { scenario: 'ACTUAL', totals: { income: '100.25', expense: '80.10', netFlow: '20.15', receivable: '700.40', loanRepayments: '10.00', loansGranted: '5.00' } },
    payroll: { collaborators: [{ name: 'Private person', salary: 999 }] }
  }, { path: '/financials/dashboard?year=2026&quarter=4&category=SERVICIO&type=INCOME&q=account' });
  assert.ok(out);
  assert.equal(sum(out, 'income').importe, '100.25');
  assert.equal(total(out, 'receivable').moneda, 'COP');
  assert.equal(total(out, 'receivable').alcance, 'CARTERA_ANIO_MES_BUSQUEDA');
  assert.equal(total(out, 'income').alcance, 'MOVIMIENTOS_DEL_PERIODO_Y_FILTROS');
  assert.equal(total(out, 'loanRepayments').incluidoEn, 'income');
  assert.equal(total(out, 'loansGranted').incluidoEn, 'expense');
  assert.equal(JSON.stringify(out).includes('Private person'), false);
  assert.equal(JSON.stringify(out).includes('salary'), false);
});

test('truncation and an absent list never establish complete financial evidence', () => {
  const cut = read('records', { items: [cash(1)], total: 1, page: 1, totals: { income: 100 } }, { truncated: true });
  assert.ok(cut);
  assert.equal(cut.alcance.filasCompletas, false);
  assert.equal(cut.alcance.recortada, true);
  assert.deepEqual(cut.diferencias, []);
  const absent = read('records', { totals: { income: 100 } });
  assert.equal(absent.alcance.filasCompletas, false);
  assert.equal(absent.sumasFilasVisibles.length, 0);
});

test('financial evidence cannot reinterpret unrelated routes, writes or non-JSON responses', () => {
  for (const input of [
    { operation: 'GET /tasks', path: '/tasks', data: { items: [cash(1)] } },
    { operation: 'POST /financials/records', path: '/financials/records', data: { items: [cash(1)] } },
    { operation: 'GET /financials/records', path: '/financials/records', data: 'recortada' }
  ]) assert.equal(financialEvidence(input), null);
});

test('partially declared currencies cannot reconcile one unknown subgroup against the full native total', () => {
  const out = read('records', { items: [cash('50.00'), { ...cash('100.00'), currency: 'USD' }], total: 2, page: 1,
    totals: { income: '150.00', expense: 0, net: '150.00' } });
  assert.equal(out.alcance.filasCompletas, true);
  assert.equal(sum(out, 'income').importe, '50.00');
  assert.equal(sum(out, 'income', 'USD').importe, '100.00');
  assert.deepEqual(out.diferencias, []);
  assert.equal(out.alcance.totalesComparables, false);
});

test('a requested records subtotal is computed from only the selected current ids', () => {
  const data = { items: [{ id: 'a', ...cash('100.19') }, { id: 'b', ...cash('200.22') }, { id: 'c', ...cash('300.33') }],
    total: 3, page: 1, totals: { income: '600.74', expense: 0, net: '600.74' } };
  const out = read('records', data, { idsParaSumar: ['b', 'a'] });
  assert.deepEqual(out.seleccion?.idsEncontrados, ['b', 'a']);
  assert.deepEqual(out.seleccion.idsNoDisponibles, []);
  assert.equal(out.seleccion.completa, true);
  assert.equal(out.seleccion.sumasExactas.find(row => row.campo === 'income').importe, '300.41');
  assert.equal(total(out, 'income').importe, '600.74');
  assert.equal(sum(out, 'income').importe, '600.74');
});

test('the selected two receivables use their accounting currency and exclude other clients', () => {
  const out = read('receivables-ledger', { year: 2026, totals: { outstandingTotal: '1753000.45' }, items: [
    { id: 'a', clientId: 'one', currency: 'COP', amount: '1250000.10', outstanding: '1250000.10' },
    { id: 'b', clientId: 'two', currency: 'USD', documentTotal: '125.20', amount: '500000.25', outstanding: '500000.25' },
    { id: 'c', clientId: 'other', currency: 'COP', amount: '3000.10', outstanding: '3000.10' }
  ] }, { idsParaSumar: ['a', 'b'] });
  assert.equal(out.seleccion?.completa, true);
  const selected = out.seleccion.sumasExactas.find(row => row.campo === 'outstandingTotal');
  assert.equal(selected.importe, '1750000.35');
  assert.equal(selected.moneda, 'COP');
  assert.equal(total(out, 'outstandingTotal').importe, '1753000.45');
});

test('missing selected ids preserve the verified subtotal without asserting the requested total', () => {
  const out = read('records', { items: [{ id: 'visible', ...cash('20.11') }], total: 100, page: 1, totals: { income: 5000 } },
    { idsParaSumar: ['visible', 'not-on-this-page'] });
  assert.equal(out.seleccion?.completa, false);
  assert.deepEqual(out.seleccion.idsEncontrados, ['visible']);
  assert.deepEqual(out.seleccion.idsNoDisponibles, ['not-on-this-page']);
  const amount = out.seleccion.sumasExactas.find(row => row.campo === 'income');
  assert.equal(amount.importe, null);
  assert.equal(amount.centavos, null);
  assert.equal(amount.subtotalVerificado, '20.11');
  assert.equal(total(out, 'income').importe, '5000.00');
});

test('a cut response cannot certify a requested selection even when those ids are present', () => {
  const out = read('records', { items: [{ id: 'a', ...cash(20) }], total: 1, page: 1, totals: { income: 20 } },
    { idsParaSumar: ['a'], truncated: true });
  assert.equal(out.seleccion?.completa, false);
  assert.equal(out.seleccion.sumasExactas.find(row => row.campo === 'income').importe, null);
  assert.equal(out.seleccion.sumasExactas.find(row => row.campo === 'income').subtotalVerificado, '20.00');
});

test('invalid numeric selections return a bounded evidence error and preserve the underlying totals', () => {
  const invalid = [null, [], 'a', [''], ['a', ' a '], [3], ['a'.repeat(129)], Array.from({ length: 101 }, (_, i) => String(i))];
  for (const idsParaSumar of invalid) {
    const out = read('records', { items: [{ id: 'a', ...cash(20) }], total: 1, page: 1, totals: { income: 20 } }, { idsParaSumar });
    assert.equal(out.seleccion?.error?.codigo, 'SELECCION_INVALIDA');
    assert.equal(out.seleccion.completa, false);
    assert.equal(out.seleccion.sumasExactas.length, 0);
    assert.equal(total(out, 'income').importe, '20.00');
  }
});

test('payable selection resolves current obligation ids across groups without mixing currencies', () => {
  const out = read('payables-ledger', { totals: { outstanding: 399 }, items: [
    { payables: [{ id: 'cop', currency: 'COP', status: 'POR_PAGAR', outstanding: '100.10', dueState: { key: 'VENCIDA' } }] },
    { payables: [{ id: 'usd', currency: 'USD', status: 'PARCIAL', outstanding: '200.20', dueState: { key: 'A_TIEMPO' } },
      { id: 'other', currency: 'COP', status: 'POR_PAGAR', outstanding: '98.70', dueState: { key: 'VENCIDA' } }] }
  ] }, { idsParaSumar: ['cop', 'usd'] });
  assert.equal(out.seleccion?.completa, true);
  assert.equal(out.seleccion.sumasExactas.find(row => row.campo === 'outstanding' && row.moneda === 'COP').importe, '100.10');
  assert.equal(out.seleccion.sumasExactas.find(row => row.campo === 'outstanding' && row.moneda === 'USD').importe, '200.20');
  assert.equal(out.seleccion.sumasExactas.some(row => row.moneda === null), false);
});

test('missing or duplicated source rows never become a zero or a silently chosen row', () => {
  const missing = read('records', { totals: { income: 20 } }, { idsParaSumar: ['a'] });
  assert.equal(missing.seleccion?.completa, false);
  assert.deepEqual(missing.seleccion.idsNoDisponibles, ['a']);
  assert.deepEqual(missing.seleccion.sumasExactas, []);
  const duplicates = read('records', { items: [{ id: 'a', ...cash(20) }, { id: 'a', ...cash(30) }], total: 2, page: 1, totals: { income: 50 } },
    { idsParaSumar: ['a'] });
  assert.equal(duplicates.seleccion?.error?.codigo, 'SELECCION_AMBIGUA');
  assert.equal(duplicates.seleccion.completa, false);
  assert.equal(total(duplicates, 'income').importe, '50.00');
});

test('a dashboard id cannot masquerade as a selection of individual financial records', () => {
  const out = read('dashboard', { cashFlow: [], accountsReceivable: [], sourceSummary: { totals: { income: 20 } } },
    { idsParaSumar: ['a'] });
  assert.equal(out.seleccion?.error?.codigo, 'SELECCION_NO_ADMITIDA');
  assert.equal(out.seleccion.completa, false);
  assert.equal(total(out, 'income').importe, '20.00');
});

test('an entirely unavailable receivable selection produces no zero-valued subtotal', () => {
  const out = read('receivables-ledger', { items: [], totals: { outstandingTotal: 0 } }, { idsParaSumar: ['not-returned'] });
  assert.equal(out.seleccion.completa, false);
  assert.deepEqual(out.seleccion.idsNoDisponibles, ['not-returned']);
  assert.deepEqual(out.seleccion.sumasExactas, []);
});
