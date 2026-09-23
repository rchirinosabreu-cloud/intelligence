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
    // El tablero recibe además la categoría; cartera y nómina siguen con filterQuery,
    // porque no se clasifican por categoría.
    assert.match(dashboardSource, /dashboard\?\$\{dashboardQuery\}/);
    assert.match(dashboardSource, /const dashboardQuery = useMemo\(\(\) => \(\s*\r?\n?\s*filters\.category \?/);
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
    // El catálogo de categorías es compartido: el libro lo lee, no lo copia.
    assert.match(ledgerSource, /FINANCIAL_CATEGORY_OPTIONS, financialCategoryLabel \} from '@\/lib\/financialCategories'/);
    assert.doesNotMatch(ledgerSource, /\['SERVICIO', 'Servicio'\]/);
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
    // El tablero pasó del DatePicker crudo al componente compartido, que trae el
    // ancho, la posición del panel y el portal que lo saca del modal.
    assert.match(dashboardSource, /<BrainDatePicker ariaLabel="Fecha del pago de nómina" required value=\{payrollPaymentForm\.paidAt\}/);
    assert.doesNotMatch(dashboardSource, /selected=\{payrollPaymentForm\.paidAt/);
});

// Rodny, 22 de septiembre de 2026: el calendario se abría volteado sobre el
// formulario y la etiqueta quedaba pegada al campo, porque el diálogo dibujaba sus
// propios DatePicker en vez de usar el compartido.
test('the receivable dialog uses the shared pickers, with the label above the field', () => {
    assert.doesNotMatch(dashboardSource, /from 'react-datepicker'/);
    assert.match(dashboardSource, /import \{ BrainDatePicker, BrainMonthPicker \} from '@\/components\/ui\/BrainDatePicker'/);
    assert.match(dashboardSource, /<span className="block">Periodo<\/span><BrainMonthPicker/);
    assert.match(dashboardSource, /<span className="block">Fecha de vencimiento<\/span><BrainDatePicker/);
    // Un nodo de texto suelto no es hijo de elemento, así que `space-y` no lo separa
    // y el campo se le pega al lado: la etiqueta va envuelta.
    assert.doesNotMatch(dashboardSource, />(Periodo|Fecha de vencimiento|Inicio|Terminación)<Brain/);
});

test('page headers preserve title width until wide desktop layouts', () => {
    const pageHeaderSource = fs.readFileSync(
        new URL('../src/components/ui/PageHeader.jsx', import.meta.url),
        'utf8'
    );

    assert.match(pageHeaderSource, /2xl:flex-row 2xl:items-end/);
    assert.doesNotMatch(pageHeaderSource, /md:flex-row md:items-end/);
});
