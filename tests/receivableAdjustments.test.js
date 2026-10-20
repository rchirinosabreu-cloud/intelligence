import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';
import { listReceivableAdjustments } from '../src/services/receivableSettlementService.js';
import { adjustmentsRange, summarizeAdjustments } from '../src/lib/receivableAdjustments.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

// Rodny, 20 de octubre de 2026: «el resumen de ajustes de cartera en Financiero». Y el caso de
// Foobspain: «iba a registrar un ingreso a la tasa de conversión del día y no me dejó, así que
// registré el máximo permitido». Una cuenta en dólares guarda en cartera los pesos calculados
// con la TRM del día en que se creó; el depósito real llega con la tasa del día, y la cartera
// se ajusta a lo que entró, sin pedirle a nadie que vaya primero al lápiz.

test('el rango del periodo: todo el año, o un mes', () => {
    assert.deepEqual(adjustmentsRange({ year: 2026 }), { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2027, 0, 1)) });
    assert.deepEqual(adjustmentsRange({ year: 2026, month: 10 }), { from: new Date(Date.UTC(2026, 9, 1)), to: new Date(Date.UTC(2026, 10, 1)) });
    assert.deepEqual(adjustmentsRange({ year: 2026, month: 12 }), { from: new Date(Date.UTC(2026, 11, 1)), to: new Date(Date.UTC(2027, 0, 1)) });
    assert.deepEqual(adjustmentsRange({ year: 2026, month: '13' }), adjustmentsRange({ year: 2026 }), 'un mes inválido es todo el año');
});

test('el resumen suma por forma de cierre y la diferencia en cambio aparte', () => {
    const summary = summarizeAdjustments({
        settlements: [
            { kind: 'ACUERDO', amount: 1500000 }, { kind: 'ACUERDO', amount: 500000 },
            { kind: 'CANJE', amount: 3200000 }, { kind: 'CONDONACION', amount: 200000 }
        ],
        exchangeAdjustments: [{ fromCents: 120000000, toCents: 125000000 }, { fromCents: 100000000, toCents: 98000000 }]
    });
    assert.deepEqual(summary.byKind, {
        ACUERDO: { total: 2000000, count: 2 }, CANJE: { total: 3200000, count: 1 }, COMPENSACION: { total: 0, count: 0 }, CONDONACION: { total: 200000, count: 1 }
    });
    assert.equal(summary.settledTotal, 5400000);
    assert.deepEqual(summary.exchange, { up: 50000, down: 20000, net: 30000, count: 2 });
});

const settlementRow = (overrides = {}) => ({
    id: 's1', kind: 'ACUERDO', amount: 1500000, paidAt: new Date('2026-10-20T12:00:00Z'), notes: 'Negocio cerrado', detail: { authorizedBy: 'Francisco Villa' }, reversedAt: null,
    receivable: { id: 'debt-1', kind: 'CLIENTE', currency: 'COP', amount: 3500000, counterpartyName: null, sourceLabel: 'Salsipuedes', client: { id: 'c1', name: 'Salsipuedes', slug: 'salsipuedes' } },
    ...overrides
});

