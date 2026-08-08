import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialReceivablesLedger,
    updateFinancialReceivable
} from '../src/controllers/financialController.js';

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
                assert.deepEqual(args.where, { year: 2026, importBatchId: 'batch-1' });
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
        period: '2026-01-01T00:00:00.000Z',
        month: 1,
        year: 2026,
        dueDate: null,
        status: 'DEBE',
        notes: 'Jazmin',
        comments: 'Pago pendiente',
        sourceLabel: 'Jazmin'
    }]);
    assert.equal(res.payload.totals.DEBE, 4680000);
});

test('updateFinancialReceivable edits amount, status and comments for a debt row', async () => {
    const calls = [];
    const prismaClient = {
        accountsReceivable: {
            update: async (args) => {
                calls.push(args);
                return {
                    id: 'debt-1',
                    amount: 0,
                    status: 'PAGADO',
                    comments: 'Pagado por transferencia',
                    metadata: args.data.metadata,
                    client: { name: 'Jazmin', slug: 'jazmin' }
                };
            }
        }
    };
    const res = makeResponse();

    await updateFinancialReceivable({
        params: { id: 'debt-1' },
        body: {
            amount: 0,
            status: 'PAGADO',
            comments: 'Pagado por transferencia'
        },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].where.id, 'debt-1');
    assert.equal(calls[0].data.amount, 0);
    assert.equal(calls[0].data.status, 'PAGADO');
    assert.equal(calls[0].data.comments, 'Pagado por transferencia');
    assert.equal(calls[0].data.metadata.editedBy, 'user-1');
    assert.equal(res.payload.receivable.status, 'PAGADO');
});
