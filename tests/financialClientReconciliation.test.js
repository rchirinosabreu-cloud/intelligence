import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialClientReconciliation,
    linkFinancialClient
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

test('getFinancialClientReconciliation aggregates imported income and receivables by client', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        financialRecord: {
            findMany: async (args) => {
                assert.deepEqual(args.where, {
                    year: 2026,
                    importBatchId: 'batch-1'
                });
                return [{
                    id: 'record-1',
                    clientId: 'client-imported',
                    amount: 1450000,
                    type: 'INCOME',
                    client: { id: 'client-imported', name: 'Pablo hoff', slug: 'pablo-hoff' }
                }];
            }
        },
        accountsReceivable: {
            findMany: async () => [{
                id: 'debt-1',
                clientId: 'client-imported',
                amount: 1050000,
                status: 'DEBE',
                client: { id: 'client-imported', name: 'Pablo hoff', slug: 'pablo-hoff' }
            }]
        },
        client: {
            findMany: async () => [
                { id: 'client-imported', name: 'Pablo hoff', slug: 'pablo-hoff' },
                { id: 'client-real', name: 'Pablo Hoff', slug: 'pablo-hoff-real' }
            ]
        }
    };
    const res = makeResponse();

    await getFinancialClientReconciliation({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.importBatchId, 'batch-1');
    assert.equal(res.payload.clients[0].sourceId, 'client-imported');
    assert.equal(res.payload.clients[0].clientId, 'client-imported');
    assert.equal(res.payload.clients[0].income, 1450000);
    assert.equal(res.payload.clients[0].receivable, 1050000);
    assert.equal(res.payload.clients[0].recordCount, 1);
    assert.equal(res.payload.clients[0].receivableCount, 1);
    assert.equal(res.payload.targets.length, 2);
});

test('getFinancialClientReconciliation exposes unlinked imported income rows by source label', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-1', year: 2026 })
        },
        financialRecord: {
            findMany: async () => [{
                id: 'record-1',
                clientId: null,
                amount: 1450000,
                type: 'INCOME',
                sourceLabel: 'Pablo hoff',
                client: null
            }]
        },
        accountsReceivable: {
            findMany: async () => []
        },
        client: {
            findMany: async () => [
                { id: 'client-real', name: 'Pablo Hoff', slug: 'pablo-hoff-real' }
            ]
        }
    };
    const res = makeResponse();

    await getFinancialClientReconciliation({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.clients[0].sourceId, 'source-label:Pablo hoff');
    assert.equal(res.payload.clients[0].clientId, null);
    assert.equal(res.payload.clients[0].client.name, 'Pablo hoff');
    assert.equal(res.payload.clients[0].income, 1450000);
});

test('linkFinancialClient moves imported financial records and debts to the selected platform client', async () => {
    const calls = [];
    const prismaClient = {
        $transaction: async (fn) => fn({
            client: {
                findMany: async (args) => {
                    calls.push(['clients', args]);
                    return [
                        { id: 'source-client', name: 'Pablo hoff' },
                        { id: 'target-client', name: 'Pablo Hoff' }
                    ];
                }
            },
            financialRecord: {
                updateMany: async (args) => {
                    calls.push(['financialRecord.updateMany', args]);
                    return { count: 4 };
                }
            },
            accountsReceivable: {
                updateMany: async (args) => {
                    calls.push(['accountsReceivable.updateMany', args]);
                    return { count: 2 };
                }
            }
        })
    };
    const res = makeResponse();

    await linkFinancialClient({
        params: { sourceClientId: 'source-client' },
        body: { targetClientId: 'target-client' },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls[1][1].where, { clientId: 'source-client' });
    assert.equal(calls[1][1].data.clientId, 'target-client');
    assert.equal(calls[2][1].data.clientId, 'target-client');
    assert.equal(res.payload.moved.financialRecords, 4);
    assert.equal(res.payload.moved.receivables, 2);
});

test('linkFinancialClient can assign unlinked imported source-label records to a platform client', async () => {
    const calls = [];
    const prismaClient = {
        $transaction: async (fn) => fn({
            client: {
                findMany: async (args) => {
                    calls.push(['clients', args]);
                    return [{ id: 'target-client', name: 'Pablo Hoff' }];
                }
            },
            financialRecord: {
                updateMany: async (args) => {
                    calls.push(['financialRecord.updateMany', args]);
                    return { count: 3 };
                }
            },
            accountsReceivable: {
                updateMany: async (args) => {
                    calls.push(['accountsReceivable.updateMany', args]);
                    return { count: 0 };
                }
            }
        })
    };
    const res = makeResponse();

    await linkFinancialClient({
        params: { sourceClientId: 'source-label:Pablo hoff' },
        body: { targetClientId: 'target-client' },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls[1][1].where, { clientId: null, sourceLabel: 'Pablo hoff' });
    assert.equal(calls[1][1].data.clientId, 'target-client');
    assert.equal(res.payload.moved.financialRecords, 3);
});
