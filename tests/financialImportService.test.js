import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {
    buildFinancialImportPersistencePlan,
    parseFinancialImportWorkbook
} from '../src/services/financialImportService.js';

const fixtureCsv = `Clientes,Enero,Febrero,Marzo,Abril,Mayo,Junio,Julio,Agosto,Septiembre,Octubre,Noviembre,Diciembre,Total
Gobernacion de Bolivar,$10.000.000,$10.000.000,,,,,,,,,,,$20.000.000
Pablo Hoff,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,,,,,,$21.000.000
Total ingresos,$13.000.000,$13.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,,,,,,$41.000.000
Egresos,,,,,,,,,,,,,
Gabriel / Kamila del toro,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$39.600.000
Elisa Mestre,$4.000.000,$4.000.000,,,,,,,,,,,$8.000.000
Total egresos,$7.600.000,$7.600.000,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$47.600.000
Total UTILIDAD,$5.400.000,$5.400.000,-$600.000,-$600.000,-$600.000,-$600.000,$0,$0,$0,$0,$0,$0,-$6.600.000
DEUDAS GRANDES,,,,,,,,,,,,,
Javid Tramite y Asesorias,,,,,,,,,,,,,$4.710.000
Supernice,,,,,,,,,,,,,$2.986.000
`;

const compactNumberFixtureCsv = `Clientes,Enero,Febrero,Marzo,Abril,Mayo,Junio,Julio,Agosto,Septiembre,Octubre,Noviembre,Diciembre,Total
Cliente Prueba,800,494.613,,,,,,,,,,,$1.294.613
Total ingresos,800,494.613,,,,,,,,,,,$1.294.613
DEUDAS GRANDES,,,,,,,,,,,,,
Tambores,800,,,,,,,,,,,,,
`;

const categorizedMonthlyFixtureCsv = `Categoría,Detalle,Enero,Febrero,Marzo,Abril,Mayo,Junio,Julio,Agosto,Septiembre,Octubre,Noviembre,Diciembre
Ingresos mensuales,Clientes Fee mensual,,,,,,,,,,,,
,Mimas,$1.080.000,$1.080.000,,,,,,,,,,
,Pablo Hoff,$1.450.000,$1.450.000,,,,,,,,,,
Total Ingresos,,$2.530.000,$2.530.000,,,,,,,,,,
Costos Administrativos,Nómina,,,,,,,,,,,,
,Francisco Villa,$4.508.300,$4.508.300,,,,,,,,,,
,Gabriel / Kamila del toro,,,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000
,Pagos financieros,,,,,,,,,,,,
,Cuota de manejo,$14.200,$14.200,,,,,,,,,,
Total costos administrativos,,$4.522.500,$4.522.500,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000
Gastos operativos,Herramientas digitales,,,,,,,,,,,,
,"(ChatGPT, Envato, Adobe, CatGut)",$614.308,$614.308,,,,,,,,,,
,Pautas,$1.645.414,$3.193.772,,,,,,,,,,
Total gastos operativos,,$2.259.722,$3.808.080,,,,,,,,,,
Total Costos y gastos,,$6.782.222,$8.330.580,$3.600.000,$3.600.000,$3.600.000,$3.600.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000,$3.000.000
RESULTADO DEL EJERCICIO,,-$4.252.222,-$5.800.580,-$3.600.000,-$3.600.000,-$3.600.000,-$3.600.000,-$3.000.000,-$3.000.000,-$3.000.000,-$3.000.000,-$3.000.000,-$3.000.000
`;

