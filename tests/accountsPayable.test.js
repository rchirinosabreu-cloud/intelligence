import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    PAYABLE_CATEGORY_OPTIONS, THIRD_PARTY_KINDS, isPayableClosed, payableDueState, payablePaymentProblem, payableProblem, payableStatusAfter, thirdPartyProblem
} from '../src/lib/accountsPayable.js';
import { createThirdParty, updateThirdParty } from '../src/services/thirdPartyService.js';
import { createPayable, listPayablesLedger, payPayable, reversePayablePayment, serializePayable, updatePayable, voidPayable } from '../src/services/accountsPayableService.js';
import { financialRecordLockReason } from '../src/services/financialRecordService.js';
import { isExcludedOperation, PLATFORM_OPERATIONS } from '../src/lib/platformCatalog.js';

// Terceros y cuentas por pagar (Rodny, 20 de octubre de 2026: «arranca con las cuentas por pagar y
// los terceros»). Un tercero es a quien Brain Studio le paga; una cuenta por pagar es el documento
// que llegó de él; pagarla crea el egreso en Movimientos ligado al pago, igual que un abono de
// cartera crea el ingreso. Nada se escribe dos veces y nómina sigue aparte.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('la regla: clases de tercero, categorías sin préstamo, estados por números y vencimientos en palabras', () => {
    assert.deepEqual(THIRD_PARTY_KINDS.map((item) => item.value), ['PROVEEDOR', 'COLABORADOR', 'ARRENDADOR', 'SOCIO', 'OTRO']);
    assert.ok(!PAYABLE_CATEGORY_OPTIONS.some(([value]) => value === 'PRESTAMO'), 'un préstamo es una cuenta por cobrar, no por pagar');
    assert.equal(thirdPartyProblem({ kind: 'PROVEEDOR', name: 'Papelería El Punto' }), null);
    assert.match(thirdPartyProblem({ kind: 'X', name: 'a' }), /clase/i);
    assert.match(thirdPartyProblem({ kind: 'PROVEEDOR', name: ' ' }), /nombre/i);
    assert.match(thirdPartyProblem({ kind: 'PROVEEDOR', name: 'a', documentType: 'NIT' }), /entero/i);
    assert.match(thirdPartyProblem({ kind: 'PROVEEDOR', name: 'a', email: 'nope' }), /correo/i);
    const payable = { thirdPartyId: 't1', concept: 'Arriendo de octubre', category: 'ADMINISTRATIVO', amount: 1500000, receivedAt: '2026-10-01', dueDate: '2026-10-05' };
    assert.equal(payableProblem(payable), null);
    assert.match(payableProblem({ ...payable, thirdPartyId: '' }), /tercero/i);
    assert.match(payableProblem({ ...payable, category: 'PRESTAMO' }), /categor/i);
    assert.match(payableProblem({ ...payable, amount: 0 }), /valor/i);
    assert.match(payableProblem({ ...payable, dueDate: '2026-09-30' }), /vencimiento/i);
    assert.equal(payablePaymentProblem({ amount: 500000, paidAt: '2026-10-10', accountId: 'a', outstanding: 1500000 }), null);
    assert.match(payablePaymentProblem({ amount: 2000000, paidAt: '2026-10-10', accountId: 'a', outstanding: 1500000 }), /supera/i);
    assert.match(payablePaymentProblem({ amount: 1, paidAt: '2026-10-10', accountId: '' }), /cuenta/i);
    assert.equal(payableStatusAfter({ amountCents: 100, paidCents: 0 }), 'POR_PAGAR');
    assert.equal(payableStatusAfter({ amountCents: 100, paidCents: 40 }), 'PARCIAL');
    assert.equal(payableStatusAfter({ amountCents: 100, paidCents: 100 }), 'PAGADA');
    assert.equal(payableStatusAfter({ amountCents: 100, paidCents: 0, voided: true }), 'ANULADA');
    assert.equal(isPayableClosed('PAGADA'), true);
    assert.equal(isPayableClosed('PARCIAL'), false);
    const today = new Date('2026-10-20T15:00:00Z');
    assert.equal(payableDueState({ status: 'POR_PAGAR', dueDate: '2026-10-15T00:00:00Z' }, today).key, 'VENCIDA');
    assert.equal(payableDueState({ status: 'POR_PAGAR', dueDate: '2026-10-15T00:00:00Z' }, today).label, 'Vencida hace 5 días');
    assert.equal(payableDueState({ status: 'POR_PAGAR', dueDate: '2026-10-20T00:00:00Z' }, today).key, 'VENCE_HOY');
    assert.equal(payableDueState({ status: 'POR_PAGAR', dueDate: '2026-10-25T00:00:00Z' }, today).label, 'Vence en 5 días');
    assert.equal(payableDueState({ status: 'POR_PAGAR', dueDate: null }, today).key, 'SIN_VENCIMIENTO');
    assert.equal(payableDueState({ status: 'PAGADA', dueDate: '2026-10-15T00:00:00Z' }, today).key, 'CERRADA');
});

