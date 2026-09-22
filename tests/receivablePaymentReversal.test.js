import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseReceivablePayment } from '../src/services/receivablePaymentService.js';

// Contrato de la reversión de abonos (21 de septiembre de 2026).
// El abono se conserva como evidencia, deja de descontar saldo y el ingreso se trata
// según su origen: el que creó el propio flujo se anula, el preexistente se desvincula.

const buildTx = ({ payment, receivablePayments = [], receivableAmount = 1000, receivableStatus = 'DEBE', period = { status: 'OPEN' } }) => {
    const calls = [];
    const receivable = {
        id: 'debt-1',
        clientId: 'client-1',
        amount: receivableAmount,
        status: receivableStatus,
        payments: receivablePayments.filter((row) => !row.reversedAt)
    };
    return {
        calls,
        tx: {
            receivablePayment: {
                findUnique: async (args) => {
                    calls.push(['payment.findUnique', args]);
                    return payment ? { ...payment, receivable } : null;
                },
                update: async (args) => {
                    calls.push(['payment.update', args]);
                    return { ...payment, ...args.data };
                }
            },
            financialPeriod: { findUnique: async () => period },
            financialRecord: {
                update: async (args) => {
                    calls.push(['record.update', args]);
                    return { ...payment.financialRecord, ...args.data };
                }
            },
            accountsReceivable: {
                update: async (args) => {
                    calls.push(['receivable.update', args]);
                    return { ...receivable, status: args.data.status };
                }
            },
            financialAuditEvent: {
                create: async (args) => {
                    calls.push(['audit.create', args]);
                    return { id: 'audit-1' };
                }
            }
        }
    };
};

const systemPayment = () => ({
    id: 'payment-1',
    receivableId: 'debt-1',
    amount: 300,
    paidAt: new Date('2026-09-10T12:00:00Z'),
    reversedAt: null,
    financialRecordId: 'record-1',
    financialRecord: { id: 'record-1', origin: 'SYSTEM', status: 'POSTED', year: 2026, month: 9, amount: 300 }
});

test('reverseReceivablePayment voids the income it generated and restores the balance', async () => {
    const { calls, tx } = buildTx({
        payment: systemPayment(),
        receivablePayments: [{ id: 'payment-1', amount: 300, reversedAt: null }],
        receivableAmount: 1000,
        receivableStatus: 'DEBE'
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'El valor se digitó mal' }, { id: 'user-1' });

    assert.equal(result.outstanding, 1000);
    assert.equal(result.receivable.status, 'DEBE');
    const recordUpdate = calls.find(([name]) => name === 'record.update');
    assert.equal(recordUpdate[1].data.status, 'VOIDED');
    assert.match(recordUpdate[1].data.voidReason, /El valor se digitó mal/);
    const paymentUpdate = calls.find(([name]) => name === 'payment.update');
    assert.ok(paymentUpdate[1].data.reversedAt instanceof Date);
    assert.equal(paymentUpdate[1].data.reversalReason, 'El valor se digitó mal');
    assert.equal(paymentUpdate[1].data.reversedById, 'user-1');
    // El vínculo se suelta en la fila, pero queda en la evidencia del evento.
    assert.equal(paymentUpdate[1].data.financialRecordId, null);
    const audit = calls.filter(([name]) => name === 'audit.create').find(([, args]) => args.data.entityType === 'ReceivablePayment');
    assert.equal(audit[1].data.action, 'VOID');
    assert.equal(audit[1].data.before.financialRecordId, 'record-1');
    assert.equal(audit[1].data.after.voidedFinancialRecordId, 'record-1');
});

test('reverseReceivablePayment keeps a pre-existing income and only unlinks it', async () => {
    const payment = systemPayment();
    payment.financialRecord = { id: 'record-1', origin: 'MANUAL', status: 'POSTED', year: 2026, month: 9, amount: 300 };
    const { calls, tx } = buildTx({
        payment,
        receivablePayments: [{ id: 'payment-1', amount: 300, reversedAt: null }]
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Se aplicó al cliente equivocado' }, { id: 'user-1' });

    assert.equal(calls.some(([name]) => name === 'record.update'), false);
    assert.equal(result.voidedRecord, null);
    assert.equal(result.unlinkedRecordId, 'record-1');
    const audit = calls.filter(([name]) => name === 'audit.create').find(([, args]) => args.data.entityType === 'ReceivablePayment');
    assert.equal(audit[1].data.after.voidedFinancialRecordId, null);
    assert.equal(audit[1].data.after.unlinkedFinancialRecordId, 'record-1');
});

test('reverseReceivablePayment reopens a debt that had been fully collected', async () => {
    const { calls, tx } = buildTx({
        payment: systemPayment(),
        receivablePayments: [{ id: 'payment-1', amount: 300, reversedAt: null }],
        receivableAmount: 300,
        receivableStatus: 'PAGADO'
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Pago duplicado' }, { id: 'user-1' });

    assert.equal(result.outstanding, 300);
    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.status, 'DEBE');
});

test('reverseReceivablePayment keeps the other payments applied', async () => {
    const { tx } = buildTx({
        payment: systemPayment(),
        receivablePayments: [
            { id: 'payment-1', amount: 300, reversedAt: null },
            { id: 'payment-2', amount: 200, reversedAt: null },
            { id: 'payment-3', amount: 150, reversedAt: new Date('2026-09-01T12:00:00Z') }
        ],
        receivableAmount: 1000
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Error de digitación' }, { id: 'user-1' });

    // 1000 - 200 del abono vigente. Ni el revertido ahora ni el revertido antes descuentan.
    assert.equal(result.outstanding, 800);
});

test('reverseReceivablePayment requires a reason', async () => {
    await assert.rejects(
        reverseReceivablePayment({}, 'payment-1', { reason: '   ' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_REVERSAL_REASON_REQUIRED' && error.statusCode === 400
    );
});

test('reverseReceivablePayment rejects a reason longer than the limit', async () => {
    await assert.rejects(
        reverseReceivablePayment({}, 'payment-1', { reason: 'x'.repeat(301) }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_REVERSAL_REASON_TOO_LONG'
    );
});

test('reverseReceivablePayment refuses to revert the same payment twice', async () => {
    const payment = systemPayment();
    payment.reversedAt = new Date('2026-09-15T12:00:00Z');
    const { tx } = buildTx({ payment });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Otra vez' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_ALREADY_REVERSED' && error.statusCode === 409
    );
});

test('reverseReceivablePayment refuses to touch a closed period', async () => {
    const { tx } = buildTx({
        payment: systemPayment(),
        receivablePayments: [{ id: 'payment-1', amount: 300, reversedAt: null }],
        period: { status: 'CLOSED' }
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Mes cerrado' }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_CLOSED'
    );
});

test('reverseReceivablePayment reports a missing payment instead of inventing one', async () => {
    const { tx } = buildTx({ payment: null });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        reverseReceivablePayment(prismaClient, 'payment-404', { reason: 'No existe' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_NOT_FOUND' && error.statusCode === 404
    );
});

test('reverseReceivablePayment refuses when the remaining payments exceed the debt', async () => {
    const { tx } = buildTx({
        payment: systemPayment(),
        receivablePayments: [
            { id: 'payment-1', amount: 300, reversedAt: null },
            { id: 'payment-2', amount: 1200, reversedAt: null }
        ],
        receivableAmount: 1000
    });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        reverseReceivablePayment(prismaClient, 'payment-1', { reason: 'Historial inconsistente' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_BALANCE_INVALID' && error.statusCode === 409
    );
});
