import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGING_BUCKETS, agingBucketOf, debtAgeDays, oldestAgingBucket, payableAgeStart, summarizeAging } from '../src/lib/debtAging.js';
import { FINANCIAL_TAB_GROUPS, financialTabOfView, viewForFinancialTab, visibleFinancialTabs } from '../src/lib/financialTabs.js';
import { groupFinancialReceivables } from '../src/utils/financialReceivables.js';

// Elisa, 23 de octubre de 2026: «hay muchas ventanas … Movimientos, cuentas por cobrar … cuentas por pagar
// … estos 3 aparte del análisis o informe»; «en las c*c sería genial lo del tiempo, los que deben 30 días,
// 60, o más»; «hay inconsistencia con los tamaños … en cartera parecen otras fuentes».

const today = '2026-10-23';
const open = (overrides = {}) => ({ id: 'r', kind: 'CLIENTE', status: 'DEBE', outstanding: 100000, balanceReviewRequired: false, period: '2026-10-01T00:00:00.000Z', ...overrides });

test('Financiero tiene cuatro pestañas y cada vista vive en una sola', () => {
    // Terceros llegó el mismo día, como su propia pestaña (el modelo que mandó Elisa).
    assert.deepEqual(FINANCIAL_TAB_GROUPS.map((group) => group.label), ['Movimientos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Terceros', 'Análisis']);
    const views = FINANCIAL_TAB_GROUPS.flatMap((group) => group.views.map((view) => view.key));
    assert.deepEqual(views.sort(), ['flow', 'formalizations', 'parties', 'payables', 'payroll', 'profitability', 'receivables', 'records']);
    assert.equal(new Set(views).size, views.length);
    assert.equal(financialTabOfView('formalizations'), 'cobrar', 'la formalización vive en Cuentas por cobrar');
    assert.equal(financialTabOfView('payroll'), 'pagar', 'la nómina va dentro de Cuentas por pagar');
    assert.equal(financialTabOfView('parties'), 'terceros');
    assert.equal(financialTabOfView('profitability'), 'analisis');
});

test('Rentabilidad solo aparece para administración, y tocar una pestaña abre su primera vista', () => {
    assert.equal(visibleFinancialTabs({ isAdmin: false }).find((group) => group.key === 'analisis').views.length, 1);
    assert.equal(visibleFinancialTabs({ isAdmin: true }).find((group) => group.key === 'analisis').views.length, 2);
    assert.equal(viewForFinancialTab('pagar', 'records'), 'payables');
    assert.equal(viewForFinancialTab('pagar', 'payroll'), 'payroll', 'si ya se está en una vista de esa pestaña, se queda');
    assert.equal(viewForFinancialTab('analisis', 'records', { isAdmin: false }), 'flow');
});

test('Formalización solo aparece para Dirección y Administrativa (29 de octubre de 2026)', () => {
    const cobrar = (options) => visibleFinancialTabs(options).find((group) => group.key === 'cobrar').views.map((view) => view.key);
    assert.deepEqual(cobrar({ isAdmin: true }), ['receivables'], 'ser administrador no basta: lo decide el área');
    assert.deepEqual(cobrar({ canFormalize: true }), ['receivables', 'formalizations']);
    assert.equal(viewForFinancialTab('cobrar', 'records', { canFormalize: true }), 'receivables', 'la pestaña abre en Cuentas por cobrar');
});

test('la antigüedad es la del documento: desde la emisión, o el periodo; en lo que se paga, desde que llegó', () => {
    assert.equal(debtAgeDays(open({ issuedAt: '2026-09-23T00:00:00.000Z', dueDate: '2026-12-01' }), today), 30, 'el vencimiento no la mueve');
    assert.equal(debtAgeDays(open({ period: '2026-07-01T00:00:00.000Z' }), today), 114);
    assert.equal(debtAgeDays({ receivedAt: '2026-08-24T12:00:00.000Z' }, today, payableAgeStart), 60);
    assert.equal(debtAgeDays(open({ issuedAt: '2026-11-01' }), today), 0, 'una fecha futura cuenta como hoy');
});

test('los tres tramos del modelo de Elisa: 0–30, 31–60 y más de 60 días', () => {
    assert.deepEqual(AGING_BUCKETS.map((bucket) => bucket.label), ['0–30 días', '31–60 días', 'Más de 60 días']);
    assert.equal(agingBucketOf(open({ issuedAt: '2026-09-23' }), today), 'DE_0_A_30');
    assert.equal(agingBucketOf(open({ issuedAt: '2026-09-22' }), today), 'DE_31_A_60');
    assert.equal(agingBucketOf(open({ issuedAt: '2026-08-24' }), today), 'DE_31_A_60');
    assert.equal(agingBucketOf(open({ issuedAt: '2026-08-23' }), today), 'MAS_DE_60');
    assert.equal(agingBucketOf({ status: 'PARCIAL', outstanding: 500000, receivedAt: '2026-06-01' }, today, payableAgeStart), 'MAS_DE_60');
});