const buildTx = ({ thirdParty = { id: 't1', kind: 'ARRENDADOR', name: 'Inmobiliaria Norte', isActive: true }, payable = null, payment = null, members = [] } = {}) => {
    const calls = [];
    const tx = {
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAccount: { findUnique: async () => ({ id: 'acc-1', isActive: true, currency: 'COP' }) },
        thirdParty: {
            findUnique: async () => thirdParty,
            findFirst: async () => null,
            findMany: async () => members,
            create: async (args) => { calls.push(['thirdParty.create', args]); return { id: 't-new', ...args.data }; },
            update: async (args) => { calls.push(['thirdParty.update', args]); return { ...thirdParty, ...args.data }; }
        },
        accountsPayable: {
            findUnique: async () => payable,
            findMany: async () => (payable ? [payable] : []),
            create: async (args) => { calls.push(['payable.create', args]); return { id: 'p-new', thirdParty, payments: [], documents: [], ...args.data }; },
            update: async (args) => { calls.push(['payable.update', args]); return { ...payable, ...args.data, thirdParty, payments: payable?.payments || [], documents: [] }; }
        },
        payablePayment: {
            findUnique: async () => payment,
            create: async (args) => { calls.push(['payment.create', args]); return { id: 'pay-1', ...args.data }; },
            update: async (args) => { calls.push(['payment.update', args]); return { ...payment, ...args.data }; }
        },
        financialRecord: {
            create: async (args) => { calls.push(['record.create', args]); return { id: 'rec-pay', ...args.data }; },
            update: async (args) => { calls.push(['record.update', args]); return { ...payment?.financialRecord, ...args.data }; }
        },
        financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
    };
    return { calls, tx, prisma: { $transaction: async (cb) => cb(tx), accountsPayable: tx.accountsPayable, thirdParty: tx.thirdParty } };
};

test('un tercero se crea con sus datos de pago, se edita y se desactiva; nunca se borra', async () => {
    const { calls, prisma } = buildTx();
    const created = await createThirdParty(prisma, { kind: 'ARRENDADOR', name: ' Inmobiliaria Norte ', documentType: 'nit', documentNumber: '900123', bankName: 'Bancolombia', bankAccountType: 'AHORROS', bankAccountNumber: '123' }, { id: 'u' });
    const data = calls.find(([name]) => name === 'thirdParty.create')[1].data;
    assert.equal(data.name, 'Inmobiliaria Norte');
    assert.equal(data.documentType, 'NIT');
    assert.equal(data.createdById, 'u');
    assert.equal(created.id, 't-new');
    await assert.rejects(createThirdParty(prisma, { kind: 'PROVEEDOR', name: '' }, { id: 'u' }), (error) => error.code === 'THIRD_PARTY_INVALID');
    const edit = buildTx();
    await updateThirdParty(edit.prisma, 't1', { isActive: false, phone: '300' }, { id: 'u' });
    const patch = edit.calls.find(([name]) => name === 'thirdParty.update')[1].data;
    assert.equal(patch.isActive, false);
    assert.equal(patch.phone, '300');
    assert.ok(edit.calls.some(([name, args]) => name === 'audit.create' && args.data.entityType === 'ThirdParty' && args.data.action === 'UPDATE'));
});