test('listReceivableAdjustments lee los cierres vigentes del periodo y los ajustes por tasa', async () => {
    const calls = [];
    const prismaClient = {
        receivablePayment: {
            findMany: async (args) => { calls.push(['payment.findMany', args]); return [settlementRow(), settlementRow({ id: 's2', kind: 'CANJE', amount: 3200000, detail: { authorizedBy: 'Francisco Villa', goods: 'Muebles' }, receivable: { id: 'debt-2', kind: 'CLIENTE', currency: 'COP', amount: 3200000, client: { id: 'c2', name: 'Nuva', slug: 'nuva' } } })]; }
        },
        accountsReceivable: {
            findMany: async (args) => {
                calls.push(['receivable.findMany', args]);
                return [{ id: 'debt-usd', currency: 'USD', foreignAmount: 300, client: { id: 'c3', name: 'Foobspain', slug: 'foobspain' }, metadata: { exchangeAdjustments: [
                    { at: '2026-10-19T15:00:00.000Z', paymentId: 'p-usd', fromCents: 120000000, toCents: 125000000 },
                    { at: '2025-12-01T15:00:00.000Z', paymentId: 'p-old', fromCents: 100000000, toCents: 90000000 }
                ] } }];
            }
        }
    };
    const result = await listReceivableAdjustments(prismaClient, { year: 2026, month: 10 });
    const where = calls.find(([name]) => name === 'payment.findMany')[1].where;
    assert.deepEqual(where.kind, { in: ['ACUERDO', 'CANJE', 'COMPENSACION', 'CONDONACION'] });
    assert.equal(where.reversedAt, null, 'un cierre revertido no cuenta');
    assert.deepEqual(where.paidAt, { gte: new Date(Date.UTC(2026, 9, 1)), lt: new Date(Date.UTC(2026, 10, 1)) });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].clientName, 'Salsipuedes');
    assert.equal(result.items[0].kindLabel, 'Acuerdo por menor valor');
    assert.equal(result.items[0].authorizedBy, 'Francisco Villa');
    assert.equal(result.items[0].originalAmount, 3500000);
    assert.equal(result.items[1].goods, 'Muebles');
    assert.equal(result.summary.byKind.ACUERDO.total, 1500000);
    assert.equal(result.summary.byKind.CANJE.total, 3200000);
    assert.equal(result.exchangeAdjustments.length, 1, 'solo el ajuste del periodo');
    assert.equal(result.exchangeAdjustments[0].clientName, 'Foobspain');
    assert.equal(result.exchangeAdjustments[0].difference, 50000);
    assert.equal(result.summary.exchange.up, 50000);
});

const usdTx = ({ receivable }) => {
    const calls = [];
    return {
        calls,
        tx: {
            client: { findUnique: async () => ({ id: 'client-1' }) },
            financialAccount: { findUnique: async () => ({ id: 'account-1', isActive: true, currency: 'COP' }) },
            accountsReceivable: {
                findUnique: async () => receivable,
                update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, ...args.data }; }
            },
            financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
            financialRecord: { create: async (args) => { calls.push(['record.create', args]); return { id: 'record-1', ...args.data }; } },
            receivablePayment: { create: async (args) => { calls.push(['payment.create', args]); return { id: 'payment-1', ...args.data }; } },
            financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
        }
    };
};

test('Foobspain: en dólares, si entró más que el valor en pesos de la cartera, la cartera se ajusta a lo que entró', async () => {
    const receivable = { id: 'debt-usd', clientId: 'client-1', currency: 'USD', foreignAmount: 300, exchangeRate: 4000, amount: 1200000, status: 'DEBE', payments: [], metadata: { createdBy: 'u' } };
    const { calls, tx } = usdTx({ receivable });
    const result = await createReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'debt-usd', {
        amount: 1250000, category: 'MEMBRESIA', paidAt: '2026-10-19', accountId: 'account-1'
    }, { id: 'user-elisa' });

    assert.equal(result.outstanding, 0);
    assert.equal(result.receivable.status, 'PAGADO');
    assert.deepEqual(result.exchangeAdjustment, { fromCents: 120000000, toCents: 125000000, difference: 50000 });
    const update = calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(update.amount, 1250000, 'la cartera en pesos pasa a lo que entró');
    assert.equal(update.metadata.createdBy, 'u', 'el metadata anterior se conserva');
    assert.equal(update.metadata.exchangeAdjustments.length, 1);
    assert.equal(update.metadata.exchangeAdjustments[0].paymentId, 'payment-1');
    assert.equal(update.metadata.exchangeAdjustments[0].toCents, 125000000);
    const record = calls.find(([name]) => name === 'record.create')[1].data;
    assert.equal(record.amount, 1250000, 'el ingreso es lo que de verdad entró');
    const audits = calls.filter(([name]) => name === 'audit.create').map(([, args]) => args.data);
    const adjustment = audits.find((audit) => audit.after?.operation === 'EXCHANGE_ADJUSTMENT');
    assert.ok(adjustment, 'el ajuste por tasa queda en la bitácora');
    assert.equal(adjustment.entityType, 'AccountsReceivable');
    assert.equal(adjustment.action, 'UPDATE');
});

