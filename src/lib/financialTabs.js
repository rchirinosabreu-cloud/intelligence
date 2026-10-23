// Las pestañas de Financiero (Elisa, 23 de octubre de 2026: «hay muchas ventanas … Movimientos, cuentas
// por cobrar … cuentas por pagar … estos 3 aparte del análisis o informe. Siento que se repiten muchas
// cosas»). Cuatro pestañas y, dentro de cada una, sus vistas. Una vista sigue siendo la unidad que la
// pantalla pinta y consulta; la pestaña solo las agrupa.

export const FINANCIAL_TAB_GROUPS = Object.freeze([
    { key: 'movimientos', label: 'Movimientos', views: [{ key: 'records', label: 'Movimientos' }] },
    {
        key: 'cobrar',
        label: 'Cuentas por cobrar',
        views: [
            { key: 'receivables', label: 'Cuentas y préstamos' },
            { key: 'clients', label: 'Directorio de clientes' }
        ]
    },
    {
        key: 'pagar',
        label: 'Cuentas por pagar',
        views: [
            { key: 'payables', label: 'Proveedores y gastos' },
            { key: 'payroll', label: 'Nómina' }
        ]
    },
    {
        key: 'analisis',
        label: 'Análisis',
        views: [
            { key: 'flow', label: 'Flujo de caja' },
            // Rentabilidad por cliente: solo administradores; el servidor también lo exige.
            { key: 'profitability', label: 'Rentabilidad', adminOnly: true }
        ]
    }
]);

/** Las pestañas que ve esta persona, sin las vistas que su rol no abre. */
export const visibleFinancialTabs = ({ isAdmin = false } = {}) => FINANCIAL_TAB_GROUPS.map((group) => ({
    ...group,
    views: group.views.filter((view) => !view.adminOnly || isAdmin)
}));

export const financialTabOfView = (viewKey) => FINANCIAL_TAB_GROUPS.find((group) => group.views.some((view) => view.key === viewKey))?.key || 'movimientos';

/** Al tocar una pestaña se abre su primera vista, salvo que ya se estuviera en una de ellas. */
export const viewForFinancialTab = (tabKey, currentView, options = {}) => {
    const group = visibleFinancialTabs(options).find((item) => item.key === tabKey);
    if (!group) return currentView;
    return group.views.some((view) => view.key === currentView) ? currentView : group.views[0].key;
};
