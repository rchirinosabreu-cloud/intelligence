import test from 'node:test';
import assert from 'node:assert/strict';
import { closeFinancialPeriod, reopenFinancialPeriod } from '../src/services/financialPeriodService.js';

test('closeFinancialPeriod blocks a month with draft movements', async () => {
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialRecord: { count: async () => 2 },
            payrollTransaction: { count: async () => 0 }
        })
    };

    await assert.rejects(
        closeFinancialPeriod(prismaClient, { year: 2026, month: 8 }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_HAS_DRAFTS' && error.statusCode === 409
    );
});

test('closeFinancialPeriod blocks posted actual movements without a reconciled account', async () => {
    let call = 0;
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialRecord: { count: async () => (++call === 1 ? 0 : 3) },
            payrollTransaction: { count: async () => 0 }
        })
    };

    await assert.rejects(
        closeFinancialPeriod(prismaClient, { year: 2026, month: 8 }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_UNRECONCILED' && error.statusCode === 409
    );
});

test('closeFinancialPeriod blocks generated payroll that is not paid', async () => {
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialRecord: { count: async () => 0 },
            payrollTransaction: { count: async () => 2 }
        })
    };

    await assert.rejects(
        closeFinancialPeriod(prismaClient, { year: 2026, month: 8 }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_PAYROLL_PENDING' && error.statusCode === 409
    );
});

test('closeFinancialPeriod locks the month and creates an audit event atomically', async () => {
    const calls = [];
    const tx = {
        financialRecord: { count: async () => 0 },
        payrollTransaction: { count: async () => 0 },
        financialPeriod: {
            upsert: async (args) => {
                calls.push(['period.upsert', args]);
                return { id: 'period-1', year: 2026, month: 8, status: 'CLOSED' };
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

    const result = await closeFinancialPeriod(
        prismaClient,
        { year: 2026, month: 8, notes: 'Conciliado' },
        { id: 'user-1' }
    );

    assert.equal(result.status, 'CLOSED');
    const periodCall = calls.find(([name]) => name === 'period.upsert');
    assert.equal(periodCall[1].update.closedById, 'user-1');
    assert.equal(periodCall[1].update.notes, 'Conciliado');
    const auditCall = calls.find(([name]) => name === 'audit.create');
    assert.equal(auditCall[1].data.action, 'CLOSE');
});

test('reopenFinancialPeriod requires a reason', async () => {
    await assert.rejects(
        reopenFinancialPeriod({}, { year: 2026, month: 8, reason: '  ' }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_REOPEN_REASON_REQUIRED'
    );
});

test('reopenFinancialPeriod rejects an open or missing period', async () => {
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialPeriod: { findUnique: async () => null }
        })
    };

    await assert.rejects(
        reopenFinancialPeriod(prismaClient, { year: 2026, month: 8, reason: 'Correccion autorizada' }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_NOT_CLOSED' && error.statusCode === 409
    );
});

test('reopenFinancialPeriod opens the month and records the reason atomically', async () => {
    const calls = [];
    const closedPeriod = { id: 'period-1', year: 2026, month: 8, status: 'CLOSED', notes: 'Cierre inicial' };
    const tx = {
        financialPeriod: {
            findUnique: async () => closedPeriod,
            update: async (args) => {
                calls.push(['period.update', args]);
                return { ...closedPeriod, status: 'OPEN', closedAt: null, closedById: null };
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

    const result = await reopenFinancialPeriod(
        prismaClient,
        { year: 2026, month: 8, reason: 'Ajustar extracto bancario' },
        { id: 'admin-1' }
    );

    assert.equal(result.status, 'OPEN');
    const updateCall = calls.find(([name]) => name === 'period.update');
    assert.equal(updateCall[1].data.closedAt, null);
    assert.equal(updateCall[1].data.closedById, null);
    const auditCall = calls.find(([name]) => name === 'audit.create');
    assert.equal(auditCall[1].data.action, 'REOPEN');
    assert.equal(auditCall[1].data.after.reason, 'Ajustar extracto bancario');
    assert.equal(auditCall[1].data.actorId, 'admin-1');
});
