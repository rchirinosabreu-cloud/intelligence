import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    MARGIN_FLOOR,
    monthlyIncomeStatement,
    marginBarClass,
    splitOutgoings,
    percentLabel
} from '../src/lib/incomeStatement.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const dashboardSource = read('../src/components/modules/FinancialDashboard.jsx');
const tabSource = read('../src/components/modules/financial/IncomeStatementTab.jsx');
const controllerSource = read('../src/controllers/financialController.js');

const HOY = new Date('2026-11-12T17:00:00Z');
const mes = (raw) => monthlyIncomeStatement({ months: [raw], today: HOY })[0];

test('el color de la barra dice si alcanzó el piso, y el mes en curso no opina', () => {
    const septiembre = mes({ year: 2026, month: 9, income: 44800129, expense: 60248034, loansGranted: 25323150, loanRepayments: 0 });
    const octubre = mes({ year: 2026, month: 10, income: 48981917, expense: 33987127, loansGranted: 218146, loanRepayments: 0 });
    const noviembre = mes({ year: 2026, month: 11, income: 12058315, expense: 8567250, loansGranted: 0, loanRepayments: 0 });

    // Septiembre quedó en 22,0 %: positivo, pero bajo el piso del plan.
    assert.ok(septiembre.operatingMargin > 0);
    assert.equal(marginBarClass(septiembre), 'fill-[rgb(var(--brand-coral))]');
    assert.equal(marginBarClass(octubre), 'fill-[rgb(var(--brand-green))]');
    // Un mes a medias es gris: todavía no alcanzó ni dejó de alcanzar nada.
    assert.equal(marginBarClass(noviembre), 'fill-zinc-300 dark:fill-zinc-700');

    // Un mes sin ingreso operativo tampoco recibe veredicto.
    const vacio = mes({ year: 2026, month: 1, income: 0, expense: 500000, loansGranted: 0, loanRepayments: 0 });
    assert.equal(marginBarClass(vacio), 'fill-zinc-300 dark:fill-zinc-700');

    // Y un mes que perdió plata operando sí es coral.
    const perdida = mes({ year: 2026, month: 2, income: 10000000, expense: 14000000, loansGranted: 0, loanRepayments: 0 });
    assert.equal(marginBarClass(perdida), 'fill-[rgb(var(--brand-coral))]');
});

