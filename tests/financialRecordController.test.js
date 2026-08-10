import test from 'node:test';
import assert from 'node:assert/strict';
import {
    closeFinancialPeriodHandler,
    createFinancialAccountHandler,
    createFinancialRecordHandler,
    generatePayrollPeriodHandler,
    createReceivableHandler,
    createReceivablePaymentHandler,
    listFinancialAccountsHandler,
    listFinancialRecordsHandler,
    payPayrollTransactionHandler,
    voidFinancialRecordHandler
} from '../src/controllers/financialRecordController.js';

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

test('createReceivablePaymentHandler confirms the payment only after the transaction succeeds', async () => {
    const res = makeResponse();
    await createReceivablePaymentHandler(
        { params: { id: 'debt-1' }, body: { amount: 500000 }, user: { id: 'user-1' } },
        res,
        { createPayment: async () => ({ payment: { id: 'payment-1' }, outstanding: 0 }) }
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.payment.id, 'payment-1');
    assert.equal(res.payload.outstanding, 0);
});

test('createReceivableHandler confirms a receivable only after persistence', async () => {
    const res = makeResponse();
    await createReceivableHandler(
        { body: { clientId: 'client-1', amount: 1000, period: '2026-08-01' }, user: { id: 'user-1' } },
        res,
        { createReceivableService: async () => ({ id: 'debt-1', status: 'DEBE' }) }
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.receivable.id, 'debt-1');
});

test('closeFinancialPeriodHandler returns the closed period from the service', async () => {
    const res = makeResponse();
    await closeFinancialPeriodHandler(
        { body: { year: 2026, month: 8 }, user: { id: 'user-1' } },
        res,
        { closePeriod: async () => ({ id: 'period-1', status: 'CLOSED' }) }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.period.status, 'CLOSED');
});

test('createFinancialRecordHandler only returns success after persistence succeeds', async () => {
    const res = makeResponse();
    await createFinancialRecordHandler(
        { body: { amount: 1000 }, user: { id: 'user-1' } },
        res,
        { createRecord: async () => ({ id: 'record-1' }) }
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.record.id, 'record-1');
});

test('financial record handlers expose domain errors without hiding the reason', async () => {
    const res = makeResponse();
    const error = Object.assign(new Error('El periodo esta cerrado.'), {
        code: 'FINANCIAL_PERIOD_CLOSED',
        statusCode: 409
    });

    await voidFinancialRecordHandler(
        { params: { id: 'record-1' }, body: { reason: 'Duplicado' }, user: { id: 'user-1' } },
        res,
        { voidRecord: async () => { throw error; } }
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.error, 'FINANCIAL_PERIOD_CLOSED');
    assert.equal(res.payload.message, 'El periodo esta cerrado.');
});

test('listFinancialRecordsHandler delegates query filters to the canonical ledger', async () => {
    const res = makeResponse();
    let filters;
    await listFinancialRecordsHandler(
        { query: { year: '2026', scenario: 'ACTUAL' } },
        res,
        {
            listRecords: async (_prisma, input) => {
                filters = input;
                return { items: [], total: 0, page: 1, pageSize: 50 };
            }
        }
    );

    assert.deepEqual(filters, { year: '2026', scenario: 'ACTUAL' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.total, 0);
});

test('financial account handlers expose balances and confirm persisted accounts', async () => {
    const listRes = makeResponse();
    await listFinancialAccountsHandler(
        { query: {} },
        listRes,
        { listAccounts: async () => [{ id: 'account-1', balance: 1500000 }] }
    );
    assert.equal(listRes.payload.accounts[0].balance, 1500000);

    const createRes = makeResponse();
    await createFinancialAccountHandler(
        { body: { name: 'Caja' }, user: { id: 'user-1' } },
        createRes,
        { createAccount: async () => ({ id: 'account-1', name: 'Caja' }) }
    );
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.payload.account.name, 'Caja');
});

test('payroll handlers confirm generated and paid transactions only after service success', async () => {
    const generateRes = makeResponse();
    await generatePayrollPeriodHandler(
        { body: { year: 2026, month: 8 }, user: { id: 'user-1' } },
        generateRes,
        { generatePeriod: async () => ({ transactions: [{ id: 'payroll-1' }] }) }
    );
    assert.equal(generateRes.statusCode, 201);
    assert.equal(generateRes.payload.transactions.length, 1);

    const payRes = makeResponse();
    await payPayrollTransactionHandler(
        { params: { id: 'payroll-1' }, body: { accountId: 'account-1' }, user: { id: 'user-1' } },
        payRes,
        { payTransaction: async () => ({ transaction: { id: 'payroll-1', status: 'PAID' } }) }
    );
    assert.equal(payRes.payload.transaction.status, 'PAID');
});
