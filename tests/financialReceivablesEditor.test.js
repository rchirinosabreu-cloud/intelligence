import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFinancialReceivablesLedger,
    updateFinancialReceivable
} from '../src/controllers/financialController.js';
import fs from 'node:fs';

const dashboardSource = fs.readFileSync(
    new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url),
    'utf8'
);

test('receivables UI records traceable partial payments instead of zeroing debt amounts', () => {
    assert.match(dashboardSource, /post\(`\$\{baseUrl\}\/api\/financials\/receivables`/);
    assert.match(dashboardSource, /Nueva cuenta por cobrar/);
    assert.match(dashboardSource, /\/receivables\/\$\{paymentDebt\.id\}\/payments/);
    assert.match(dashboardSource, /Registrar pago/);
    assert.match(dashboardSource, /Saldo pendiente/);
    assert.match(dashboardSource, /<ReceivablePaymentDialog/);
    const paymentSource = fs.readFileSync(new URL('../src/components/modules/financial/ReceivablePaymentDialog.jsx', import.meta.url), 'utf8');
    assert.match(paymentSource, /form\.accountId/);
});

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
                assert.deepEqual(args.where, {
                    year: 2026,
                    OR: [
                        { importBatchId: 'batch-1' },
                        { importBatchId: null }
                    ]
                });
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
                    payments: [{
                        id: 'payment-1',
                        amount: 680000,
                        paidAt: new Date(Date.UTC(2026, 6, 10)),
                        reference: 'TRX-01',
                        notes: null,
                        account: { id: 'account-1', name: 'Bancolombia' }
                    }],
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
        clientId: null,
        clientName: 'Jazmin',
        clientSlug: 'jazmin',
        amount: 4680000,
        paidAmount: 680000,
        outstanding: 4000000,
        period: '2026-01-01T00:00:00.000Z',
        month: 1,
        year: 2026,
        dueDate: null,
        status: 'DEBE',
        notes: 'Jazmin',
        comments: 'Pago pendiente',
        sourceLabel: 'Jazmin',
        // Documento: esta obligación vino del Excel y todavía no se ha emitido.
        number: null,
        formattedNumber: null,
        issuedAt: null,
        concept: null,
        servicePeriod: null,
        items: [],
        payments: [{
            id: 'payment-1',
            amount: 680000,
            paidAt: '2026-07-10T00:00:00.000Z',
            reference: 'TRX-01',
            notes: null,
            account: { id: 'account-1', name: 'Bancolombia' },
            reversedAt: null,
            reversalReason: null
        }]
    }]);
    assert.equal(res.payload.totals.DEBE, 4000000);
    assert.equal(res.payload.totals.originalTotal, 4680000);
    assert.equal(res.payload.totals.paidTotal, 680000);
    assert.equal(res.payload.totals.outstandingTotal, 4000000);
});

// La cartera trae el documento para que la pantalla sepa si ofrece «Emitir cuenta de
// cobro» o muestra su número (Elisa, reunión del 21 de septiembre de 2026).
test('una obligación ya emitida llega con su número, su periodo y sus conceptos', async () => {
    const prismaClient = {
        financialImportBatch: { findFirst: async () => null },
        accountsReceivable: {
            findMany: async (args) => {
                assert.ok(args.include.items, 'sin los conceptos la pantalla no puede mostrar el documento');
                return [{
                    id: 'debt-1', amount: 1200000, period: new Date(Date.UTC(2026, 8, 1)), year: 2026, month: 9,
                    dueDate: null, status: 'DEBE', notes: null, comments: null, sourceLabel: 'Titanes', payments: [],
                    number: 393, issuedAt: new Date(Date.UTC(2026, 8, 22)),
                    concept: 'Prestación de servicios…', servicePeriod: '20 de agosto al 19 de septiembre',
                    items: [
                        { id: 'item-1', description: 'Fee mensual', amount: 800000 },
                        { id: 'item-2', description: 'Inversión de pauta en Meta Ads', amount: 400000 }
                    ],
                    client: { name: 'Titanes', slug: 'titanes' }
                }];
            }
        }
    };
    const res = makeResponse();

    await getFinancialReceivablesLedger({ query: { year: 2026 } }, res, { prismaClient });

    const [item] = res.payload.items;
    assert.equal(item.number, 393);
    assert.equal(item.formattedNumber, 'No. 0393');
    assert.equal(item.servicePeriod, '20 de agosto al 19 de septiembre');
    assert.deepEqual(item.items.map((line) => line.description), ['Fee mensual', 'Inversión de pauta en Meta Ads']);
    assert.equal(item.items.reduce((sum, line) => sum + line.amount, 0), item.amount, 'los conceptos suman el total de la obligación');
});

// Un abono revertido sigue visible en la cartera como evidencia, pero no descuenta saldo.
test('getFinancialReceivablesLedger shows a reversed payment without letting it reduce the debt', async () => {
    const prismaClient = {
        financialImportBatch: { findFirst: async () => null },
        accountsReceivable: {
            findMany: async () => [{
                id: 'debt-1',
                amount: 1000000,
                period: new Date(Date.UTC(2026, 8, 1)),
                year: 2026,
                month: 9,
                dueDate: null,
                status: 'DEBE',
                notes: null,
                comments: null,
                sourceLabel: 'Elvira Utria',
                payments: [
                    { id: 'payment-1', amount: 400000, paidAt: new Date(Date.UTC(2026, 8, 10)), reference: null, notes: null, account: null, reversedAt: null, reversalReason: null },
                    { id: 'payment-2', amount: 500, paidAt: new Date(Date.UTC(2026, 8, 12)), reference: null, notes: null, account: null, reversedAt: new Date(Date.UTC(2026, 8, 13)), reversalReason: 'Se digitaron 500 en vez de 500.000' }
                ],
                client: { name: 'Elvira Utria', slug: 'elvira-utria' }
            }]
        }
    };
    const res = makeResponse();

    await getFinancialReceivablesLedger({ query: { year: 2026 } }, res, { prismaClient });

    const [item] = res.payload.items;
    assert.equal(item.paidAmount, 400000);
    assert.equal(item.outstanding, 600000);
    assert.equal(item.payments.length, 2);
    assert.equal(item.payments.find((payment) => payment.id === 'payment-2').reversalReason, 'Se digitaron 500 en vez de 500.000');
    assert.equal(res.payload.totals.paidTotal, 400000);
    assert.equal(res.payload.totals.outstandingTotal, 600000);
});

test('updateFinancialReceivable delegates traceable edits to the receivable service', async () => {
    const calls = [];
    const updateReceivableService = async (prismaClient, id, body, user) => {
        calls.push({ prismaClient, id, body, user });
        return {
            id: 'debt-1', amount: 4680000, status: 'DEBE', comments: 'Pago pendiente',
            client: { name: 'Jazmin', slug: 'jazmin' }, payments: []
        };
    };
    const prismaClient = {};
    const res = makeResponse();

    await updateFinancialReceivable({
        params: { id: 'debt-1' },
        body: {
            comments: 'Pago pendiente'
        },
        user: { id: 'user-1' }
    }, res, { prismaClient, updateReceivableService });

    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].id, 'debt-1');
    assert.equal(calls[0].body.comments, 'Pago pendiente');
    assert.equal(calls[0].user.id, 'user-1');
    assert.equal(res.payload.receivable.status, 'DEBE');
});
