import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updateReceivablePayment } from '../src/services/receivablePaymentService.js';

// Rodny, 20 de octubre de 2026, al ver Foobspain con un abono por el «máximo permitido»: «debe
// tener la opción de editar lo que ingresó o el valor registrado para no revertirlo». Un abono se
// corrige con motivo, y su ingreso se corrige con él en la misma transacción: nunca quedan
// desacoplados. Lo que no se puede corregir aquí se dice y se manda a donde sí.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const build = ({ payment, receivable, period = { status: 'OPEN' }, account = { id: 'acc-2', isActive: true, currency: 'COP' } } = {}) => {
    const calls = [];
    const row = { ...payment, receivable };
    return {
        calls,
        tx: {
            receivablePayment: {
                findUnique: async () => row,
                update: async (args) => { calls.push(['payment.update', args]); return { ...payment, ...args.data }; }
            },
            financialPeriod: { findUnique: async () => period },
            financialAccount: { findUnique: async () => account },
            financialRecord: { update: async (args) => { calls.push(['record.update', args]); return { ...payment.financialRecord, ...args.data }; } },
            accountsReceivable: { update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, ...args.data }; } },
            financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
        }
    };
};
const systemRecord = (overrides = {}) => ({ id: 'rec-1', origin: 'SYSTEM', status: 'POSTED', amount: 1136000, date: new Date('2026-09-29T12:00:00Z'), year: 2026, month: 9, accountId: 'acc-1', reference: '0345', notes: 'nota', bankMatches: [], ...overrides });
const foobspain = (overrides = {}) => ({ id: 'debt-foob', clientId: 'c1', currency: 'USD', foreignAmount: 360, amount: 1205856, status: 'DEBE', metadata: {}, payments: [{ id: 'pay-1', amount: 1136000, kind: 'PAGO', reversedAt: null }], ...overrides });
const payment = (overrides = {}) => ({ id: 'pay-1', receivableId: 'debt-foob', kind: 'PAGO', amount: 1136000, paidAt: new Date('2026-09-29T12:00:00Z'), accountId: 'acc-1', reference: '0345', notes: 'nota', financialRecordId: 'rec-1', reversedAt: null, financialRecord: systemRecord(), ...overrides });

test('Foobspain: el abono se corrige al valor del comprobante y el ingreso cambia con él', async () => {
    const { calls, tx } = build({ payment: payment(), receivable: foobspain() });
    const result = await updateReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'pay-1', {
        amount: 1205856, reason: 'Se registró por el máximo permitido; el depósito real fue 1.205.856.'
    }, { id: 'user-elisa' });

    assert.equal(result.outstanding, 0);
    assert.equal(result.receivable.status, 'PAGADO');
    assert.equal(result.exchangeAdjustment, null, 'cabía en el valor de la cartera: no hay ajuste por tasa');
    const paymentUpdate = calls.find(([name]) => name === 'payment.update')[1].data;
    assert.equal(paymentUpdate.amount, 1205856);
    const recordUpdate = calls.find(([name]) => name === 'record.update')[1];
    assert.equal(recordUpdate.where.id, 'rec-1');
    assert.equal(recordUpdate.data.amount, 1205856, 'el ingreso dice lo mismo que el abono');
    const audit = calls.filter(([name]) => name === 'audit.create').map(([, args]) => args.data).find((item) => item.entityType === 'ReceivablePayment');
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.before.amount, 1136000);
    assert.equal(audit.after.amount, 1205856);
    assert.match(audit.after.reason, /máximo permitido/);
    assert.equal(audit.actorId, 'user-elisa');
});

