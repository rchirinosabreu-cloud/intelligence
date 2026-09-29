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

// Rows the link moves: it reads them, merges the trace into what each row already carried and
// writes them one by one. A blanket updateMany would erase monthName/createdBy/editedBy.
const makeLinkClient = ({ clients, records = [], receivables = [] }) => {
    const calls = [];
    const prismaClient = {
        $transaction: async (fn) => fn({
            client: { findMany: async (args) => { calls.push(['clients', args]); return clients; } },
            financialRecord: {
                findMany: async (args) => { calls.push(['financialRecord.findMany', args]); return records; },
                update: async (args) => { calls.push(['financialRecord.update', args]); return args; }
            },
            accountsReceivable: {
                findMany: async (args) => { calls.push(['accountsReceivable.findMany', args]); return receivables; },
                update: async (args) => { calls.push(['accountsReceivable.update', args]); return args; }
            },
            financialAuditEvent: { create: async (args) => { calls.push(['audit', args.data]); return args.data; } }
        })
    };
    return { calls, prismaClient };
};

test('getFinancialClientReconciliation groups platform and imported source clients by income and debts', async () => {
    const prismaClient = {
        financialImportBatch: {
            findFirst: async () => ({ id: 'batch-2026' })
        },
        financialRecord: {
            findMany: async () => [
                {
                    id: 'rec-1', type: 'INCOME', amount: 100, sourceLabel: 'Pablo hoff', clientId: 'client-1',
                    client: { id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff' }
                },
                { id: 'rec-2', type: 'INCOME', amount: 200, sourceLabel: 'Pablo hoff', clientId: null, client: null },
                { id: 'rec-3', type: 'EXPENSE', amount: 999, sourceLabel: 'Nomina', clientId: null, client: null }
            ]
        },
        accountsReceivable: {
            findMany: async () => [
                { id: 'debt-1', amount: 50, status: 'DEBE', clientId: 'client-1', client: { id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff' }, payments: [] }
            ]
        },
        client: {
            findMany: async () => [{ id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff', isArchived: false }]
        }
    };
    const res = makeResponse();

    await getFinancialClientReconciliation({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    const names = res.payload.clients.map((row) => row.client.name);
    assert.ok(names.includes('Pablo Hoff'));
    const platform = res.payload.clients.find((row) => row.clientId === 'client-1');
    assert.equal(platform.income, 100);
    assert.equal(platform.receivable, 50);
    const unlinked = res.payload.clients.find((row) => row.sourceId === 'source-label:Pablo hoff');
    assert.equal(unlinked.income, 200);
});

test('getFinancialClientReconciliation ignores expense rows when computing client income', async () => {
    const prismaClient = {
        financialImportBatch: { findFirst: async () => ({ id: 'batch-2026' }) },
        financialRecord: {
            findMany: async () => [
                { id: 'rec-1', type: 'EXPENSE', amount: 100, sourceLabel: 'Nomina', clientId: null, client: null }
            ]
        },
        accountsReceivable: { findMany: async () => [] },
        client: { findMany: async () => [] }
    };
    const res = makeResponse();

    await getFinancialClientReconciliation({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.clients, []);
});

test('getFinancialClientReconciliation counts platform entries recorded after the import', async () => {
    const prismaClient = {
        financialImportBatch: { findFirst: async () => ({ id: 'batch-2026' }) },
        financialRecord: {
            findMany: async () => [
                { id: 'rec-1', type: 'INCOME', amount: 100, sourceLabel: 'Pablo hoff', clientId: 'client-1', importBatchId: 'batch-2026', client: { id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff' } },
                { id: 'rec-2', type: 'INCOME', amount: 300, sourceLabel: null, clientId: 'client-1', importBatchId: null, origin: 'SYSTEM', client: { id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff' } }
            ]
        },
        accountsReceivable: { findMany: async () => [] },
        client: { findMany: async () => [{ id: 'client-1', name: 'Pablo Hoff', slug: 'pablo-hoff', isArchived: false }] }
    };
    const res = makeResponse();

    await getFinancialClientReconciliation({ query: { year: 2026 } }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.clients.map((row) => row.client.name), ['Pablo Hoff']);
});

test('linkFinancialClient moves imported financial records and debts to the selected platform client, keeping what each row already knew', async () => {
    const { calls, prismaClient } = makeLinkClient({
        clients: [{ id: 'source-client', name: 'Titanes' }, { id: 'target-client', name: 'Corporación Titanes' }],
        records: [{ id: 'rec-1', metadata: { monthName: 'Agosto', createdBy: 'elisa' } }, { id: 'rec-2', metadata: null }],
        receivables: [{ id: 'debt-1', metadata: { editedBy: 'elisa' } }]
    });
    const res = makeResponse();

    await linkFinancialClient({
        params: { sourceClientId: 'source-client' },
        body: { targetClientId: 'target-client' },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls.find(([name]) => name === 'financialRecord.findMany')[1].where, { clientId: 'source-client' });
    const recordUpdates = calls.filter(([name]) => name === 'financialRecord.update').map(([, args]) => args);
    assert.equal(recordUpdates.length, 2);
    assert.equal(recordUpdates[0].data.clientId, 'target-client');
    // The trace is added on top of what the row already carried; nothing is erased.
    assert.equal(recordUpdates[0].data.metadata.monthName, 'Agosto');
    assert.equal(recordUpdates[0].data.metadata.createdBy, 'elisa');
    assert.equal(recordUpdates[0].data.metadata.reconciledToClientId, 'target-client');
    assert.equal(recordUpdates[0].data.metadata.reconciledFromClientId, 'source-client');
    assert.equal(recordUpdates[1].data.metadata.reconciledBy, 'user-1');
    const debtUpdates = calls.filter(([name]) => name === 'accountsReceivable.update').map(([, args]) => args);
    assert.equal(debtUpdates.length, 1);
    assert.equal(debtUpdates[0].data.clientId, 'target-client');
    assert.equal(debtUpdates[0].data.metadata.editedBy, 'elisa');
    assert.equal(res.payload.moved.financialRecords, 2);
    assert.equal(res.payload.moved.receivables, 1);
    // Linking is a financial fact: it leaves an audit event naming both clients and what moved.
    const audit = calls.find(([name]) => name === 'audit')[1];
    assert.equal(audit.entityType, 'Client');
    assert.equal(audit.entityId, 'target-client');
    assert.equal(audit.actorId, 'user-1');
    assert.deepEqual(audit.after.moved, { financialRecords: 2, receivables: 1 });
    assert.equal(audit.before.sourceClientId, 'source-client');
});

test('linkFinancialClient can assign unlinked imported source-label records to a platform client', async () => {
    const { calls, prismaClient } = makeLinkClient({
        clients: [{ id: 'target-client', name: 'Pablo Hoff' }],
        records: [{ id: 'a', metadata: null }, { id: 'b', metadata: null }, { id: 'c', metadata: null }]
    });
    const res = makeResponse();

    await linkFinancialClient({
        params: { sourceClientId: 'source-label:Pablo hoff' },
        body: { targetClientId: 'target-client' },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls.find(([name]) => name === 'financialRecord.findMany')[1].where, { clientId: null, sourceLabel: 'Pablo hoff', type: 'INCOME' });
    assert.equal(calls.filter(([name]) => name === 'financialRecord.update').length, 3);
    assert.equal(calls.some(([name]) => name === 'accountsReceivable.findMany'), false, 'a label has no debts of its own');
    assert.equal(res.payload.moved.financialRecords, 3);
    assert.equal(res.payload.moved.receivables, 0);
});

test('linkFinancialClient only assigns unlinked income rows for source-label matches, and reads the label as Express already decoded it', async () => {
    const { calls, prismaClient } = makeLinkClient({
        clients: [{ id: 'target-client', name: 'Pablo Hoff' }],
        records: [{ id: 'a', metadata: null }]
    });
    const res = makeResponse();

    await linkFinancialClient({
        params: { sourceClientId: 'source-label:Francisco Villa 100%' },
        body: { targetClientId: 'target-client' },
        user: { id: 'user-1' }
    }, res, { prismaClient });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls.find(([name]) => name === 'financialRecord.findMany')[1].where, {
        clientId: null,
        sourceLabel: 'Francisco Villa 100%',
        type: 'INCOME'
    });
});

test('linkFinancialClient refuses the same client on both sides and a client that does not exist', async () => {
    const same = makeResponse();
    await linkFinancialClient({ params: { sourceClientId: 'x' }, body: { targetClientId: 'x' }, user: { id: 'u' } }, same, { prismaClient: makeLinkClient({ clients: [] }).prismaClient });
    assert.equal(same.statusCode, 400);
    const missing = makeResponse();
    await linkFinancialClient({ params: { sourceClientId: 'x' }, body: { targetClientId: 'y' }, user: { id: 'u' } }, missing, { prismaClient: makeLinkClient({ clients: [{ id: 'x', name: 'Solo uno' }] }).prismaClient });
    assert.equal(missing.statusCode, 404);
});
