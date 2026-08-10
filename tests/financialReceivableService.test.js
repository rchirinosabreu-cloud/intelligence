import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivable, updateReceivable } from '../src/services/financialReceivableService.js';

const makeClient = (existing, calls) => ({
    $transaction: async (callback) => callback({
        financialPeriod: { findUnique: async () => null },
        accountsReceivable: {
            findUnique: async () => existing,
            update: async (args) => {
                calls.push(['receivable.update', args]);
                return { ...existing, ...args.data, client: { name: 'Jazmín', slug: 'jazmin' }, payments: existing.payments };
            }
        },
        financialAuditEvent: {
            create: async (args) => {
                calls.push(['audit.create', args]);
                return { id: 'audit-1' };
            }
        }
    })
});

test('updateReceivable derives paid status from traceable payments and writes an audit event', async () => {
    const calls = [];
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', comments: null, notes: null,
        metadata: { source: 'excel' }, payments: [{ amount: 400000 }, { amount: 600000 }]
    };

    const result = await updateReceivable(
        makeClient(existing, calls),
        'debt-1',
        { comments: 'Conciliado' },
        { id: 'user-1' }
    );

    assert.equal(result.status, 'PAGADO');
    assert.equal(calls[0][1].data.metadata.source, 'excel');
    assert.equal(calls[0][1].data.metadata.editedBy, 'user-1');
    assert.equal(calls[1][1].data.action, 'UPDATE');
});

test('updateReceivable rejects an amount below payments already registered', async () => {
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', metadata: {},
        payments: [{ amount: 700000 }]
    };

    await assert.rejects(
        updateReceivable(makeClient(existing, []), 'debt-1', { amount: 500000 }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_AMOUNT_BELOW_PAYMENTS' && error.statusCode === 409
    );
});

test('updateReceivable refuses a manual paid status while a balance remains', async () => {
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', metadata: {},
        payments: [{ amount: 400000 }]
    };

    await assert.rejects(
        updateReceivable(makeClient(existing, []), 'debt-1', { status: 'PAGADO' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_REQUIRED' && error.statusCode === 409
    );
});

test('createReceivable creates an open client balance with an audit event', async () => {
    const calls = [];
    const tx = {
        financialPeriod: { findUnique: async () => null },
        client: { findUnique: async () => ({ id: 'client-1', name: 'Pablo Hoff' }) },
        accountsReceivable: {
            create: async (args) => {
                calls.push(['receivable.create', args]);
                return { id: 'debt-1', ...args.data };
            }
        },
        financialAuditEvent: { create: async (args) => calls.push(['audit.create', args]) }
    };

    const result = await createReceivable({ $transaction: async (callback) => callback(tx) }, {
        clientId: 'client-1', amount: 1450000, period: '2026-08-01', dueDate: '2026-08-15',
        comments: 'Factura agosto'
    }, { id: 'user-1' });

    assert.equal(result.status, 'DEBE');
    assert.equal(calls[0][1].data.year, 2026);
    assert.equal(calls[0][1].data.month, 8);
    assert.equal(calls[0][1].data.origin, 'MANUAL');
    assert.equal(calls[1][1].data.action, 'CREATE');
});