test('cambiar fecha o cuenta mueve el ingreso a esa fecha y cuenta, y comprueba los periodos de las dos', async () => {
    const periods = [];
    const { calls, tx } = build({ payment: payment(), receivable: foobspain() });
    tx.financialPeriod.findUnique = async (args) => { periods.push(args.where.year_month.month); return { status: 'OPEN' }; };
    await updateReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'pay-1', {
        paidAt: '2026-10-02', accountId: 'acc-2', reference: 'WISE-77', notes: 'Entró a Wise.', reason: 'La fecha y la cuenta eran otras.'
    }, { id: 'u' });
    const paymentUpdate = calls.find(([name]) => name === 'payment.update')[1].data;
    assert.equal(paymentUpdate.paidAt.toISOString().slice(0, 10), '2026-10-02');
    assert.equal(paymentUpdate.accountId, 'acc-2');
    assert.equal(paymentUpdate.reference, 'WISE-77');
    const recordUpdate = calls.find(([name]) => name === 'record.update')[1].data;
    assert.equal(recordUpdate.year, 2026);
    assert.equal(recordUpdate.month, 10);
    assert.equal(recordUpdate.accountId, 'acc-2');
    assert.equal(recordUpdate.reference, 'WISE-77');
    assert.equal(recordUpdate.notes, 'Entró a Wise.');
    assert.deepEqual([...new Set(periods)].sort((a, b) => a - b), [9, 10], 'el mes de antes y el de ahora tienen que estar abiertos');
});

test('corregir solo la referencia o las notas no pide motivo ni toca el dinero', async () => {
    const { calls, tx } = build({ payment: payment(), receivable: foobspain() });
    await updateReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'pay-1', { notes: 'Comprobante adjunto.' }, { id: 'u' });
    const paymentUpdate = calls.find(([name]) => name === 'payment.update')[1].data;
    assert.equal(paymentUpdate.amount, undefined);
    assert.equal(paymentUpdate.notes, 'Comprobante adjunto.');
    assert.equal(calls.find(([name]) => name === 'record.update')[1].data.notes, 'Comprobante adjunto.');
    assert.equal(calls.some(([name]) => name === 'receivable.update'), false, 'el saldo no cambió');
});

test('cambiar el valor, la fecha o la cuenta exige motivo', async () => {
    const { tx } = build({ payment: payment(), receivable: foobspain() });
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'pay-1', { amount: 1205856 }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_EDIT_REASON_REQUIRED');
});

test('un abono no puede dejar la cuenta pagada de más; en dólares, la cartera se ajusta a lo que entró', async () => {
    const cop = build({ payment: payment(), receivable: foobspain({ currency: 'COP' }) });
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(cop.tx) }, 'pay-1', { amount: 1300000, reason: 'x' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_OVERPAYMENT');

    const usd = build({ payment: payment(), receivable: foobspain() });
    const result = await updateReceivablePayment({ $transaction: async (cb) => cb(usd.tx) }, 'pay-1', { amount: 1300000, reason: 'Entró más por la tasa.' }, { id: 'u' });
    assert.deepEqual(result.exchangeAdjustment, { fromCents: 120585600, toCents: 130000000, difference: 94144 });
    const receivableUpdate = usd.calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(receivableUpdate.amount, 1300000);
    assert.equal(receivableUpdate.status, 'PAGADO');
    assert.equal(receivableUpdate.metadata.exchangeAdjustments[0].paymentId, 'pay-1');
});

test('si ese abono ya había ajustado la cartera por tasa, corregirlo rehace el ajuste desde el valor anterior', async () => {
    const receivable = foobspain({ amount: 1250000, status: 'PAGADO', payments: [{ id: 'pay-1', amount: 1250000, kind: 'PAGO', reversedAt: null }], metadata: { exchangeAdjustments: [{ at: '2026-10-19T15:00:00.000Z', paymentId: 'pay-1', fromCents: 120000000, toCents: 125000000 }] } });
    const { calls, tx } = build({ payment: payment({ amount: 1250000, financialRecord: systemRecord({ amount: 1250000 }) }), receivable });
    const result = await updateReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'pay-1', { amount: 1240000, reason: 'Eran 1.240.000.' }, { id: 'u' });
    const receivableUpdate = calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(receivableUpdate.amount, 1240000, 'parte del valor de antes del ajuste (1.200.000), no del ajustado');
    assert.equal(receivableUpdate.metadata.exchangeAdjustments.length, 1, 'el ajuste viejo se reemplaza, no se acumula');
    assert.equal(receivableUpdate.metadata.exchangeAdjustments[0].toCents, 124000000);
    assert.equal(result.receivable.status, 'PAGADO');
});

