import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';
import { updateReceivable } from '../src/services/financialReceivableService.js';
import { listFinancialRecords, voidFinancialRecord } from '../src/services/financialRecordService.js';

// Never fall back to DATABASE_URL or import the application's dotenv-backed singleton.
// CI explicitly provisions TEST_DATABASE_URL; absent/unsafe configuration skips this suite.
const testDatabaseUrl = getSafeTestDatabaseUrl();

// Synchronize real database reads so both transactions observe the same pre-write state.
// No persistence is mocked: PostgreSQL executes every SELECT/INSERT/UPDATE/ROLLBACK.
const synchronizeReads = (prisma, model) => {
    let arrivals = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    return {
        $transaction: (callback, options) => prisma.$transaction(async (tx) => {
            const delegate = tx[model];
            const synchronized = new Proxy(delegate, {
                get(target, property) {
                    if (property === 'findUnique') return async (args) => {
                        const result = await target.findUnique(args);
                        arrivals += 1;
                        if (arrivals === 2) release();
                        await gate;
                        return result;
                    };
                    const value = Reflect.get(target, property);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
            return callback(new Proxy(tx, {
                get(target, property) {
                    return property === model ? synchronized : Reflect.get(target, property);
                }
            }));
        }, { ...options, maxWait: 10000, timeout: 10000 })
    };
};

test('PostgreSQL financial collections preserve identity, balances and linked entries', {
    skip: !testDatabaseUrl,
    timeout: 60000
}, async (t) => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const suffix = randomUUID();
    let client;
    let actor;
    let account;
    const date = '2198-01-15';
    const period = new Date('2198-01-01T12:00:00Z');

    t.after(async () => {
        try {
            // Exact fixture ownership; never delete unrelated test-suite or user data.
            if (client) {
                await prisma.receivablePayment.deleteMany({ where: { receivable: { clientId: client.id } } });
                await prisma.financialRecord.deleteMany({ where: { clientId: client.id } });
                await prisma.accountsReceivable.deleteMany({ where: { clientId: client.id } });
                await prisma.client.delete({ where: { id: client.id } });
            }
            if (account) await prisma.financialAccount.delete({ where: { id: account.id } });
            if (actor) {
                await prisma.financialAuditEvent.deleteMany({ where: { actorId: actor.id } });
                await prisma.user.delete({ where: { id: actor.id } });
            }
        } finally {
            await prisma.$disconnect();
        }
    });

    client = await prisma.client.create({ data: { name: 'Financial integration fixture', slug: `financial-payments-it-${suffix}` } });
    actor = await prisma.user.create({ data: { name: 'Financial test actor', email: `financial-${suffix}@example.invalid`, password: 'integration-test-only', role: 'ADMIN' } });
    account = await prisma.financialAccount.create({ data: { name: `Financial test account ${suffix}`, type: 'BANK', currency: 'COP', openingBalance: 0, openingBalanceDate: period } });

    const createDebt = (amount = 1000) => prisma.accountsReceivable.create({
        data: { clientId: client.id, amount, period, year: 2198, month: 1, status: 'DEBE', origin: 'MANUAL' }
    });
    const paymentInput = (overrides = {}) => ({ amount: 300, accountId: account.id, category: 'SERVICIO', paidAt: date, requestId: randomUUID(), ...overrides });
    const createdIncomes = (receivableId) => prisma.financialRecord.count({
        where: { clientId: client.id, createdById: actor.id, metadata: { path: ['receivableId'], equals: receivableId } }
    });

    await t.test('two concurrent requests with the same id create one payment, one income, then replay', async () => {
        const debt = await createDebt();
        const payload = paymentInput();
        const synchronized = synchronizeReads(prisma, 'receivablePayment');
        const results = await Promise.allSettled([
            createReceivablePayment(synchronized, debt.id, payload, actor),
            createReceivablePayment(synchronized, debt.id, payload, actor)
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.find((result) => result.status === 'rejected')?.reason.code, 'RECEIVABLE_PAYMENT_CONFLICT');
        assert.equal(await prisma.receivablePayment.count({ where: { receivableId: debt.id } }), 1);
        assert.equal(await createdIncomes(debt.id), 1);
        const replay = await createReceivablePayment(prisma, debt.id, payload, actor);
        assert.equal(replay.replayed, true);
        assert.equal(replay.outstanding, 700);
        assert.equal(await createdIncomes(debt.id), 1);
    });

    await t.test('two distinct concurrent payments cannot overcollect the same balance', async () => {
        const debt = await createDebt();
        const synchronized = synchronizeReads(prisma, 'accountsReceivable');
        const results = await Promise.allSettled([
            createReceivablePayment(synchronized, debt.id, paymentInput({ amount: 700 }), actor),
            createReceivablePayment(synchronized, debt.id, paymentInput({ amount: 700 }), actor)
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.find((result) => result.status === 'rejected')?.reason.code, 'RECEIVABLE_PAYMENT_CONFLICT');
        const payments = await prisma.receivablePayment.findMany({ where: { receivableId: debt.id } });
        assert.equal(payments.reduce((sum, payment) => sum + Number(payment.amount), 0), 700);
        assert.equal(await createdIncomes(debt.id), 1, 'the failed transaction must roll back its income too');
    });

    await t.test('a concurrent reduction cannot leave registered payments above the debt amount', async () => {
        const debt = await createDebt();
        const synchronized = synchronizeReads(prisma, 'accountsReceivable');
        const results = await Promise.allSettled([
            createReceivablePayment(synchronized, debt.id, paymentInput({ amount: 700 }), actor),
            updateReceivable(synchronized, debt.id, { amount: 100 }, actor)
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.ok(['RECEIVABLE_CONFLICT', 'RECEIVABLE_PAYMENT_CONFLICT'].includes(results.find((result) => result.status === 'rejected')?.reason.code));
        const stored = await prisma.accountsReceivable.findUnique({ where: { id: debt.id }, include: { payments: true } });
        const paid = stored.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        assert.ok(paid <= Number(stored.amount));
    });

    await t.test('applying an existing income creates no second income and generic void cannot disconnect it', async () => {
        const debt = await createDebt();
        const income = await prisma.financialRecord.create({ data: {
            clientId: client.id, accountId: account.id, createdById: actor.id,
            amount: 300, category: 'SERVICIO', type: 'INCOME', section: 'REVENUE', origin: 'MANUAL',
            scenario: 'ACTUAL', status: 'POSTED', isProjection: false, date: new Date('2198-01-15T00:00:00Z'), year: 2198, month: 1
        } });
        const before = await prisma.financialRecord.count({ where: { clientId: client.id } });
        const candidates = await listFinancialRecords(prisma, { clientId: client.id, availableForReceivable: true });
        assert.ok(candidates.items.some((item) => item.id === income.id));
        const result = await createReceivablePayment(prisma, debt.id, paymentInput({ financialRecordId: income.id }), actor);
        assert.equal(result.payment.financialRecordId, income.id);
        assert.equal(result.outstanding, 700);
        assert.equal(await prisma.financialRecord.count({ where: { clientId: client.id } }), before);
        assert.deepEqual(await prisma.financialRecord.findUnique({ where: { id: income.id } }), income);
        await assert.rejects(voidFinancialRecord(prisma, income.id, 'Must not unlink payment', actor), (error) => error.code === 'FINANCIAL_RECORD_LINKED');
        assert.equal((await prisma.financialRecord.findUnique({ where: { id: income.id } })).status, 'POSTED');
        const after = await listFinancialRecords(prisma, { clientId: client.id, availableForReceivable: true });
        assert.equal(after.items.some((item) => item.id === income.id), false);
    });
});
