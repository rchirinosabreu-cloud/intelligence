import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFinancialNavigation } from '../src/lib/financialNavigation.js';
import { FINANCIAL_TAB_GROUPS } from '../src/lib/financialTabs.js';

const dashboardSource = fs.readFileSync(
    new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url),
    'utf8'
);

test('financial dashboard exposes the operational ledger as a primary tab', () => {
    // Financiero abre en Movimientos, su primera pestaña; la selección vive en la URL.
    // Un enlace puede abrir otra vista (la revisión del cierre del mes lleva a Rentabilidad); sin él, Movimientos.
    assert.equal(readFinancialNavigation('').activeTab, 'records');
    assert.equal(readFinancialNavigation('?tab=desconocida').activeTab, 'records');
    assert.equal(readFinancialNavigation('?tab=rentabilidad').activeTab, 'profitability');
    assert.equal(FINANCIAL_TAB_GROUPS[0].key, 'movimientos');
    assert.equal(FINANCIAL_TAB_GROUPS[0].label, 'Movimientos');
    assert.equal(FINANCIAL_TAB_GROUPS[0].views[0].key, 'records');
    assert.match(dashboardSource, /const \{[^}]*\bactiveTab\b[^}]*\} = useFinancialNavigation\(\)/);
    assert.match(dashboardSource, /activeTab === 'records' && \(\s*<FinancialLedger\b/);
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
    assert.match(dashboardSource, /canApproveFinancials/);
    // Rodny, 23 de octubre de 2026: «ya estoy 100 % en la plataforma». Ni carga de Excel ni
    // conciliación de extractos: lo que se registra en la plataforma es la fuente.
    assert.doesNotMatch(dashboardSource, /Auditar archivo|Auditoría 2026|Mes ejecutado hasta|Preparación para operar sin Excel/);
    assert.doesNotMatch(dashboardSource, /\/integrity\?year=|\/import\/(preview|commit)|monthly-ledger/);
    assert.doesNotMatch(dashboardSource, /BankReconciliationPanel|setActiveTab\('editor'\)|setActiveTab\('import'\)/);
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

// Rodny, 3 de noviembre de 2026, viendo el formulario con cuatro campos: «nueva cuenta
// es muy básico, faltaría añadir detalles». El modelo ya guardaba de quién es la cuenta
// y cómo reconocerla; la ventana no lo preguntaba y el servicio lo descartaba.
test('una cuenta dice de quién es, cómo reconocerla, y se puede corregir', () => {
    const ledgerSource = fs.readFileSync(
        new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url),
        'utf8'
    );

    // Los datos que el modelo guarda y la ventana ahora sí pregunta.
    for (const field of ['institution', 'holderName', 'holderType', 'identificationType', 'identificationNumber', 'lastFour', 'isThirdPartyHeld']) {
        assert.match(ledgerSource, new RegExp(`accountForm\\.${field}`), `la ventana de cuenta no pregunta ${field}`);
    }
    assert.match(ledgerSource, /La cuenta no es de Brain Studio/);
    // El documento del titular sale del catálogo compartido, no de una lista copiada.
    assert.match(ledgerSource, /PARTY_DOCUMENT_TYPES \} from '@\/lib\/partyIdentity'/);

    // La misma ventana crea y corrige; corregir va por PATCH y conserva el id.
    assert.match(ledgerSource, /editingAccount \? 'Editar cuenta' : 'Nueva cuenta'/);
    assert.match(ledgerSource, /axios\.patch\(`\$\{baseUrl\}\/api\/financials\/accounts\/\$\{editingAccount\.id\}`/);
    assert.match(ledgerSource, /data-account-edit=\{account\.id\}/);
    assert.match(ledgerSource, /canApprove && \(\s*\r?\n?\s*<button[\s\S]{0,400}?data-account-edit/);

    // La tarjeta enseña lo que sirve para reconocer la cuenta en un extracto.
    assert.match(ledgerSource, /data-account-subtitle/);
    assert.match(ledgerSource, /export const accountSubtitle/);

    // El financiero se lleva en pesos: la ventana no ofrece elegir moneda.
    assert.doesNotMatch(ledgerSource, /accountForm\.currency/);
    // La etiqueta va envuelta: un nodo de texto suelto no es hijo de elemento.
    assert.doesNotMatch(ledgerSource, />Saldo inicial<MoneyInput/);
    // El morado heredado de lo que se tocó se migró a la paleta oficial: la tarjeta de
    // la cuenta y el anillo de foco de los campos. Los tonos de escenario siguen como estaban.
    assert.doesNotMatch(ledgerSource, /bg-violet-50 text-violet-600/);
    assert.match(ledgerSource, /focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan\/10/);
    assert.match(ledgerSource, /bg-brand-cyan-soft text-brand-cyan-deep/);
});

test('financial operational payment dates use the shared calendar', () => {
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{paymentForm\.paidAt\}/);
    assert.doesNotMatch(dashboardSource, /required type="date" value=\{payrollPaymentForm\.paidAt\}/);
    const paymentSource = fs.readFileSync(new URL('../src/components/modules/financial/ReceivablePaymentDialog.jsx', import.meta.url), 'utf8');
    assert.match(paymentSource, /DatePicker \{\.\.\.brainDatePickerProps\}/);
    assert.match(paymentSource, /selected=\{form\.paidAt/);
    // El tablero pasó del DatePicker crudo al componente compartido, que trae el
    // ancho, la posición del panel y el portal que lo saca del modal.
    // El pago de nómina vive desde el 30 de septiembre de 2026 en su propio componente
    // (pagos por partes), con el mismo calendario compartido, también en cada ítem del desglose.
    const payrollSource = fs.readFileSync(new URL('../src/components/modules/financial/PayrollPayments.jsx', import.meta.url), 'utf8');
    assert.match(payrollSource, /<BrainDatePicker ariaLabel="Fecha del pago de nómina" required value=\{form\.paidAt\}/);
    assert.match(payrollSource, /<BrainDatePicker ariaLabel=\{`Fecha del ítem \$\{index \+ 1\}`\}/);
    assert.doesNotMatch(payrollSource, /from 'react-datepicker'|type="date"/);
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