test('en dólares, si entró menos y la cuenta queda al día, la cartera baja a lo que entró solo si quien registra lo dice', async () => {
    const receivable = { id: 'debt-usd', clientId: 'client-1', currency: 'USD', foreignAmount: 300, amount: 1200000, status: 'DEBE', payments: [], metadata: null };
    const asked = usdTx({ receivable });
    const result = await createReceivablePayment({ $transaction: async (cb) => cb(asked.tx) }, 'debt-usd', {
        amount: 1150000, category: 'MEMBRESIA', paidAt: '2026-10-19', accountId: 'account-1', settlesInFull: true
    }, { id: 'u' });
    assert.equal(result.outstanding, 0);
    assert.equal(result.receivable.status, 'PAGADO');
    assert.deepEqual(result.exchangeAdjustment, { fromCents: 120000000, toCents: 115000000, difference: -50000 });
    assert.equal(asked.calls.find(([name]) => name === 'receivable.update')[1].data.amount, 1150000);

    // Sin decirlo, un pago menor es un abono parcial, como siempre.
    const partial = usdTx({ receivable });
    const kept = await createReceivablePayment({ $transaction: async (cb) => cb(partial.tx) }, 'debt-usd', {
        amount: 1150000, category: 'MEMBRESIA', paidAt: '2026-10-19', accountId: 'account-1'
    }, { id: 'u' });
    assert.equal(kept.outstanding, 50000);
    assert.equal(kept.exchangeAdjustment, null);
    assert.equal(partial.calls.find(([name]) => name === 'receivable.update')[1].data.amount, undefined);
});

test('en pesos, pagar de más sigue siendo un error: ahí no hay tasa que lo explique', async () => {
    const receivable = { id: 'debt-cop', clientId: 'client-1', currency: 'COP', amount: 1000000, status: 'DEBE', payments: [] };
    const { tx } = usdTx({ receivable });
    await assert.rejects(createReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'debt-cop', { amount: 1000001, category: 'MEMBRESIA', paidAt: '2026-10-19', accountId: 'account-1' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_OVERPAYMENT');
    await assert.rejects(createReceivablePayment({ $transaction: async (cb) => cb(usdTx({ receivable }).tx) }, 'debt-cop', { amount: 900000, category: 'MEMBRESIA', paidAt: '2026-10-19', accountId: 'account-1', settlesInFull: true }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_SETTLES_IN_FULL_UNSUPPORTED', 'en pesos «queda al día» con menos dinero es un acuerdo, no un pago');
});

test('la ruta, el catálogo y la pantalla conocen el resumen y el ajuste por tasa', () => {
    assert.match(read('../src/routes/api/financials.js'), /'\/receivable-adjustments', requireFinancialAccess/);
    assert.match(read('../src/lib/platformCatalog.js'), /'GET \/financials\/receivable-adjustments'/);
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    const summary = read('../src/components/modules/financial/ReceivableAdjustmentsSummary.jsx');
    const payment = read('../src/components/modules/financial/ReceivablePaymentDialog.jsx');
    assert.match(dashboard, /ReceivableAdjustmentsSummary/);
    assert.match(dashboard, /data-receivable-exchange-adjustment/, 'la tarjeta dice que la cartera se ajustó por la tasa');
    assert.match(summary, /receivable-adjustments/);
    assert.match(summary, /Ajustes de cartera/);
    assert.match(summary, /Diferencia en cambio/);
    assert.doesNotMatch(payment, /max=\{debt\?\.outstanding\}/, 'en dólares el campo no tiene tope: la cartera se ajusta a lo que entró');
    assert.match(payment, /settlesInFull/);
    assert.match(payment, /queda al día/i);
});