test('una cuenta por pagar nace POR_PAGAR con su tercero, su categoría y su vencimiento', async () => {
    const { calls, prisma } = buildTx();
    const payable = await createPayable(prisma, { thirdPartyId: 't1', concept: 'Arriendo de octubre', category: 'ADMINISTRATIVO', amount: 1500000, receivedAt: '2026-10-01', dueDate: '2026-10-05', documentNumber: 'F-77' }, { id: 'u' });
    const data = calls.find(([name]) => name === 'payable.create')[1].data;
    assert.equal(data.status, 'POR_PAGAR');
    assert.equal(data.year, 2026);
    assert.equal(data.month, 10);
    assert.equal(data.amount, 1500000);
    assert.ok(data.dueDate instanceof Date);
    assert.equal(payable.outstanding, 1500000);
    assert.equal(payable.dueState.key, 'VENCIDA');
    const inactive = buildTx({ thirdParty: { id: 't1', name: 'x', isActive: false } });
    await assert.rejects(createPayable(inactive.prisma, { thirdPartyId: 't1', concept: 'x', category: 'OPERATIVO', amount: 1, receivedAt: '2026-10-01' }, { id: 'u' }), (error) => error.code === 'THIRD_PARTY_NOT_FOUND');
});

const openPayable = (overrides = {}) => ({
    id: 'p1', thirdPartyId: 't1', thirdParty: { id: 't1', name: 'Inmobiliaria Norte', isActive: true }, concept: 'Arriendo de octubre', category: 'ADMINISTRATIVO', amount: 1500000,
    receivedAt: new Date('2026-10-01T12:00:00Z'), year: 2026, month: 10, dueDate: new Date('2026-10-05T12:00:00Z'), status: 'POR_PAGAR', payments: [], documents: [], ...overrides
});

test('pagar crea el egreso en Movimientos ligado al pago, con la categoría de la cuenta, y cierra la cuenta al completar', async () => {
    const { calls, prisma } = buildTx({ payable: openPayable() });
    const result = await payPayable(prisma, 'p1', { amount: 1000000, paidAt: '2026-10-10', accountId: 'acc-1', reference: 'TRX-1' }, { id: 'u' });
    const record = calls.find(([name]) => name === 'record.create')[1].data;
    assert.equal(record.type, 'EXPENSE');
    assert.equal(record.category, 'ADMINISTRATIVO', 'el egreso lleva la categoría de la cuenta');
    assert.equal(record.origin, 'SYSTEM');
    assert.equal(record.counterparty, 'Inmobiliaria Norte');
    assert.match(record.description, /Pago a Inmobiliaria Norte: Arriendo de octubre/);
    assert.equal(record.accountId, 'acc-1');
    assert.equal(record.amount, 1000000);
    const payment = calls.find(([name]) => name === 'payment.create')[1].data;
    assert.equal(payment.financialRecordId, 'rec-pay');
    assert.equal(payment.payableId, 'p1');
    assert.equal(calls.find(([name]) => name === 'payable.update')[1].data.status, 'PARCIAL');
    assert.equal(result.outstanding, 500000);
    const audits = calls.filter(([name]) => name === 'audit.create').map(([, args]) => `${args.data.entityType}:${args.data.action}`).sort();
    assert.deepEqual(audits, ['AccountsPayable:PAYMENT', 'FinancialRecord:CREATE']);

    const rest = buildTx({ payable: openPayable({ status: 'PARCIAL', payments: [{ id: 'pay-0', amount: 1000000, reversedAt: null }] }) });
    const done = await payPayable(rest.prisma, 'p1', { amount: 500000, paidAt: '2026-10-12', accountId: 'acc-1' }, { id: 'u' });
    assert.equal(rest.calls.find(([name]) => name === 'payable.update')[1].data.status, 'PAGADA');
    assert.equal(done.outstanding, 0);
    await assert.rejects(payPayable(rest.prisma, 'p1', { amount: 600000, paidAt: '2026-10-12', accountId: 'acc-1' }, { id: 'u' }), (error) => error.code === 'PAYABLE_OVERPAYMENT');
    const closed = buildTx({ payable: openPayable({ status: 'PAGADA' }) });
    await assert.rejects(payPayable(closed.prisma, 'p1', { amount: 1, paidAt: '2026-10-12', accountId: 'acc-1' }, { id: 'u' }), (error) => error.code === 'PAYABLE_CLOSED');
});

