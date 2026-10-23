import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGING_BUCKETS, agingBucketOf, oldestAgingBucket, receivableAgeDays, summarizeAging } from '../src/lib/receivableAging.js';
import { FINANCIAL_TAB_GROUPS, financialTabOfView, viewForFinancialTab, visibleFinancialTabs } from '../src/lib/financialTabs.js';
import { groupFinancialReceivables } from '../src/utils/financialReceivables.js';

// Elisa, 23 de octubre de 2026: «hay muchas ventanas … Movimientos, cuentas por cobrar … cuentas por pagar
// … estos 3 aparte del análisis o informe»; «en las c*c sería genial lo del tiempo, los que deben 30 días,
// 60, o más»; «hay inconsistencia con los tamaños … en cartera parecen otras fuentes».

const today = '2026-10-23';
const open = (overrides = {}) => ({ id: 'r', kind: 'CLIENTE', status: 'DEBE', outstanding: 100000, balanceReviewRequired: false, period: '2026-10-01T00:00:00.000Z', ...overrides });

test('Financiero tiene cuatro pestañas y cada vista vive en una sola', () => {
    assert.deepEqual(FINANCIAL_TAB_GROUPS.map((group) => group.label), ['Movimientos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Análisis']);
    const views = FINANCIAL_TAB_GROUPS.flatMap((group) => group.views.map((view) => view.key));
    assert.deepEqual(views.sort(), ['clients', 'flow', 'payables', 'payroll', 'profitability', 'receivables', 'records']);
    assert.equal(new Set(views).size, views.length);
    assert.equal(financialTabOfView('payroll'), 'pagar', 'la nómina va dentro de Cuentas por pagar');
    assert.equal(financialTabOfView('clients'), 'cobrar');
    assert.equal(financialTabOfView('profitability'), 'analisis');
});

test('Rentabilidad solo aparece para administración, y tocar una pestaña abre su primera vista', () => {
    assert.equal(visibleFinancialTabs({ isAdmin: false }).find((group) => group.key === 'analisis').views.length, 1);
    assert.equal(visibleFinancialTabs({ isAdmin: true }).find((group) => group.key === 'analisis').views.length, 2);
    assert.equal(viewForFinancialTab('pagar', 'records'), 'payables');
    assert.equal(viewForFinancialTab('pagar', 'payroll'), 'payroll', 'si ya se está en una vista de esa pestaña, se queda');
    assert.equal(viewForFinancialTab('analisis', 'records', { isAdmin: false }), 'flow');
});

test('la antigüedad cuenta desde el vencimiento, o desde que se emitió, o desde el periodo', () => {
    assert.equal(receivableAgeDays(open({ dueDate: '2026-09-23T00:00:00.000Z', issuedAt: '2026-01-01T00:00:00.000Z' }), today), 30);
    assert.equal(receivableAgeDays(open({ issuedAt: '2026-08-24T00:00:00.000Z' }), today), 60);
    assert.equal(receivableAgeDays(open({ period: '2026-07-01T00:00:00.000Z' }), today), 114);
});

test('cada cuenta abierta cae en un tramo; lo que todavía no vence no es mora', () => {
    assert.equal(agingBucketOf(open({ dueDate: '2026-11-15' }), today), 'POR_VENCER');
    assert.equal(agingBucketOf(open({ dueDate: '2026-10-23' }), today), 'HASTA_30');
    assert.equal(agingBucketOf(open({ dueDate: '2026-09-23' }), today), 'HASTA_30');
    assert.equal(agingBucketOf(open({ dueDate: '2026-09-22' }), today), 'DE_31_A_60');
    assert.equal(agingBucketOf(open({ dueDate: '2026-07-25' }), today), 'DE_61_A_90');
    assert.equal(agingBucketOf(open({ dueDate: '2026-07-24' }), today), 'MAS_DE_90');
});