const createWorkbookFixture = () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['Nombre del empleado', 'Cargo', 'Fecha inicio', '# días', 'Devengado', 'Salud 12.5%', 'Pensión 16%', 'Arl 0,552 %', 'Total seguridad social', 'Bonificaciones / Comisiones', 'Total a pagar mensual'],
            ['Francisco Villa', 'CEO', '01/02/26', 30, '$5.000.000', '$218.900', '$280.200', '$9.200', '$508.300', '', '$5.508.300'],
            ['Gabriel / Kamila del toro', 'Project Manager', '', 30, '$3.000.000', '', '', '', '', '', '$3.000.000'],
            ['Total', '', '', '', '$8.000.000', '', '', '', '$508.300', '', '$8.508.300']
        ]),
        'NOMINA 2026'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(categorizedMonthlyFixtureCsv.split('\n').map((line) => line.split(','))),
        'FLUJO MENSUAL MEMBRESIAS'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['Morosos', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'ESTADO', 'COMENTARIOS'],
            ['Javid Tramite y Asesorias', '$4.710.000', '', '', '', '', '', '', '', 'DEBE', ''],
            ['Tambores', '$800.000', '', '', '', '', '', '', '', 'DEBE', ''],
            ['Total', '$5.510.000', '', '', '', '', '', '', '', '$5.510.000', '$800.000']
        ]),
        'MOROSOS'
    );

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

test('parseFinancialImportWorkbook converts monthly finance rows into importable entries', () => {
    const result = parseFinancialImportWorkbook(Buffer.from(fixtureCsv, 'utf8'), {
        filename: 'FINANZAS BRAIN STUDIO 2026.csv',
        year: 2026
    });

    assert.equal(result.year, 2026);
    assert.equal(result.entries.length, 23);
    assert.equal(result.totals.explicit.income, 41000000);
    assert.equal(result.totals.explicit.expense, 47600000);
    assert.equal(result.totals.calculated.income, 41000000);
    assert.equal(result.totals.calculated.expense, 47600000);

    const julyPayroll = result.entries.find((entry) => (
        entry.sourceLabel === 'Gabriel / Kamila del toro' &&
        entry.month === 7
    ));
    assert.equal(julyPayroll.amount, 3000000);
    assert.equal(julyPayroll.type, 'EXPENSE');
    assert.equal(julyPayroll.category, 'NOMINA');
    assert.equal(julyPayroll.date, '2026-07-01');
});

test('parseFinancialImportWorkbook flags shared payroll rows that must be split by person and dates', () => {
    const result = parseFinancialImportWorkbook(Buffer.from(fixtureCsv, 'utf8'), {
        filename: 'FINANZAS BRAIN STUDIO 2026.csv',
        year: 2026
    });

    assert.deepEqual(result.payrollContinuityFlags, [{
        rowNumber: 6,
        label: 'Gabriel / Kamila del toro',
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        reason: 'Fila compartida de nomina: debe separarse por colaborador y vigencia antes de consolidar nomina.'
    }]);
});

test('parseFinancialImportWorkbook returns debt rows separately from operating records', () => {
    const result = parseFinancialImportWorkbook(Buffer.from(fixtureCsv, 'utf8'), {
        filename: 'FINANZAS BRAIN STUDIO 2026.csv',
        year: 2026
    });

    assert.equal(result.debts.length, 2);
    assert.equal(result.debts[0].sourceLabel, 'Javid Tramite y Asesorias');
    assert.equal(result.debts[0].amount, 4710000);
    assert.equal(result.totals.calculated.debt, 7696000);
});

test('parseFinancialImportWorkbook infers compact accounting numbers as thousands', () => {
    const result = parseFinancialImportWorkbook(Buffer.from(compactNumberFixtureCsv, 'utf8'), {
        filename: 'compact.csv',
        year: 2026
    });

    assert.equal(result.entries[0].amount, 800000);
    assert.equal(result.entries[1].amount, 494613);
    assert.equal(result.debts[0].amount, 800000);
    assert.equal(result.totals.calculated.income, 1294613);
});

