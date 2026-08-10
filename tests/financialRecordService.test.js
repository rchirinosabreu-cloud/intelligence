import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createFinancialRecord,
    listFinancialRecords,
    normalizeFinancialRecordInput,
    updateFinancialRecord,
    voidFinancialRecord
} from '../src/services/financialRecordService.js';

test('normalizeFinancialRecordInput derives the accounting period and defaults to an actual posted entry', () => {
    const result = normalizeFinancialRecordInput({
        amount: '1250000',
        type: 'INCOME',
        category: 'MEMBRESIA',
        date: '2026-08-10',
        accountId: 'account-1',
        description: 'Mensualidad agosto'
    });

    assert.equal(result.amount, 1250000);
    assert.equal(result.year, 2026);
    assert.equal(result.month, 8);
    assert.equal(result.scenario, 'ACTUAL');
    assert.equal(result.status, 'POSTED');
    assert.equal(result.origin, 'MANUAL');
    assert.equal(result.date.toISOString(), '2026-08-10T12:00:00.000Z');
});

test('normalizeFinancialRecordInput rejects zero or negative amounts', () => {
    assert.throws(
        () => normalizeFinancialRecordInput({
            amount: 0,
            type: 'EXPENSE',
            category: 'OPERATIVO',
            date: '2026-08-10'
        }),
        (error) => error.code === 'FINANCIAL_RECORD_AMOUNT_INVALID' && error.statusCode === 400
    );
});

test('normalizeFinancialRecordInput requires a cash or bank account for posted actual movements', () => {
    assert.throws(
        () => normalizeFinancialRecordInput({
            amount: 50000,
            type: 'EXPENSE',
            category: 'OPERATIVO',
            date: '2026-08-10'
        }),
        (error) => error.code === 'FINANCIAL_RECORD_ACCOUNT_REQUIRED'
    );

    const forecast = normalizeFinancialRecordInput({
        amount: 50000,
        type: 'EXPENSE',
        category: 'OPERATIVO',
        date: '2026-09-10',
        scenario: 'FORECAST'
    });
    assert.equal(forecast.accountId, null);
});

test('createFinancialRecord persists a canonical entry and its audit event atomically', async () => {
    const calls = [];
    const created = { id: 'record-1', amount: 1250000, year: 2026, month: 8 };
    const tx = {
        financialPeriod: {
            findUnique: async (args) => {
                calls.push(['period.findUnique', args]);
                return { status: 'OPEN' };
            }
        },
        financialRecord: {
            create: async (args) => {
                calls.push(['record.create', args]);
                return created;
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

    const result = await createFinancialRecord(prismaClient, {
        amount: 1250000,
        type: 'INCOME',
        category: 'MEMBRESIA',
        date: '2026-08-10',
        accountId: 'account-1',
        description: 'Mensualidad agosto',
        clientId: 'client-1'
    }, { id: 'user-1' });

    assert.equal(result, created);
    assert.deepEqual(calls[0], ['period.findUnique', {
        where: { year_month: { year: 2026, month: 8 } },
        select: { status: true }
    }]);
    const createCall = calls.find(([name]) => name === 'record.create');
    assert.equal(createCall[1].data.createdById, 'user-1');
    assert.equal(createCall[1].data.scenario, 'ACTUAL');
    assert.equal(createCall[1].data.status, 'POSTED');
    const auditCall = calls.find(([name]) => name === 'audit.create');
    assert.equal(auditCall[1].data.action, 'CREATE');
    assert.equal(auditCall[1].data.entityId, 'record-1');
});

test('createFinancialRecord refuses to modify a closed accounting period', async () => {
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialPeriod: {
                findUnique: async () => ({ status: 'CLOSED' })
            }
        })
    };

    await assert.rejects(
        createFinancialRecord(prismaClient, {
            amount: 50000,
            type: 'EXPENSE',
            category: 'OPERATIVO',
            date: '2026-07-02',
            accountId: 'account-1'
        }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_CLOSED' && error.statusCode === 409
    );
});

test('voidFinancialRecord keeps the entry and records why it was voided', async () => {
    const calls = [];
    const existing = {
        id: 'record-1',
        year: 2026,
        month: 8,
        status: 'POSTED',
        accountId: 'account-1',
        amount: 90000
    };
    const tx = {
        financialRecord: {
            findUnique: async () => existing,
            update: async (args) => {
                calls.push(['record.update', args]);
                return { ...existing, ...args.data };
            }
        },
        financialPeriod: {
            findUnique: async () => ({ status: 'OPEN' })
        },
        financialAuditEvent: {
            create: async (args) => {
                calls.push(['audit.create', args]);
                return { id: 'audit-1' };
            }
        }
    };
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await voidFinancialRecord(
        prismaClient,
        'record-1',
        'Registro duplicado',
        { id: 'user-1' }
    );

    assert.equal(result.status, 'VOIDED');
    assert.equal(result.voidReason, 'Registro duplicado');
    assert.ok(result.voidedAt instanceof Date);
    const auditCall = calls.find(([name]) => name === 'audit.create');
    assert.equal(auditCall[1].data.action, 'VOID');
    assert.equal(auditCall[1].data.actorId, 'user-1');
});

test('listFinancialRecords filters the canonical ledger without depending on an import batch', async () => {
    let receivedArgs;
    const prismaClient = {
        financialRecord: {
            findMany: async (args) => {
                receivedArgs = args;
                return [{ id: 'record-1', amount: 1000, client: null, account: null }];
            },
            count: async () => 1
        }
    };

    const result = await listFinancialRecords(prismaClient, {
        year: '2026',
        month: '8',
        scenario: 'ACTUAL',
        type: 'INCOME'
    });

    assert.deepEqual(receivedArgs.where, {
        year: 2026,
        month: 8,
        scenario: 'ACTUAL',
        type: 'INCOME',
        status: { not: 'VOIDED' }
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.total, 1);
});

test('updateFinancialRecord recalculates the period and writes an audit event', async () => {
    const calls = [];
    const existing = {
        id: 'record-1',
        amount: 100000,
        type: 'EXPENSE',
        category: 'OPERATIVO',
        section: 'OPERATING_EXPENSE',
        date: new Date('2026-08-01T12:00:00.000Z'),
        year: 2026,
        month: 8,
        scenario: 'ACTUAL',
        status: 'POSTED',
        accountId: 'account-1',
        description: 'Transporte'
    };
    const tx = {
        financialRecord: {
            findUnique: async () => existing,
            update: async (args) => {
                calls.push(['record.update', args]);
                return { ...existing, ...args.data };
            }
        },
        financialPeriod: {
            findUnique: async () => ({ status: 'OPEN' })
        },
        financialAuditEvent: {
            create: async (args) => {
                calls.push(['audit.create', args]);
                return { id: 'audit-1' };
            }
        }
    };
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await updateFinancialRecord(
        prismaClient,
        'record-1',
        { amount: 120000, date: '2026-08-02' },
        { id: 'user-1' }
    );

    assert.equal(result.amount, 120000);
    assert.equal(result.date.toISOString(), '2026-08-02T12:00:00.000Z');
    const auditCall = calls.find(([name]) => name === 'audit.create');
    assert.equal(auditCall[1].data.action, 'UPDATE');
});
