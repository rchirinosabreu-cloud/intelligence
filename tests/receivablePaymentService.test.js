import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';

test('createReceivablePayment supports partial payments and leaves the debt open', async () => {
    const calls = [];
    const receivable = {
        id: 'debt-1',
        amount: 1000000,
        status: 'DEBE',
        payments: [{ amount: 200000 }]
    };
    const tx = {
        accountsReceivable: {
            findUnique: async () => receivable,
            update: async (args) => {
                calls.push(['receivable.update', args]);
                return { ...receivable, status: args.data.status };
            }
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialRecord: {
            create: async (args) => {
                calls.push(['record.create', args]);
                return { id: 'record-1', ...args.data };
            }
        },
        receivablePayment: {
            create: async (args) => {
                calls.push(['payment.create', args]);
                return { id: 'payment-1', ...args.data };
            }
        },
        financialAuditEvent: {
            create: async (args) => {
                calls.push(['audit.create', args]);
                return { id: 'audit-1' };
            }
        }
    };
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await createReceivablePayment(prismaClient, 'debt-1', {
        amount: 300000,
        paidAt: '2026-08-10',
        accountId: 'account-1',
        reference: 'TRX-01'
    }, { id: 'user-1' });

    assert.equal(result.outstanding, 500000);
    assert.equal(result.receivable.status, 'DEBE');
    assert.equal(calls.find(([name]) => name === 'payment.create')[1].data.createdById, 'user-1');
    assert.equal(calls.find(([name]) => name === 'payment.create')[1].data.financialRecordId, 'record-1');
    assert.equal(calls.find(([name]) => name === 'record.create')[1].data.accountId, 'account-1');
});

test('createReceivablePayment marks a fully collected debt as paid', async () => {
    const tx = {
        accountsReceivable: {
            findUnique: async () => ({ id: 'debt-1', amount: 500000, status: 'DEBE', payments: [] }),
            update: async (args) => ({ id: 'debt-1', amount: 500000, status: args.data.status })
        },
        financialPeriod: { findUnique: async () => null },
        financialRecord: { create: async (args) => ({ id: 'record-1', ...args.data }) },
        receivablePayment: { create: async (args) => ({ id: 'payment-1', ...args.data }) },
        financialAuditEvent: { create: async () => ({ id: 'audit-1' }) }
    };
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await createReceivablePayment(prismaClient, 'debt-1', {
        amount: 500000,
        paidAt: '2026-08-10',
        accountId: 'account-1'
    }, { id: 'user-1' });

    assert.equal(result.outstanding, 0);
    assert.equal(result.receivable.status, 'PAGADO');
});

test('createReceivablePayment requires the destination cash or bank account', async () => {
    await assert.rejects(
        createReceivablePayment({}, 'debt-1', { amount: 100000, paidAt: '2026-08-10' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_ACCOUNT_REQUIRED'
    );
});

test('createReceivablePayment rejects overpayments', async () => {
    const prismaClient = {
        $transaction: async (callback) => callback({
            accountsReceivable: {
                findUnique: async () => ({ id: 'debt-1', amount: 500000, status: 'DEBE', payments: [{ amount: 450000 }] })
            }
        })
    };

    await assert.rejects(
        createReceivablePayment(prismaClient, 'debt-1', {
            amount: 100000,
            paidAt: '2026-08-10',
            accountId: 'account-1'
        }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_OVERPAYMENT' && error.statusCode === 409
    );
});