test('lo pagado, lo saldado y lo que está por verificar no entran en la antigüedad', () => {
    assert.equal(agingBucketOf(open({ outstanding: 0 }), today), null);
    assert.equal(agingBucketOf(open({ status: 'PAGADO' }), today), null);
    assert.equal(agingBucketOf(open({ status: 'SALDADO' }), today), null);
    assert.equal(agingBucketOf(open({ balanceReviewRequired: true, outstanding: null }), today), null);
});

test('el resumen suma en centavos por tramo y dice cuántas cuentas hay', () => {
    const summary = summarizeAging([
        open({ id: 'a', outstanding: 0.1, dueDate: '2026-10-20' }),
        open({ id: 'b', outstanding: 0.2, dueDate: '2026-10-10' }),
        open({ id: 'c', outstanding: 3500000, dueDate: '2026-05-01' }),
        open({ id: 'd', outstanding: 0, dueDate: '2026-05-01' })
    ], today);
    assert.equal(summary.total, 3500000.3);
    assert.equal(summary.count, 3);
    assert.deepEqual(summary.buckets.map((bucket) => bucket.key), AGING_BUCKETS.map((bucket) => bucket.key));
    assert.equal(summary.buckets.find((bucket) => bucket.key === 'HASTA_30').amount, 0.3);
    assert.equal(summary.buckets.find((bucket) => bucket.key === 'MAS_DE_90').count, 1);
    assert.equal(oldestAgingBucket([open({ dueDate: '2026-10-20' }), open({ dueDate: '2026-05-01' })], today), 'MAS_DE_90');
});

test('un préstamo va en su propio grupo, aunque el tercero también sea cliente', () => {
    const groups = groupFinancialReceivables([
        open({ id: 'factura', clientId: 'iris', clientName: 'La Sazón de Iris', dueDate: '2026-10-20' }),
        open({ id: 'prestamo', clientId: 'iris', clientName: 'La Sazón de Iris', kind: 'PRESTAMO', counterpartyType: 'CLIENTE', outstanding: 1060000, dueDate: '2026-06-01' })
    ], today);
    assert.equal(groups.length, 2);
    const loan = groups.find((group) => group.kind === 'PRESTAMO');
    assert.equal(loan.counterpartyType, 'CLIENTE');
    assert.equal(loan.totalOutstanding, 1060000);
    assert.equal(loan.oldestBucket, 'MAS_DE_90');
    assert.equal(groups.find((group) => group.kind === 'CLIENTE').oldestBucket, 'HASTA_30');
});

const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
const payables = fs.readFileSync(new URL('../src/components/modules/financial/PayablesTab.jsx', import.meta.url), 'utf8');

test('la pantalla pinta las pestañas de la regla, no una lista escrita a mano', () => {
    assert.match(dashboard, /visibleFinancialTabs\(\{ isAdmin: isAdminUser \}\)/);
    assert.match(dashboard, /<FinancialSubTabs views=\{activeTabViews\}/);
    assert.doesNotMatch(dashboard, />\s*Nómina Operativa\s*</);
    assert.doesNotMatch(dashboard, />\s*Por pagar\s*</);
    assert.doesNotMatch(dashboard, /onClick=\{\(\) => setActiveTab\('receivables'\)\}/);
});

test('Cuentas por cobrar, Proveedores y Nómina usan el mismo encabezado y las mismas cifras', () => {
    assert.match(dashboard, /<FinancialSectionHeader title="Cuentas por cobrar"/);
    assert.match(dashboard, /<FinancialSectionHeader title="Nómina"/);
    assert.match(payables, /<FinancialSectionHeader title="Proveedores y gastos"/);
    assert.match(payables, /<FinancialSummaryCard label="Por pagar"/);
    assert.match(dashboard, /<ReceivableAgingSummary /);
    // En las cuentas por cobrar no quedan letras de 9 px ni títulos en negra: era lo que se veía distinto.
    const receivables = dashboard.slice(dashboard.indexOf("{activeTab === 'receivables' && ("), dashboard.indexOf("{activeTab === 'profitability'"));
    assert.doesNotMatch(receivables, /text-\[9px\]|font-black|violet-/);
});
