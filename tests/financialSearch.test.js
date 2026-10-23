import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinancialDashboard, getFinancialReceivablesLedger, getFinancialPayrollLedger, getFinancialClientReconciliation } from '../src/controllers/financialController.js';
import { listFinancialRecords } from '../src/services/financialRecordService.js';

// Persistence double: exercises the actual query builders and aggregators, not PostgreSQL.
function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
        if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(item => matches(row, item));
        if (key === 'OR') return value.some(item => matches(row, item));
        if (value === null || typeof value !== 'object' || value instanceof Date) return row?.[key] === value;
        const actual = row?.[key];
        if ('is' in value) return actual != null && matches(actual, value.is);
        if ('contains' in value) return String(actual || '').toLowerCase().includes(value.contains.toLowerCase());
        if ('in' in value) return value.in.includes(actual);
        if ('not' in value) return actual !== value.not;
        if ('gte' in value || 'lte' in value || 'lt' in value) return (!('gte' in value) || actual >= value.gte) && (!('lte' in value) || actual <= value.lte) && (!('lt' in value) || actual < value.lt);
        return actual != null && matches(actual, value);
    });
}
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
function fixture() {
    const calls = [];
    const base = { year: 2026, month: 9, date: new Date('2026-09-01T12:00:00Z'), createdAt: new Date('2026-09-01T12:00:00Z'), scenario: 'ACTUAL', status: 'POSTED', importBatchId: null, category: 'SERVICIO' };
    const records = Array.from({ length: 31 }, (_, i) => ({ ...base, id: `rodny-${String(i).padStart(2, '0')}`, amount: 100.25, type: 'INCOME', clientId: 'rodny', client: { id: 'rodny', name: 'Rodny Chirinos' }, description: `Servicio ${i}` }));
    records.push(
        { ...base, id: 'payroll', amount: 50.75, type: 'EXPENSE', payrollTransaction: { contract: { collaborator: { displayName: 'Rodny Chirinos' } } } },
        { ...base, id: 'import', amount: 10, type: 'INCOME', importBatchId: 'active', sourceLabel: 'Rodny', clientId: 'rodny', client: { id: 'rodny', name: 'Rodny' } },
        { ...base, id: 'actor-only', amount: 999, type: 'INCOME', createdBy: { name: 'Rodny' }, client: { name: 'Otro cliente' } },
        { ...base, id: 'void', amount: 9000, type: 'INCOME', status: 'VOIDED', counterparty: 'Rodny' },
        { ...base, id: 'draft', amount: 9000, type: 'INCOME', status: 'DRAFT', counterparty: 'Rodny' },
        { ...base, id: 'other-month', amount: 9000, type: 'INCOME', month: 8, counterparty: 'Rodny' },
        { ...base, id: 'brain', amount: 400, type: 'EXPENSE', description: 'Suscripción Brain Studio' }
    );
    const debts = [{ ...base, id: 'debt', status: 'PROMESADO', clientId: 'rodny', client: { name: 'Rodny Chirinos' }, amount: 1000, payments: [{ amount: 200 }] }, { ...base, id: 'other-debt', status: 'DEBE', clientId: 'other', client: { name: 'Otra persona' }, amount: 9000, payments: [] }];
    const contracts = [{ id: 'contract', importBatchId: null, sourceLabel: 'Rodny', baseSalary: 100, socialSecurity: 0, transactions: [] }, { id: 'other', importBatchId: null, sourceLabel: 'Otra persona', transactions: [] }];
    function model(name, rows) { return {
        findMany: async args => { calls.push({ name, args }); const found = rows.filter(row => matches(row, args.where)); return found.slice(args.skip || 0, args.take ? (args.skip || 0) + args.take : undefined); },
        count: async args => rows.filter(row => matches(row, args.where)).length
    }; }
    return { calls, prismaClient: { financialRecord: model('records', records), accountsReceivable: model('debts', debts), payrollTransaction: model('payroll', []), payrollContract: model('contracts', contracts), client: model('clients', []) } };
}
const filters = { year: '2026', scenario: 'ACTUAL', month: '9', q: '  RoDnY  ', scope: 'active', status: 'POSTED' };

test('global financial search uses every matching posted record for KPIs, beyond the first page', async () => {
    const { prismaClient } = fixture(), res = response();
    await getFinancialDashboard({ query: filters }, res, { prismaClient });
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.sourceSummary.totals.income, 3117.75);
    assert.equal(res.data.sourceSummary.totals.expense, 50.75);
    assert.equal(res.data.sourceSummary.totals.netFlow, 3067);
    assert.equal(res.data.sourceSummary.totals.receivable, 800);
    const page = await listFinancialRecords(prismaClient, { ...filters, page: 2, pageSize: 25 });
    assert.equal(page.total, 33);
    assert.equal(page.items.length, 8);
    assert.deepEqual(page.items.map(r => r.id), ['rodny-25', 'rodny-26', 'rodny-27', 'rodny-28', 'rodny-29', 'rodny-30', 'payroll', 'import']);
});

test('type and month filter both dashboard and ledger; no match produces zero totals', async () => {
    for (const [q, type, expected] of [['brain', 'EXPENSE', 400], ['no existe', 'EXPENSE', 0], ['rodny', 'EXPENSE', 50.75]]) {
        const { prismaClient } = fixture(), res = response();
        await getFinancialDashboard({ query: { ...filters, q, type } }, res, { prismaClient });
        assert.equal(res.statusCode, 200);
        assert.equal(res.data.sourceSummary.totals.income, 0);
        assert.equal(res.data.sourceSummary.totals.expense, expected);
        const page = await listFinancialRecords(prismaClient, { ...filters, q, type });
        assert.equal(page.items.reduce((sum, r) => sum + r.amount, 0), expected);
    }
});

test('search also filters receivables, payroll contracts, and client reconciliation', async () => {
    for (const handler of [getFinancialReceivablesLedger, getFinancialPayrollLedger, getFinancialClientReconciliation]) {
        const { prismaClient } = fixture(), res = response();
        await handler({ query: filters }, res, { prismaClient });
        assert.equal(res.statusCode, 200);
        const items = res.data.items || res.data.clients;
        assert.equal(items.length, 1);
    }
});

test('ledger pagination has a unique tie breaker', async () => {
    const { prismaClient, calls } = fixture();
    await listFinancialRecords(prismaClient, filters);
    const query = calls.find(c => c.name === 'records').args;
    assert.deepEqual(query.orderBy, [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
});

test('multiword search matches the related person and invalid input is an explicit client error', async () => {
    const { prismaClient } = fixture(), res = response();
    await getFinancialDashboard({ query: { ...filters, q: 'Rodny Chirinos' } }, res, { prismaClient });
    assert.equal(res.data.sourceSummary.totals.income, 3107.75);
    assert.equal(res.data.sourceSummary.totals.expense, 50.75);
    const invalid = response();
    await getFinancialDashboard({ query: { ...filters, q: 'x'.repeat(201) } }, invalid, { prismaClient });
    assert.equal(invalid.statusCode, 400);
});