test('revertir un pago lo conserva como evidencia, anula su egreso y reabre la cuenta', async () => {
    const payment = { id: 'pay-1', payableId: 'p1', amount: 1000000, paidAt: new Date('2026-10-10T12:00:00Z'), reversedAt: null, financialRecord: { id: 'rec-pay', status: 'POSTED' } };
    const { calls, prisma } = buildTx({ payable: openPayable({ status: 'PAGADA', payments: [{ ...payment, reversedAt: new Date() }] }), payment });
    const result = await reversePayablePayment(prisma, 'pay-1', 'Se pagó a la cuenta equivocada', { id: 'u' });
    assert.ok(calls.find(([name]) => name === 'payment.update')[1].data.reversedAt instanceof Date);
    const voided = calls.find(([name]) => name === 'record.update')[1].data;
    assert.equal(voided.status, 'VOIDED');
    assert.match(voided.voidReason, /revertido/);
    assert.equal(calls.find(([name]) => name === 'payable.update')[1].data.status, 'POR_PAGAR');
    assert.equal(result.payable.status, 'POR_PAGAR');
    await assert.rejects(reversePayablePayment(prisma, 'pay-1', '', { id: 'u' }), (error) => error.code === 'PAYABLE_REVERSAL_REASON_REQUIRED');
});

test('corregir no baja el valor de lo pagado; anular exige motivo y una cuenta sin pagos vigentes', async () => {
    const partial = buildTx({ payable: openPayable({ status: 'PARCIAL', payments: [{ id: 'pay-0', amount: 1000000, reversedAt: null }] }) });
    await assert.rejects(updatePayable(partial.prisma, 'p1', { amount: 900000 }, { id: 'u' }), (error) => error.code === 'PAYABLE_AMOUNT_BELOW_PAYMENTS');
    const edited = await updatePayable(partial.prisma, 'p1', { concept: 'Arriendo de octubre (ajustado)', dueDate: '2026-10-15' }, { id: 'u' });
    assert.equal(partial.calls.find(([name]) => name === 'payable.update')[1].data.concept, 'Arriendo de octubre (ajustado)');
    assert.equal(edited.status, 'PARCIAL');
    await assert.rejects(voidPayable(partial.prisma, 'p1', 'duplicada', { id: 'u' }), (error) => error.code === 'PAYABLE_HAS_PAYMENTS');
    const fresh = buildTx({ payable: openPayable() });
    await assert.rejects(voidPayable(fresh.prisma, 'p1', '', { id: 'u' }), (error) => error.code === 'PAYABLE_VOID_REASON_REQUIRED');
    const voided = await voidPayable(fresh.prisma, 'p1', 'Llegó dos veces', { id: 'u' });
    assert.equal(fresh.calls.find(([name]) => name === 'payable.update')[1].data.status, 'ANULADA');
    assert.equal(voided.status, 'ANULADA');
});

test('la pestaña agrupa por tercero: lo abierto de cualquier fecha más lo cerrado del periodo, con totales por pagar, vencido y pagado', async () => {
    const rows = [
        openPayable(),
        openPayable({ id: 'p2', concept: 'Diseño de stand', thirdPartyId: 't2', thirdParty: { id: 't2', name: 'Diseños Caribe' }, amount: 800000, year: 2026, month: 9, dueDate: new Date('2026-12-01T12:00:00Z') }),
        openPayable({ id: 'p3', concept: 'Arriendo de septiembre', status: 'PAGADA', year: 2026, month: 9, dueDate: new Date('2026-09-05T12:00:00Z'), payments: [{ id: 'x', amount: 1500000, paidAt: new Date('2026-10-02T12:00:00Z'), reversedAt: null, account: { name: 'Bancolombia' }, financialRecord: { documents: [] } }] })
    ];
    let where;
    const prisma = { accountsPayable: { findMany: async (args) => { where = args.where; return rows; } } };
    const ledger = await listPayablesLedger(prisma, { year: '2026', month: '10' });
    assert.deepEqual(where.OR, [{ status: { in: ['POR_PAGAR', 'PARCIAL'] } }, { year: 2026, month: 10 }]);
    assert.deepEqual(ledger.items.map((group) => group.thirdParty.name), ['Inmobiliaria Norte', 'Diseños Caribe'], 'primero quien tiene vencido');
    assert.equal(ledger.totals.outstanding, 2300000);
    assert.equal(ledger.totals.overdue, 1500000);
    assert.equal(ledger.totals.openCount, 2);
    assert.equal(ledger.totals.overdueCount, 1);
    assert.equal(ledger.totals.paidInPeriod, 1500000, 'lo pagado en octubre, aunque la cuenta sea de septiembre');
    const serialized = serializePayable(rows[2]);
    assert.equal(serialized.paidAmount, 1500000);
    assert.equal(serialized.payments[0].accountName, 'Bancolombia');
});

