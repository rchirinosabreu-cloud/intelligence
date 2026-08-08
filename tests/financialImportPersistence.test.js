import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {
    buildFinancialImportPersistencePlan,
    persistFinancialImportPlan
} from '../src/services/financialImportService.js';

const buildWorkbook = () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['Categoria', 'Detalle', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
            ['Ingresos mensuales', 'Clientes Fee mensual', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Pablo Hoff', '$1.450.000', '$1.450.000', '', '', '', '', '', '', '', '', '', ''],
            ['Total Ingresos', '', '$1.450.000', '$1.450.000', '', '', '', '', '', '', '', '', '', ''],
            ['Costos Administrativos', 'Nomina', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Francisco Villa', '$5.000.000', '$5.000.000', '', '', '', '', '', '', '', '', '', ''],
            ['Total costos administrativos', '', '$5.000.000', '$5.000.000', '', '', '', '', '', '', '', '', '', ''],
            ['RESULTADO DEL EJERCICIO', '', '-$3.550.000', '-$3.550.000', '', '', '', '', '', '', '', '', '', '']
        ]),
        'FLUJO MENSUAL MEMBRESIAS'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['Nombre del empleado', 'Cargo', 'Fecha inicio', '# dias', 'Devengado', 'Salud 12.5%', 'Pension 16%', 'Arl 0,552 %', 'Total seguridad social', 'Bonificaciones / Comisiones', 'Total a pagar mensual'],
            ['Francisco Villa', 'CEO', '01/02/26', 30, '$5.000.000', '$218.900', '$280.200', '$9.200', '$508.300', '', '$5.508.300']
        ]),
        'NOMINA 2026'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
            ['Morosos', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'ESTADO', 'COMENTARIOS'],
            ['Pablo Hoff', '$900.000', '', '', '', '', '', '', '', 'DEBE', 'Pago pendiente'],
            ['Total', '$900.000', '', '', '', '', '', '', '', '$900.000', '']
        ]),
        'MOROSOS'
    );

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

test('buildFinancialImportPersistencePlan maps workbook audit into database-ready records', () => {
    const plan = buildFinancialImportPersistencePlan(buildWorkbook(), {
        filename: 'FINANZAS BRAIN STUDIO 2026.xlsx',
        year: 2026,
        importedById: 'user-1'
    });

    assert.equal(plan.batch.year, 2026);
    assert.equal(plan.batch.sourceFilename, 'FINANZAS BRAIN STUDIO 2026.xlsx');
    assert.equal(plan.batch.status, 'IMPORTED');
    assert.deepEqual(plan.batch.sourceSheets, ['FLUJO MENSUAL MEMBRESIAS', 'NOMINA 2026', 'MOROSOS']);
    assert.equal(plan.records.length, 4);
    assert.equal(plan.records[0].section, 'REVENUE');
    assert.equal(plan.records[0].sourceSheet, 'FLUJO MENSUAL MEMBRESIAS');
    assert.equal(plan.records[0].sourceRow, 3);
    assert.equal(plan.records[0].date.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(plan.monthlySummaries.length, 12);
    assert.equal(plan.monthlySummaries[0].explicitIncome, 1450000);
    assert.equal(plan.monthlySummaries[0].calculatedIncome, 1450000);
    assert.equal(plan.monthlySummaries[0].netResult, -3550000);
    assert.equal(plan.receivables.length, 1);
    assert.equal(plan.receivables[0].sourceLabel, 'Pablo Hoff');
    assert.equal(plan.receivables[0].comments, 'Pago pendiente');
    assert.equal(plan.payrollPositions[0].title, 'CEO');
    assert.equal(plan.payrollContracts[0].sourceRow, 2);
});

test('persistFinancialImportPlan replaces prior imported year data and writes normalized finance rows', async () => {
    const calls = [];
    const makeModel = (name, createReturn = null) => ({
        deleteMany: async (args) => calls.push([name, 'deleteMany', args]),
        updateMany: async (args) => calls.push([name, 'updateMany', args]),
        createMany: async (args) => calls.push([name, 'createMany', args]),
        create: async (args) => {
            calls.push([name, 'create', args]);
            return createReturn || { id: `${name}-id` };
        },
        upsert: async (args) => {
            calls.push([name, 'upsert', args]);
            return createReturn || { id: `${name}-id` };
        },
        findFirst: async (args) => {
            calls.push([name, 'findFirst', args]);
            return { id: `${name}-id` };
        }
    });
    const tx = {
        financialRecord: makeModel('financialRecord'),
        accountsReceivable: makeModel('accountsReceivable'),
        financialMonthlySummary: makeModel('financialMonthlySummary'),
        financialImportBatch: makeModel('financialImportBatch', { id: 'batch-1' }),
        client: makeModel('client', { id: 'client-1' }),
        payrollPosition: makeModel('payrollPosition', { id: 'position-1' }),
        user: makeModel('user', { id: 'user-1' }),
        payrollContract: makeModel('payrollContract')
    };
    const prisma = {
        $transaction: async (callback) => callback(tx)
    };
    const plan = buildFinancialImportPersistencePlan(buildWorkbook(), {
        filename: 'FINANZAS BRAIN STUDIO 2026.xlsx',
        year: 2026,
        importedById: 'admin-1'
    });

    const result = await persistFinancialImportPlan(prisma, plan);

    assert.equal(result.importBatchId, 'batch-1');
    assert.deepEqual(result.counts, {
        records: 4,
        monthlySummaries: 12,
        receivables: 1,
        payrollContracts: 1
    });
    assert.deepEqual(calls[0], ['financialRecord', 'deleteMany', { where: { year: 2026, importBatchId: { not: null } } }]);
    assert.deepEqual(calls[3], ['financialImportBatch', 'updateMany', { where: { year: 2026, status: 'IMPORTED' }, data: { status: 'REPLACED' } }]);

    const recordsCreate = calls.find(([model, action]) => model === 'financialRecord' && action === 'createMany');
    assert.equal(recordsCreate[2].data[0].importBatchId, 'batch-1');
    assert.equal(recordsCreate[2].data[0].section, 'REVENUE');

    const clientUpsert = calls.find(([model, action]) => model === 'client' && action === 'upsert');
    assert.equal(clientUpsert[2].where.slug, 'pablo-hoff');

    const receivableCreate = calls.find(([model, action]) => model === 'accountsReceivable' && action === 'create');
    assert.equal(receivableCreate[2].data.clientId, 'client-1');
    assert.equal(receivableCreate[2].data.importBatchId, 'batch-1');
});