test('lo pagado, lo saldado, lo anulado y lo que está por verificar no entran en la antigüedad', () => {
    assert.equal(agingBucketOf(open({ outstanding: 0 }), today), null);
    assert.equal(agingBucketOf(open({ status: 'PAGADO' }), today), null);
    assert.equal(agingBucketOf(open({ status: 'SALDADO' }), today), null);
    assert.equal(agingBucketOf(open({ balanceReviewRequired: true, outstanding: null }), today), null);
    assert.equal(agingBucketOf({ status: 'ANULADA', outstanding: 100, receivedAt: '2026-01-01' }, today, payableAgeStart), null);
});

test('el resumen suma en centavos por tramo y cuenta los terceros con saldo', () => {
    const summary = summarizeAging([
        open({ id: 'a', clientId: 'grit', outstanding: 0.1, issuedAt: '2026-10-20' }),
        open({ id: 'b', clientId: 'grit', outstanding: 0.2, issuedAt: '2026-10-10' }),
        open({ id: 'c', clientId: 'salsipuedes', outstanding: 3500000, issuedAt: '2026-05-01' }),
        open({ id: 'd', clientId: 'nuva', outstanding: 0, issuedAt: '2026-05-01' })
    ], { today });
    assert.equal(summary.total, 3500000.3);
    assert.equal(summary.count, 3);
    assert.equal(summary.parties, 2, 'Nuva no tiene saldo');
    assert.equal(summary.buckets.find((bucket) => bucket.key === 'DE_0_A_30').amount, 0.3);
    assert.equal(summary.buckets.find((bucket) => bucket.key === 'MAS_DE_60').count, 1);
    assert.equal(oldestAgingBucket([open({ issuedAt: '2026-10-20' }), open({ issuedAt: '2026-05-01' })], today), 'MAS_DE_60');
});

test('un préstamo va en su propio grupo, aunque el tercero también sea cliente', () => {
    const groups = groupFinancialReceivables([
        open({ id: 'factura', clientId: 'iris', clientName: 'La Sazón de Iris', issuedAt: '2026-10-20' }),
        open({ id: 'prestamo', clientId: 'iris', clientName: 'La Sazón de Iris', kind: 'PRESTAMO', counterpartyType: 'CLIENTE', outstanding: 1060000, period: '2026-06-01' })
    ], today);
    assert.equal(groups.length, 2);
    const loan = groups.find((group) => group.kind === 'PRESTAMO');
    assert.equal(loan.counterpartyType, 'CLIENTE');
    assert.equal(loan.totalOutstanding, 1060000);
    assert.equal(loan.oldestBucket, 'MAS_DE_60');
    assert.equal(groups.find((group) => group.kind === 'CLIENTE').oldestBucket, 'DE_0_A_30');
});

const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
const payables = fs.readFileSync(new URL('../src/components/modules/financial/PayablesTab.jsx', import.meta.url), 'utf8');

test('la pantalla pinta las pestañas de la regla, no una lista escrita a mano', () => {
    assert.match(dashboard, /visibleFinancialTabs\(\{ isAdmin: isAdminUser, canFormalize \}\)/);
    assert.match(dashboard, /<FinancialSubTabs views=\{activeTabViews\}/);
    assert.doesNotMatch(dashboard, />\s*Nómina Operativa\s*</);
    assert.doesNotMatch(dashboard, />\s*Por pagar\s*</);
    assert.doesNotMatch(dashboard, /onClick=\{\(\) => setActiveTab\('receivables'\)\}/);
});

test('Cuentas por cobrar, Proveedores y Nómina usan el mismo encabezado y las mismas cifras', () => {
    assert.match(dashboard, /<FinancialSectionHeader title="Cuentas por cobrar"/);
    assert.match(dashboard, /<FinancialSectionHeader title="Nómina"/);
    assert.match(payables, /<FinancialSectionHeader title="Proveedores y gastos"/);
    // Cobrar y pagar usan el mismo resumen de antigüedad.
    assert.match(payables, /<DebtAgingSummary data-payables-summary/);
    assert.match(dashboard, /<DebtAgingSummary data-receivable-summary/);
    // En las cuentas por cobrar no quedan letras de 9 px ni títulos en negra: era lo que se veía distinto.
    const receivables = dashboard.slice(dashboard.indexOf("{activeTab === 'receivables' && ("), dashboard.indexOf("{activeTab === 'profitability'"));
    assert.doesNotMatch(receivables, /text-\[9px\]|font-black|violet-/);
});
