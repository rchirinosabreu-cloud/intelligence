import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import XLSX from 'xlsx';
import { parseFinancialImportWorkbook } from '../src/services/financialImportService.js';
import { normalizeFinancialRecordInput, updateFinancialRecord } from '../src/services/financialRecordService.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const existing = {
    id: 'donation-1', type: 'EXPENSE', amount: 650000, category: 'OPERATIVO',
    description: 'Donaciones', sourceLabel: 'Donaciones', sourceRow: 90,
    importBatchId: 'import-1', origin: 'IMPORT', accountId: null,
    date: new Date('2026-08-01T05:00:00Z'), year: 2026, month: 8,
    scenario: 'ACTUAL', status: 'POSTED', section: 'ADMIN_COST',
    postedAt: new Date('2026-09-01T12:00:00Z'),
    receivablePayment: null, payrollTransaction: null, bankMatches: []
};

test('donations, sowing and loans are valid explicit categories without changing amounts', () => {
    for (const category of ['DONACION', 'SIEMBRA', 'PRESTAMO']) {
        const result = normalizeFinancialRecordInput({ ...existing, date: '2026-08-01', category });
        assert.equal(result.category, category);
        assert.equal(result.amount, 650000);
        assert.equal(result.type, 'EXPENSE');
    }
});

test('import preserves explicit donation and sowing categories ahead of person-name heuristics', () => {
    const csv = 'Clientes,Enero,Febrero\nCliente,100,0\nEgresos,,\nDonaciones,650000,0\nDonación de Rodny,200000,0\nSiembra,50000,0\nSiembras,25000,0\nSiembra sin importe,,\nPréstamo a Rodny,300000,0\nCuota préstamo banco,80000,0\nUniformes,10000,0\n';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(csv.trim().split('\n').map(row => row.split(','))), 'FINANZAS BRAIN STUDIO 2026');
    const preview = parseFinancialImportWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { filename: 'categories.xlsx', year: 2026 });
    const expenses = preview.entries.filter(entry => entry.type === 'EXPENSE');
    assert.deepEqual(expenses.map(({ sourceLabel, category, amount }) => [sourceLabel, category, amount]), [
        ['Donaciones', 'DONACION', 650000], ['Donación de Rodny', 'DONACION', 200000],
        ['Siembra', 'SIEMBRA', 50000], ['Siembras', 'SIEMBRA', 25000],
        ['Préstamo a Rodny', 'PRESTAMO', 300000], ['Cuota préstamo banco', 'PRESTAMO', 80000], ['Uniformes', 'OPERATIVO', 10000]
    ]);
});

test('reclassifying an existing donation preserves identity, money and provenance with an audit event', async () => {
    const writes = [], audits = [];
    const tx = {
        financialRecord: {
            findUnique: async () => existing,
            update: async args => { writes.push(args); return { ...existing, ...args.data }; }
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAuditEvent: { create: async args => { audits.push(args.data); return args.data; } }
    };
    const result = await updateFinancialRecord({ $transaction: async run => run(tx) }, existing.id, { category: 'DONACION' }, { id: 'admin-1' });
    for (const key of ['id', 'amount', 'description', 'sourceLabel', 'sourceRow', 'importBatchId', 'origin', 'accountId', 'year', 'month', 'scenario', 'status', 'section']) assert.deepEqual(result[key], existing[key], key);
    assert.equal(result.date.toISOString(), existing.date.toISOString());
    assert.equal(result.postedAt.toISOString(), existing.postedAt.toISOString());
    assert.equal(result.category, 'DONACION');
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].where, { id: existing.id });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].before.category, 'OPERATIVO');
    assert.equal(audits[0].after.category, 'DONACION');
    assert.equal(audits[0].actorId, 'admin-1');
});

test('editing a category preserves the imported timestamp when the form sends the same date', async () => {
    const tx = {
        financialRecord: {
            findUnique: async () => existing,
            update: async ({ data }) => ({ ...existing, ...data })
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAuditEvent: { create: async () => ({}) }
    };
    const prisma = { $transaction: async run => run(tx) };
    const sameDate = await updateFinancialRecord(prisma, existing.id, { date: '2026-08-01', category: 'DONACION' }, { id: 'admin-1' });
    assert.equal(sameDate.date.toISOString(), existing.date.toISOString());
    const changedDate = await updateFinancialRecord(prisma, existing.id, { date: '2026-09-02', category: 'DONACION' }, { id: 'admin-1' });
    assert.equal(changedDate.date.toISOString(), '2026-09-02T12:00:00.000Z');
    assert.equal(changedDate.month, 9);
});

test('schema, entry selector, charts and aggregations expose every category, including unused ones', () => {
    const schema = read('../prisma/schema.prisma').match(/enum FinancialCategory \{([^}]+)\}/)[1];
    for (const category of ['DONACION', 'SIEMBRA', 'PRESTAMO']) {
        assert.match(schema, new RegExp(`\\b${category}\\b`));
        // El catálogo vive en un solo sitio y lo leen el formulario de movimientos
        // y la barra de filtros: si falta ahí, falta en los dos.
        assert.ok(read('../src/lib/financialCategories.js').includes(`['${category}',`));
        assert.ok(read('../src/components/modules/FinancialDashboard.jsx').includes(`'${category}':`));
        assert.ok(read('../src/controllers/financialController.js').includes(`'${category}'`), `${category} seeds the distribution chart`);
        assert.ok(read('../scripts/pre-push-enum.js').includes(`'${category}'`), `${category} exists on a fresh bootstrap too`);
    }
});

test('the editor allows imported entries without an account while new actual entries still require one', () => {
    const ledger = read('../src/components/modules/financial/FinancialLedger.jsx');
    assert.match(ledger, /required=\{form\.scenario === 'ACTUAL' && editingRecord\?\.origin !== 'IMPORT'\}/);
    assert.throws(() => normalizeFinancialRecordInput({ ...existing, date: '2026-08-01', origin: 'MANUAL', category: 'DONACION' }), { code: 'FINANCIAL_RECORD_ACCOUNT_REQUIRED' });
    assert.equal(normalizeFinancialRecordInput({ ...existing, date: '2026-08-01', category: 'DONACION' }).accountId, null);
});

test('startup adds categories idempotently without touching financial records', async () => {
    const { ensureFinancialCategoriesSchema } = await import('../scripts/ensure-financial-categories-schema.js');
    const queries = [];
    const client = { query: async sql => { queries.push(sql); return { rows: [] }; } };
    await ensureFinancialCategoriesSchema(client);
    assert.equal(queries[0], 'BEGIN');
    assert.equal(queries.at(-1), 'COMMIT');
    assert.equal(queries.filter(sql => /ALTER TYPE/.test(sql)).length, 3);
    for (const category of ['DONACION', 'SIEMBRA', 'PRESTAMO']) assert.ok(queries.some(sql => sql.includes(`ADD VALUE IF NOT EXISTS '${category}'`)));
    assert.doesNotMatch(queries.join('\n'), /DROP|DELETE|UPDATE|TRUNCATE|ALTER TABLE/);
    const pkg = JSON.parse(read('../package.json'));
    assert.ok(pkg.scripts.start.indexOf('ensure-financial-categories-schema.js') < pkg.scripts.start.indexOf('node server.js'));
});
