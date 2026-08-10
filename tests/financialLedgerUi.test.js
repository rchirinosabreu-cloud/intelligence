import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboardSource = fs.readFileSync(
    new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url),
    'utf8'
);

test('financial dashboard exposes the operational ledger as a primary tab', () => {
    assert.match(dashboardSource, /setActiveTab\('records'\)/);
    assert.match(dashboardSource, />\s*Movimientos\s*</);
    assert.match(dashboardSource, /<FinancialLedger/);
    assert.match(dashboardSource, /selectedScenario/);
    assert.match(dashboardSource, /scenario=\$\{selectedScenario\}/);
    assert.match(dashboardSource, />Ejecutado</);
    assert.match(dashboardSource, />Proyección</);
    assert.match(dashboardSource, />Presupuesto</);
    assert.match(dashboardSource, /actualThroughMonth/);
    assert.match(dashboardSource, /Mes ejecutado hasta/);
    assert.match(dashboardSource, /canApproveFinancials/);
    assert.match(dashboardSource, /Preparación para operar sin Excel/);
    assert.match(dashboardSource, /\/integrity\?year=/);
});

test('financial ledger uses canonical record endpoints and server-confirmed mutations', () => {
    const ledgerSource = fs.readFileSync(
        new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url),
        'utf8'
    );

    assert.match(ledgerSource, /\/api\/financials\/records\?/);
    assert.match(ledgerSource, /axios\.post\(`\$\{baseUrl\}\/api\/financials\/records`/);
    assert.match(ledgerSource, /\/records\/\$\{recordToVoid\.id\}\/void/);
    assert.match(ledgerSource, /Movimiento registrado/);
    assert.match(ledgerSource, /Registrar movimiento/);
    assert.match(ledgerSource, /Anular movimiento/);
    assert.match(ledgerSource, /\/api\/financials\/accounts/);
    assert.match(ledgerSource, /accountId/);
    assert.match(ledgerSource, /Saldo actual/);
    assert.match(ledgerSource, /Nueva cuenta/);
    assert.match(ledgerSource, /\/api\/financials\/periods/);
    assert.match(ledgerSource, /Cerrar mes/);
    assert.match(ledgerSource, /periods\/reopen/);
    assert.match(ledgerSource, /Reabrir mes/);
    assert.match(ledgerSource, /financialRole === 'ADMIN'/);
    assert.match(ledgerSource, /FINANCIAL_PERIOD_UNRECONCILED|movimientos sin conciliar/);
});

test('financial operational payment dates use the shared calendar', () => {
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{paymentForm\.paidAt\}/);
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{payrollPaymentForm\.paidAt\}/);
    assert.match(dashboardSource, /selected=\{paymentForm\.paidAt/);
    assert.match(dashboardSource, /selected=\{payrollPaymentForm\.paidAt/);
});