test('el egreso de un pago no se edita ni se anula desde Movimientos: se dice a dónde ir', () => {
    const reason = financialRecordLockReason({ origin: 'SYSTEM', payablePayment: { id: 'pay-1', payableId: 'p1' } });
    assert.match(reason, /cuenta por pagar/i);
    assert.match(reason, /Por pagar/);
    assert.match(reason, /Revertir/);
    assert.match(read('../src/components/modules/financial/FinancialLedger.jsx'), /record\?\.payablePayment/);
});

test('el esquema, el arranque, las rutas, el catálogo de Bria y la caché conocen las cuentas por pagar', () => {
    const schema = read('../prisma/schema.prisma');
    for (const model of ['ThirdParty', 'AccountsPayable', 'PayablePayment', 'AccountsPayableDocument']) assert.match(schema, new RegExp(`^model ${model} \\{`, 'm'));
    assert.match(schema, /payablePayment\s+PayablePayment\?\s+@relation\("PayablePaymentRecord"\)/);
    const ensure = read('../scripts/ensure-accounts-payable-schema.js');
    for (const table of ['ThirdParty', 'AccountsPayable', 'PayablePayment', 'AccountsPayableDocument']) assert.match(ensure, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(JSON.parse(read('../package.json')).scripts.start, /ensure-accounts-payable-schema\.js/);
    const routes = read('../src/routes/api/financials.js');
    for (const route of ["'/third-parties', requireFinancialAccess", "'/third-parties', requireFinancialWrite", "'/payables-ledger', requireFinancialAccess", "'/payables', requireFinancialWrite", "'/payables/:id/payments', requireFinancialWrite", "'/payable-payments/:paymentId/reverse', requireFinancialWrite", "'/payables/:id/documents', requireFinancialWrite, receiveFinancialDocument"]) {
        assert.ok(routes.includes(route), route);
    }
    for (const key of ['GET /financials/third-parties', 'POST /financials/payables', 'POST /financials/payables/:id/payments', 'POST /financials/payable-payments/:paymentId/reverse']) assert.ok(PLATFORM_OPERATIONS[key], key);
    // Desde el 22 de octubre de 2026 Bria adjunta el soporte que llegó al chat; bajarlo sigue fuera.
    assert.ok(PLATFORM_OPERATIONS['POST /financials/payables/:id/documents'].archivo);
    assert.ok(isExcludedOperation('GET /financials/payables/:id/documents/:documentId/file'));
    assert.match(read('../src/utils/financialQueryCache.js'), /'financial-payables-ledger', 'financial-third-parties'/);
});

test('la pantalla: pestaña «Por pagar», terceros, cuenta nueva, pago con comprobante y pagos plegados', () => {
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /setActiveTab\('payables'\)/);
    assert.match(dashboard, /<PayablesTab /);
    const tab = read('../src/components/modules/financial/PayablesTab.jsx');
    assert.match(tab, /data-payable-new/);
    assert.match(tab, /data-third-parties-open/);
    assert.match(tab, /data-payable-pay/);
    assert.match(tab, /data-payable-payments-toggle/);
    assert.match(tab, /payableDocumentsApi/, 'el soporte del tercero se adjunta a la cuenta');
    assert.match(tab, /uploadRecordDocument\(data\.financialRecord\.id, file\)/, 'el comprobante del pago va al egreso, después de que el servidor confirme');
    for (const file of ['PayableDialog', 'PayablePaymentDialog', 'ThirdParties']) {
        const source = read(`../src/components/modules/financial/${file}.jsx`);
        assert.doesNotMatch(source, /type="date"|from 'react-datepicker'/, `${file}: solo el calendario de la plataforma`);
        assert.doesNotMatch(source, /<select/, `${file}: solo el Select compartido`);
    }
    assert.match(read('../src/components/modules/financial/PayableDialog.jsx'), /payableProblem\(/);
    assert.match(read('../src/components/modules/financial/PayablePaymentDialog.jsx'), /MoneyInput/);
});