test('parseFinancialImportWorkbook supports categorized monthly finance sheets', () => {
    const result = parseFinancialImportWorkbook(Buffer.from(categorizedMonthlyFixtureCsv, 'utf8'), {
        filename: 'flujo-mensual.csv',
        year: 2026
    });

    assert.equal(result.entries.filter((entry) => entry.type === 'INCOME').length, 4);
    assert.equal(result.totals.explicit.income, 5060000);
    assert.equal(result.totals.explicit.expense, 41445000);
    assert.equal(result.totals.calculated.income, 5060000);
    assert.equal(result.totals.calculated.expense, 41445000);
    assert.equal(result.totals.calculated.operatingExpense, 6067802);
    assert.deepEqual(result.totals.monthly.explicit.income.slice(0, 2), [2530000, 2530000]);
    assert.deepEqual(result.totals.monthly.calculated.income.slice(0, 2), [2530000, 2530000]);
    assert.deepEqual(result.totals.monthly.explicit.expense.slice(0, 2), [4522500, 4522500]);
    assert.deepEqual(result.totals.monthly.explicit.operatingExpense.slice(0, 2), [2259722, 3808080]);

    const pauta = result.entries.find((entry) => entry.sourceLabel === 'Pautas' && entry.month === 2);
    assert.equal(pauta.category, 'PAUTA');
    assert.equal(pauta.sourceSection, 'OPERATING_EXPENSE');
    assert.equal(pauta.amount, 3193772);

    assert.equal(result.payrollContinuityFlags[0].label, 'Gabriel / Kamila del toro');
});

test('parseFinancialImportWorkbook reads the complete finance workbook using the right sheets', () => {
    const result = parseFinancialImportWorkbook(createWorkbookFixture(), {
        filename: 'FINANZAS BRAIN STUDIO 2026.xlsx',
        year: 2026
    });

    assert.equal(result.sourceSheet, 'FLUJO MENSUAL MEMBRESIAS');
    assert.deepEqual(result.workbook.sheetNames, ['NOMINA 2026', 'FLUJO MENSUAL MEMBRESIAS', 'MOROSOS']);
    assert.equal(result.payrollRoster.length, 2);
    assert.equal(result.payrollRoster[0].name, 'Francisco Villa');
    assert.equal(result.payrollRoster[0].monthlyTotal, 5508300);
    assert.equal(result.debts.length, 2);
    assert.equal(result.totals.calculated.debt, 5510000);
    assert.equal(result.totals.explicit.debt, 5510000);
    assert.equal(result.totals.explicit.debtComments, 800000);
});

test('buildFinancialImportPersistencePlan separates actual months from forecast months', () => {
    const plan = buildFinancialImportPersistencePlan(Buffer.from(fixtureCsv, 'utf8'), {
        filename: 'FINANZAS BRAIN STUDIO 2026.csv',
        year: 2026,
        actualThroughMonth: 8
    });

    const august = plan.records.find((record) => record.month === 8);
    const september = plan.records.find((record) => record.month === 9);
    assert.equal(august.scenario, 'ACTUAL');
    assert.equal(august.isProjection, false);
    assert.equal(august.origin, 'IMPORT');
    assert.equal(september.scenario, 'FORECAST');
    assert.equal(september.isProjection, true);
    assert.equal(september.origin, 'IMPORT');
    assert.ok(plan.receivables.every((receivable) => receivable.origin === 'IMPORT'));
});

test('buildFinancialImportPersistencePlan preserves payroll contract start dates from the roster', () => {
    const plan = buildFinancialImportPersistencePlan(createWorkbookFixture(), {
        filename: 'FINANZAS BRAIN STUDIO 2026.xlsx',
        year: 2026,
        actualThroughMonth: 8
    });
    const francisco = plan.payrollContracts.find((contract) => contract.employeeName === 'Francisco Villa');
    assert.equal(francisco.startDate.toISOString(), '2026-02-01T00:00:00.000Z');
});

test('parseFinancialImportWorkbook preserves exact numeric formula results below one thousand', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Categoria', 'Detalle', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
        ['Ingresos mensuales', 'Clientes Fee mensual'],
        ['', 'Cliente prueba', 1000000],
        ['Total Ingresos', '', 1000000],
        ['Costos Administrativos', 'Nomina'],
        ['', 'Cuatro por mil', { f: '80+59.6', v: 139.6 }],
        ['Total costos administrativos', '', 139.6]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'FLUJO MENSUAL MEMBRESIAS');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = parseFinancialImportWorkbook(buffer, { year: 2026 });
    const expense = result.entries.find((entry) => entry.sourceLabel === 'Cuatro por mil');
    assert.equal(expense.amount, 139.6);
    assert.equal(result.totals.calculated.expense, 139.6);
});