test('los colores salen de los tokens de marca, nunca de un hexadecimal', () => {
    for (const month of [{ inProgress: false, marginRate: 0.4, operatingMargin: 1, belowFloor: false },
        { inProgress: false, marginRate: 0.1, operatingMargin: 1, belowFloor: true }]) {
        assert.match(marginBarClass(month), /rgb\(var\(--brand-(green|coral)\)\)/);
    }
    assert.doesNotMatch(tabSource, /#[0-9a-fA-F]{6}/, 'la vista no escribe colores a mano');
    assert.doesNotMatch(tabSource, /violet-|indigo-|emerald-|sky-|rose-/, 'ni utilidades fuera de la paleta');
});

test('lo prestado queda fuera del gasto y de sus porcentajes', () => {
    // Las cifras del periodo en producción: el «Total Gastos» venía inflado por los préstamos.
    const salida = splitOutgoings({
        NOMINA: 237000000,
        OPERATIVO: 60000000,
        ADMINISTRATIVO: 20000000,
        PRESTAMO: 26841296,
        PAUTA: 0
    }, (name) => ({ NOMINA: 'Nómina', OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Administrativo' }[name] || name));

    assert.equal(salida.operatingTotal, 317000000);
    assert.equal(salida.loansTotal, 26841296);
    assert.deepEqual(salida.operating.map((row) => row.rawName), ['NOMINA', 'OPERATIVO', 'ADMINISTRATIVO']);
    // De mayor a menor, y nómina se nombra: era un arco anónimo en la rueda.
    assert.equal(salida.operating[0].name, 'Nómina');
    assert.ok(Math.abs(salida.operating[0].share - 0.7476) < 0.001);
    // Los porcentajes suman el total de operación, sin el préstamo.
    const suma = salida.operating.reduce((acc, row) => acc + row.share, 0);
    assert.ok(Math.abs(suma - 1) < 1e-9);
    // Una categoría en cero no ocupa una fila.
    assert.ok(!salida.operating.some((row) => row.rawName === 'PAUTA'));
});

test('sin datos no se inventa una distribución', () => {
    assert.deepEqual(splitOutgoings(null), { operating: [], loans: [], operatingTotal: 0, loansTotal: 0 });
    assert.deepEqual(splitOutgoings({}), { operating: [], loans: [], operatingTotal: 0, loansTotal: 0 });
    // Solo préstamos: nada que repartir, pero el préstamo se conserva.
    const soloPrestamo = splitOutgoings({ PRESTAMO: 500000 });
    assert.equal(soloPrestamo.operatingTotal, 0);
    assert.equal(soloPrestamo.loansTotal, 500000);
});

test('el porcentaje se escribe con coma, como el resto de la plataforma', () => {
    assert.equal(percentLabel(MARGIN_FLOOR), '28,6 %');
    assert.equal(percentLabel(0.2204), '22,0 %');
});

test('la vista consume la regla y no la vuelve a calcular', () => {
    assert.match(tabSource, /from '@\/lib\/incomeStatement'/);
    assert.match(tabSource, /monthlyIncomeStatement\(/);
    assert.match(tabSource, /incomeStatementTotals\(/);
    assert.match(tabSource, /incomeStatementReadings\(/);
    assert.match(tabSource, /splitOutgoings\(/);
    // La pestaña del tablero es la vista, no cien líneas de JSX otra vez.
    assert.match(dashboardSource, /activeTab === 'flow' && \(\s*\n\s*<IncomeStatementTab/);
    assert.match(dashboardSource, /pending=\{!!\(indicatorsPending \|\| error\)\}/);
});

test('la gráfica vieja no vuelve: ni líneas de bruto ni rueda sin rótulos', () => {
    // Dibujaba ingresos vs egresos brutos y ponía septiembre de 2026 en rojo por préstamos.
    for (const source of [dashboardSource, tabSource]) {
        assert.doesNotMatch(source, /<LineChart/);
        assert.doesNotMatch(source, /<PieChart/);
        assert.doesNotMatch(source, /<Pie\b/);
    }
    assert.doesNotMatch(dashboardSource, /expenseDistributionData|CATEGORY_COLORS/);
    assert.doesNotMatch(dashboardSource, /#10b981|#ef4444|#ec4899|#4f46e5/);
    assert.doesNotMatch(dashboardSource, /violet-600/);
});

test('el piso del plan se nombra y lo prestado se explica', () => {
    assert.match(tabSource, /Piso del plan/);
    assert.match(tabSource, /Prestado, no gastado/);
    assert.match(tabSource, /No entra en el total de arriba ni en sus porcentajes/);
    // Cada fila lleva nombre, cifra y porcentaje a la vista.
    assert.match(tabSource, /data-outgoing=\{row\.rawName\}/);
    assert.match(tabSource, /\{formatCurrency\(row\.value\)\}/);
    assert.match(tabSource, /percentLabel\(row\.share\)/);
});

test('el servidor aparta préstamos y reintegros mes a mes', () => {
    // Sin este desglose por mes la regla no podría separarlos.
    assert.match(controllerSource, /loansGranted: 0,\s*\n\s*loanRepayments: 0/);
    assert.match(controllerSource, /if \(record\.category === 'PRESTAMO'\) \{\s*\n\s*monthlyGroups\[key\]\.loanRepayments/);
    assert.match(controllerSource, /if \(record\.category === 'PRESTAMO'\) \{\s*\n\s*monthlyGroups\[key\]\.loansGranted/);
    // El flujo bruto se conserva: es el dinero que de verdad se movió en la cuenta.
    assert.match(controllerSource, /netFlow = roundFloat\(monthlyGroups\[key\]\.income - monthlyGroups\[key\]\.expense\)/);
});
