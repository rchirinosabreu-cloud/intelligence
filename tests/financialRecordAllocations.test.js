import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    accumulateCategoryDistribution,
    normalizeFinancialAllocationsInput,
    replaceFinancialRecordAllocations
} from '../src/services/financialRecordAllocationService.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const record = {
    id: 'rec-1', amount: 600000, type: 'EXPENSE', category: 'OPERATIVO', status: 'POSTED', origin: 'MANUAL',
    year: 2026, month: 9, description: 'Inversión en IA de la plataforma, Claude Code, Eleven Labs.', allocations: []
};
const lines = [
    { amount: 370000, category: 'OPERATIVO', description: '  Claude Code ' },
    { amount: '20000', category: 'operativo', description: 'Eleven Labs', counterparty: 'ElevenLabs Inc.' },
    { amount: 210000, category: 'PRESTAMO', description: 'Inversión en la plataforma' }
];

test('a breakdown keeps the money of the movement: lines must add up exactly to its amount', () => {
    const result = normalizeFinancialAllocationsInput(record, lines);
    assert.deepEqual(result.map(line => [line.amount, line.category, line.description, line.counterparty, line.sortOrder]), [
        [370000, 'OPERATIVO', 'Claude Code', null, 0],
        [20000, 'OPERATIVO', 'Eleven Labs', 'ElevenLabs Inc.', 1],
        [210000, 'PRESTAMO', 'Inversión en la plataforma', null, 2]
    ]);
    assert.throws(() => normalizeFinancialAllocationsInput(record, [lines[0], lines[1]]), (error) => {
        assert.equal(error.code, 'FINANCIAL_ALLOCATION_SUM_MISMATCH');
        assert.match(error.message, /210\.000|210000/);
        return true;
    });
    // 0.1 + 0.2 must match 0.3: the comparison happens in cents, not in floating point.
    assert.equal(normalizeFinancialAllocationsInput({ ...record, amount: 0.3 }, [{ amount: 0.1, category: 'OPERATIVO', description: 'a' }, { amount: 0.2, category: 'OPERATIVO', description: 'b' }]).length, 2);
});

test('a breakdown needs at least two real lines, each with concept, valid category and positive money in cents', () => {
    assert.throws(() => normalizeFinancialAllocationsInput(record, [{ amount: 600000, category: 'OPERATIVO', description: 'Todo' }]), { code: 'FINANCIAL_ALLOCATION_MIN_LINES' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, [{ ...lines[0], amount: 0 }, { ...lines[1], amount: 600000 }]), { code: 'FINANCIAL_ALLOCATION_AMOUNT_INVALID' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, [{ ...lines[0], amount: 370000.005 }, { ...lines[1], amount: 229999.995 }]), { code: 'FINANCIAL_ALLOCATION_AMOUNT_INVALID' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, [{ ...lines[0], category: 'SOFTWARE' }, { ...lines[1], amount: 230000 }]), { code: 'FINANCIAL_ALLOCATION_CATEGORY_INVALID' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, [{ ...lines[0], description: '   ' }, { ...lines[1], amount: 230000 }]), { code: 'FINANCIAL_ALLOCATION_DESCRIPTION_REQUIRED' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, Array.from({ length: 21 }, () => ({ amount: 1, category: 'OPERATIVO', description: 'x' }))), { code: 'FINANCIAL_ALLOCATION_TOO_MANY_LINES' });
    assert.throws(() => normalizeFinancialAllocationsInput(record, 'no'), { code: 'FINANCIAL_ALLOCATION_INVALID' });
    assert.deepEqual(normalizeFinancialAllocationsInput(record, []), []);
});

const setup = (existing, { closed = false } = {}) => {
    const calls = [];
    const tx = {
        financialRecord: { findUnique: async () => existing },
        financialRecordAllocation: {
            deleteMany: async args => { calls.push(['deleteMany', args]); return { count: existing.allocations.length }; },
            createMany: async args => { calls.push(['createMany', args]); return { count: args.data.length }; },
            findMany: async () => calls.filter(([name]) => name === 'createMany').flatMap(([, args]) => args.data).map((line, index) => ({ id: `line-${index}`, ...line }))
        },
        financialPeriod: { findUnique: async () => ({ status: closed ? 'CLOSED' : 'OPEN' }) },
        financialAuditEvent: { create: async args => { calls.push(['audit', args.data]); return args.data; } }
    };
    return { calls, prisma: { $transaction: async run => run(tx) } };
};

test('replacing the breakdown swaps lines in one transaction, audits before/after and never touches the movement itself', async () => {
    const existing = { ...record, allocations: [{ id: 'old', amount: 600000, category: 'OPERATIVO', description: 'Anterior', sortOrder: 0 }] };
    const { calls, prisma } = setup(existing);
    const result = await replaceFinancialRecordAllocations(prisma, record.id, lines, { id: 'admin-1' });
    assert.deepEqual(calls.map(([name]) => name), ['deleteMany', 'createMany', 'audit']);
    assert.deepEqual(calls[0][1].where, { recordId: record.id });
    assert.equal(calls[1][1].data.length, 3);
    assert.ok(calls[1][1].data.every(line => line.recordId === record.id));
    const audit = calls[2][1];
    assert.equal(audit.entityType, 'FinancialRecord');
    assert.equal(audit.entityId, record.id);
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.actorId, 'admin-1');
    assert.equal(audit.before.allocations.length, 1);
    assert.equal(audit.after.allocations.length, 3);
    assert.equal(audit.after.amount, 600000);
    assert.equal(result.amount, 600000);
    assert.equal(result.category, 'OPERATIVO');
    assert.equal(result.allocations.length, 3);
    assert.ok(!calls.some(([name]) => name === 'update'), 'the FinancialRecord row is not rewritten');
});

