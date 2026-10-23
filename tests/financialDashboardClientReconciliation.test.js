import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');

test('financial dashboard exposes client reconciliation API and tab', () => {
    assert.match(source, /financials-client-reconciliation/);
    assert.match(source, /\/api\/financials\/client-reconciliation/);
    assert.match(source, /\/api\/financials\/client-links\/\$\{encodeURIComponent\(sourceClientId\)\}/);
    // El directorio de clientes es una vista de Cuentas por cobrar (23 de octubre de 2026).
    assert.match(fs.readFileSync(new URL('../src/lib/financialTabs.js', import.meta.url), 'utf8'), /key: 'clients', label: 'Directorio de clientes'/);
    assert.match(source, /activeTab === 'clients'/);
});
