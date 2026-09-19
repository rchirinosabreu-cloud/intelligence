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
    assert.match(dashboardSource, /<FinancialFilters/);
    assert.match(dashboardSource, /filters=\{filters\}/);
    assert.match(dashboardSource, /dashboard\?\$\{filterQuery\}/);
    const filtersSource = fs.readFileSync(new URL('../src/components/modules/financial/FinancialFilters.jsx', import.meta.url), 'utf8');
    assert.match(filtersSource, />Ejecutado</);
    assert.match(filtersSource, />Proyección</);
    assert.match(filtersSource, />Presupuesto</);
    assert.match(filtersSource, /type="search" aria-label="Buscar en financiero"/);
    assert.doesNotMatch(dashboardSource, /setPayrollMonth/);
    assert.match(dashboardSource, /const payrollMonth = Number\(filters\.month\)/);
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
    assert.match(ledgerSource, /Saldo total de la cuenta/);
    assert.doesNotMatch(ledgerSource, /setFilters/);
    assert.match(ledgerSource, /Nueva cuenta/);
    assert.match(ledgerSource, /\/api\/financials\/periods/);
    assert.match(ledgerSource, /Cerrar mes/);
    assert.match(ledgerSource, /periods\/reopen/);
    assert.match(ledgerSource, /Reabrir mes/);
    assert.match(ledgerSource, /hasFinancialPermission\(currentUser, 'admin'\)/);
    assert.match(ledgerSource, /FINANCIAL_PERIOD_UNRECONCILED|movimientos sin conciliar/);
    assert.match(ledgerSource, /\['SERVICIO', 'Servicio'\]/);
    // The one calendar of the platform: the shared component, never a raw picker or native date field.
    assert.match(ledgerSource, /<BrainDatePicker ariaLabel="Fecha del movimiento" value=\{form\.date\}/);
    assert.doesNotMatch(ledgerSource, /from 'react-datepicker'|type="date"/);
});

test('financial operational payment dates use the shared calendar', () => {
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{paymentForm\.paidAt\}/);
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{payrollPaymentForm\.paidAt\}/);
    const paymentSource = fs.readFileSync(new URL('../src/components/modules/financial/ReceivablePaymentDialog.jsx', import.meta.url), 'utf8');
    assert.match(paymentSource, /DatePicker \{\.\.\.brainDatePickerProps\}/);
    assert.match(paymentSource, /selected=\{form\.paidAt/);
    assert.match(dashboardSource, /selected=\{payrollPaymentForm\.paidAt/);
});

test('page headers preserve title width until wide desktop layouts', () => {
    const pageHeaderSource = fs.readFileSync(
        new URL('../src/components/ui/PageHeader.jsx', import.meta.url),
        'utf8'
    );

    assert.match(pageHeaderSource, /2xl:flex-row 2xl:items-end/);
    assert.doesNotMatch(pageHeaderSource, /md:flex-row md:items-end/);
});
