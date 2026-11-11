import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { payrollPersonSummary } from '../src/lib/payrollPayments.js';

// Rodny, 10 de noviembre de 2026: al abrir a una persona en Nómina «se ruedan las descripciones
// arriba», y con todos cerrados las columnas quedaban vacías. La fila cerrada dice el mes de la
// persona y las columnas tienen ancho fijo.

test('el resumen del mes suma lo vigente y dice el estado en palabras', () => {
    const paid = { status: 'PAID', baseSalary: 750000, socialSecurity: 0, netAmount: 750000, paidAmount: 750000 };
    const draft = { status: 'DRAFT', baseSalary: 1500000, socialSecurity: 0, netAmount: 1500000, paidAmount: 0 };
    const reverted = { status: 'DRAFT', voidedAt: '2026-11-01', baseSalary: 1000000, socialSecurity: 0, netAmount: 1000000 };
    const jesus = payrollPersonSummary([paid, draft, reverted, null]);
    assert.equal(jesus.count, 2, 'la revertida no cuenta');
    assert.equal(jesus.net, 2250000);
    assert.equal(jesus.outstanding, 1500000);
    assert.deepEqual(jesus.status, { key: 'MIXED', label: '1 pagada · 1 borrador' });

    assert.equal(payrollPersonSummary([draft]).status.label, 'Borrador');
    assert.equal(payrollPersonSummary([paid, { ...paid }]).status.label, '2 pagadas');
    const partial = payrollPersonSummary([{ status: 'APPROVED', baseSalary: 659200, socialSecurity: 0, netAmount: 659200, paidAmount: 325000 }]);
    assert.equal(partial.status.key, 'PARTIAL');
    assert.equal(partial.outstanding, 334200);
    assert.deepEqual(payrollPersonSummary([]).status, { key: 'NONE', label: 'Sin generar' });
});

test('la tabla de Nómina tiene columnas fijas y la fila de la persona usa el resumen', () => {
    const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
    assert.match(dashboard, /<table data-payroll-table className="[^"]*table-fixed/);
    assert.match(dashboard, /<colgroup>/);
    assert.match(dashboard, /payrollPersonSummary\(person\.rows\.map\(row => row\.transaction\)\)/);
    assert.match(dashboard, /<PayrollStatusBadge status=\{summary\.status\} \/>/);
    assert.match(dashboard, /data-payroll-person-toggle aria-expanded=\{open\}/);
});