test('lo que no se corrige aquí se dice: abono revertido, ingreso que ya existía, conciliación aprobada, ajuste sin dinero', async () => {
    const reversed = build({ payment: payment({ reversedAt: new Date() }), receivable: foobspain() });
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(reversed.tx) }, 'pay-1', { notes: 'x' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_ALREADY_REVERSED');

    const applied = build({ payment: payment({ financialRecord: systemRecord({ origin: 'MANUAL' }) }), receivable: foobspain() });
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(applied.tx) }, 'pay-1', { amount: 1205856, reason: 'x' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_RECORD_EXTERNAL' && /Movimientos/.test(error.message));
    const appliedNotes = build({ payment: payment({ financialRecord: systemRecord({ origin: 'MANUAL' }) }), receivable: foobspain() });
    await updateReceivablePayment({ $transaction: async (cb) => cb(appliedNotes.tx) }, 'pay-1', { notes: 'Seguimiento.' }, { id: 'u' });
    assert.equal(appliedNotes.calls.some(([name]) => name === 'record.update'), false, 'las notas del abono no reescriben un ingreso que ya existía');

    const matched = build({ payment: payment({ financialRecord: systemRecord({ bankMatches: [{ id: 'm', status: 'APPROVED' }] }) }), receivable: foobspain() });
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(matched.tx) }, 'pay-1', { amount: 1205856, reason: 'x' }, { id: 'u' }),
        (error) => error.code === 'FINANCIAL_RECORD_LINKED');

    const settlement = build({ payment: payment({ kind: 'ACUERDO', accountId: null, financialRecordId: null, financialRecord: null }), receivable: foobspain({ currency: 'COP' }) });
    const edited = await updateReceivablePayment({ $transaction: async (cb) => cb(settlement.tx) }, 'pay-1', { amount: 1000000, notes: 'Motivo corregido.', reason: 'El valor acordado era otro.' }, { id: 'u' });
    assert.equal(edited.outstanding, 205856);
    assert.equal(settlement.calls.some(([name]) => name === 'record.update'), false, 'un ajuste sin dinero no tiene ingreso');
    await assert.rejects(updateReceivablePayment({ $transaction: async (cb) => cb(build({ payment: payment({ kind: 'ACUERDO', financialRecord: null }), receivable: foobspain() }).tx) }, 'pay-1', { accountId: 'acc-2', reason: 'x' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_EDIT_INVALID');
});

test('la ruta, el catálogo, el bloqueo en Movimientos y la pantalla conocen la corrección', () => {
    assert.match(read('../src/routes/api/financials.js'), /patch\('\/receivable-payments\/:paymentId', requireFinancialWrite/);
    assert.match(read('../src/lib/platformCatalog.js'), /'PATCH \/financials\/receivable-payments\/:paymentId'/);
    assert.match(read('../src/services/financialRecordService.js'), /ingreso de un abono de cartera[^']*lápiz/, 'el motivo del bloqueo dice que el abono se corrige en Cartera');
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    const dialog = read('../src/components/modules/financial/ReceivablePaymentEditDialog.jsx');
    assert.match(dashboard, /ReceivablePaymentEditDialog/);
    assert.match(dashboard, /data-receivable-payment-edit/);
    assert.match(dialog, /BrainDatePicker/);
    assert.doesNotMatch(dialog, /from 'react-datepicker'/);
    assert.match(dialog, /MoneyInput/);
    assert.match(dialog, /Motivo/);
});
