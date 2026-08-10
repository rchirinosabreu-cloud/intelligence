import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialReceivablesLedger,
    updateFinancialReceivable
} from '../src/controllers/financialController.js';
import fs from 'node:fs';

const dashboardSource = fs.readFileSync(
    new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url),
    'utf8'
);

test('receivables UI records traceable partial payments instead of zeroing debt amounts', () => {
    assert.match(dashboardSource, /post\(`\$\{baseUrl\}\/api\/financials\/receivables`/);
    assert.match(dashboardSource, /Nueva cuenta por cobrar/);
    assert.match(dashboardSource, /\/receivables\/\$\{paymentDebt\.id\}\/payments/);
    assert.match(dashboardSource, /Registrar pago/);
    assert.match(dashboardSource, /Saldo pendiente/);
    assert.match(dashboardSource, /paymentForm\.accountId/);
});

const makeResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

test('getFinancialReceivablesLedger returns editable receivable rows from the active import batch', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        accountsReceivable: {
            findMany: async (args) => {
                assert.deepEqual(args.where, {
                    year: 2026,
                    OR: [
                        { importBatchId: 'batch-1' },
                        { importBatchId: null, origin: 'MANUAL' }
                    ]
                });
                return [{
                    id: 'debt-1',
                    amount: 4680000,
                    period: new Date(Date.UTC(2026, 0, 1)),
                    year: 2026,
                    month: 1,
                    dueDate: null,
                    status: 'DEBE',
                    notes: 'Jazmin',
                    comments: 'Pago pendiente',
                    sourceLabel: 'Jazmin',
                    payments: [{
                        id: 'payment-1',
                        amount: 680000,
                        paidAt: new Date(Date.UTC(2026, 6, 10)),
                        reference: 'TRX-01',
                        notes: null,
                        account: { id: 'account-1', name: 'Bancolombia' }
                    }],
                    client: { name: 'Jazmin', slug: 'jazmin' }
                }];
            }
        }
    };
    const res = makeResponse();

    await getFinancialReceivablesLedger({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.importBatchId, 'batch-1');
    assert.deepEqual(res.payload.items, [{
        id: 'debt-1',
        clientName: 'Jazmin',
        clientSlug: 'jazmin',
        amount: 4680000,
        paidAmount: 680000,
        outstanding: 4000000,
        period: '2026-01-01T00:00:00.000Z',
        month: 1,
        year: 2026,
        dueDate: null,
        status: 'DEBE',
        notes: 'Jazmin',
        comments: 'Pago pendiente',
        sourceLabel: 'Jazmin',
        payments: [{
            id: 'payment-1',
            amount: 680000,
            paidAt: '2026-07-10T00:00:00.000Z',
            reference: 'TRX-01',
            notes: null,
            account: { id: 'account-1', name: 'Bancolombia' }
        }]
    }]);
    assert.equal(res.payload.totals.DEBE, 4000000);
    assert.equal(res.payload.totals.originalTotal, 4680000);
    assert.equal(res.payload.totals.paidTotal, 680000);
    assert.equal(res.payload.totals.outstandingTotal, 4000000);
});

test('updateFinancialReceivable delegates traceable edits to the receivable service', async () => {
    const calls = [];
    const updateReceivableService = async (prismaClient, id, body, user) => {
        calls.push({ prismaClient, id, body, user });
        return {
            id: 'debt-1', amount: 4680000, status: 'DEBE', comments: 'Pago pendiente',
            client: { name: 'Jazmin', slug: 'jazmin' }, payments: []
        };
    };
    const prismaClient = {};
    const res = makeResponse();

    await updateFinancialReceivable({
        params: { id: 'debt-1' },
        body: {
            comments: 'Pago pendiente'
        },
        user: { id: 'user-1' }
    }, res, { prismaClient, updateReceivableService });

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].id, 'debt-1');
    assert.equal(calls[0].body.comments, 'Pago pendiente');
    assert.equal(calls[0].user.id, 'user-1');
    assert.equal(res.payload.receivable.status, 'DEBE');
});