test('an empty breakdown clears the lines; voided, system and closed-period movements are refused', async () => {
    const cleared = setup({ ...record, allocations: [{ id: 'old', amount: 600000, category: 'OPERATIVO', description: 'Anterior', sortOrder: 0 }] });
    const result = await replaceFinancialRecordAllocations(cleared.prisma, record.id, [], { id: 'admin-1' });
    assert.deepEqual(cleared.calls.map(([name]) => name), ['deleteMany', 'audit']);
    assert.deepEqual(result.allocations, []);

    await assert.rejects(replaceFinancialRecordAllocations(setup({ ...record, status: 'VOIDED' }).prisma, record.id, lines, { id: 'admin-1' }), { code: 'FINANCIAL_RECORD_VOIDED' });
    await assert.rejects(replaceFinancialRecordAllocations(setup({ ...record, origin: 'SYSTEM' }).prisma, record.id, lines, { id: 'admin-1' }), { code: 'FINANCIAL_RECORD_SYSTEM_MANAGED' });
    await assert.rejects(replaceFinancialRecordAllocations(setup(record, { closed: true }).prisma, record.id, lines, { id: 'admin-1' }), { code: 'FINANCIAL_PERIOD_CLOSED' });
    await assert.rejects(replaceFinancialRecordAllocations(setup(null).prisma, 'missing', lines, { id: 'admin-1' }), { code: 'FINANCIAL_RECORD_NOT_FOUND' });
    const untouched = setup(record);
    await assert.rejects(replaceFinancialRecordAllocations(untouched.prisma, record.id, [lines[0]], { id: 'admin-1' }), { code: 'FINANCIAL_ALLOCATION_MIN_LINES' });
    assert.deepEqual(untouched.calls, [], 'invalid input never reaches the database');
});

test('category indicators read the breakdown lines when they exist and the movement otherwise', () => {
    const records = [
        { type: 'EXPENSE', category: 'OPERATIVO', amount: 600000, allocations: [
            { amount: 370000, category: 'OPERATIVO' }, { amount: 20000, category: 'OPERATIVO' }, { amount: 210000, category: 'PRESTAMO' }
        ] },
        { type: 'EXPENSE', category: 'NOMINA', amount: 100000.5, allocations: [] },
        { type: 'INCOME', category: 'SERVICIO', amount: 50000 },
        { type: 'EXPENSE', category: 'TAX', amount: { toNumber: () => 1000 }, allocations: [{ amount: { toNumber: () => 1000 }, category: 'FINANCIAL' }] }
    ];
    const distribution = accumulateCategoryDistribution(records, ['OPERATIVO', 'NOMINA', 'PRESTAMO', 'SERVICIO', 'TAX', 'FINANCIAL', 'SIEMBRA']);
    assert.equal(distribution.EXPENSE.OPERATIVO, 390000);
    assert.equal(distribution.EXPENSE.PRESTAMO, 210000);
    assert.equal(distribution.EXPENSE.NOMINA, 100000.5);
    assert.equal(distribution.EXPENSE.TAX, 0);
    assert.equal(distribution.EXPENSE.FINANCIAL, 1000);
    assert.equal(distribution.EXPENSE.SIEMBRA, 0);
    assert.equal(distribution.INCOME.SERVICIO, 50000);
    assert.equal(distribution.INCOME.OPERATIVO, 0);
    const expenseTotal = Object.values(distribution.EXPENSE).reduce((sum, value) => sum + value, 0);
    assert.equal(expenseTotal, 701000.5, 'a breakdown never creates or hides money');
});

test('startup creates the breakdown table additively and the API, schema, ledger and catalogs expose it', async () => {
    const { ensureFinancialAllocationsSchema } = await import('../scripts/ensure-financial-allocations-schema.js');
    const queries = [];
    await ensureFinancialAllocationsSchema({ query: async sql => { queries.push(sql); return { rows: [] }; } });
    assert.equal(queries[0], 'BEGIN');
    assert.equal(queries.at(-1), 'COMMIT');
    const ddl = queries.join('\n');
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS "FinancialRecordAllocation"/);
    assert.match(ddl, /"recordId" TEXT NOT NULL REFERENCES "FinancialRecord"\(id\) ON DELETE CASCADE/);
    assert.match(ddl, /category "FinancialCategory" NOT NULL/);
    assert.doesNotMatch(ddl, /\bDROP\b|\bDELETE FROM\b|\bUPDATE\b|\bTRUNCATE\b|ALTER TABLE "FinancialRecord"\s/);
    const pkg = JSON.parse(read('../package.json'));
    const start = pkg.scripts.start;
    assert.ok(start.indexOf('ensure-financial-categories-schema.js') < start.indexOf('ensure-financial-allocations-schema.js'), 'the enum exists before the table that references it');
    assert.ok(start.indexOf('ensure-financial-allocations-schema.js') < start.indexOf('node server.js'));

    const schema = read('../prisma/schema.prisma');
    assert.match(schema, /model FinancialRecordAllocation \{/);
    assert.match(schema.match(/model FinancialRecord \{([^}]+)\}/)[1], /allocations\s+FinancialRecordAllocation\[\]/);
    assert.match(read('../src/routes/api/financials.js'), /router\.put\('\/records\/:id\/allocations', requireFinancialWrite, replaceFinancialRecordAllocationsHandler\)/);
    assert.match(read('../src/components/modules/financial/FinancialLedger.jsx'), /Desglosar movimiento/);
    assert.match(read('../src/services/financialRecordService.js'), /allocations:/);
});
