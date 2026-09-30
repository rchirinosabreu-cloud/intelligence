import test from 'node:test';
import assert from 'node:assert/strict';
import {
    listPayrollPaymentCandidates,
    payPayrollTransaction,
    reversePayrollPayment,
    splitPayrollPayment,
    updatePayrollPayment
} from '../src/services/financialPayrollService.js';
import { financialRecordLockReason } from '../src/services/financialRecordService.js';
import { initialSplitParts, payrollDocumentProblem, payrollStatus, splitBalance } from '../src/lib/payrollPayments.js';
import fs from 'node:fs';

// Pagos de nómina por partes (Rodny, 30 de septiembre de 2026): «ese pago se hizo el 15 y el
// 30 y antes se le hicieron adelantos … necesito poder editar el pago para partirlo y subir
// las referencias».

const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    const value = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
        if ('in' in expected) return expected.in.includes(value);
        if ('not' in expected) return value !== expected.not;
        return true;
    }
    return (value ?? null) === (expected ?? null);
});

const buildDb = () => {
    const tables = { payrollTransaction: [], payrollPayment: [], financialRecord: [], financialAccount: [], financialAuditEvent: [], receivablePayment: [], financialPeriod: [] };
    let counter = 0;
    const relationsOf = (record) => ({
        receivablePayment: tables.receivablePayment.find((row) => row.financialRecordId === record.id) || null,
        payrollTransaction: tables.payrollTransaction.find((row) => row.financialRecordId === record.id) || null,
        payrollPayment: tables.payrollPayment.find((row) => row.financialRecordId === record.id) || null
    });
    const model = (name) => ({
        findUnique: async ({ where, include } = {}) => {
            const row = tables[name].find((candidate) => matches(candidate, where));
            if (!row) return null;
            return name === 'financialRecord' && include ? { ...row, ...relationsOf(row) } : { ...row };
        },
        findFirst: async ({ where } = {}) => tables[name].find((candidate) => matches(candidate, where)) || null,
        findMany: async ({ where, include } = {}) => tables[name].filter((candidate) => matches(candidate, where))
            .map((row) => (name === 'financialRecord' && include ? { ...row, ...relationsOf(row) } : { ...row })),
        create: async ({ data }) => {
            const row = { id: data.id || `${name}-${++counter}`, createdAt: new Date(), ...data };
            tables[name].push(row);
            return { ...row };
        },
        update: async ({ where, data }) => {
            const row = tables[name].find((candidate) => matches(candidate, where));
            if (!row) throw new Error(`${name} not found`);
            Object.assign(row, data);
            return { ...row };
        }
    });
    const db = Object.fromEntries(Object.keys(tables).map((name) => [name, model(name)]));
    db.$transaction = async (callback) => callback(db);
    return { db, tables };
};

const seed = ({ status = 'APPROVED', netAmount = 2508300 } = {}) => {
    const { db, tables } = buildDb();
    tables.financialAccount.push({ id: 'acc-1', name: 'Bancolombia', isActive: true, currency: 'COP' }, { id: 'acc-2', name: 'Nequi', isActive: true, currency: 'COP' });
    tables.payrollTransaction.push({
        id: 'tx-1', userId: 'user-elisa', contractId: 'contract-1', month: 9, year: 2026, status, netAmount,
        paidAt: null, financialRecordId: null,
        contract: { collaborator: { displayName: 'Elisa Mestra' } }
    });
    return { db, tables };
};

const actor = { id: 'admin-1' };

test('una liquidación se paga por partes y queda pagada al completar el neto', async () => {
    const { db, tables } = seed();
    const first = await payPayrollTransaction(db, 'tx-1', { amount: '1000000', accountId: 'acc-1', paidAt: '2026-09-15', reference: 'Transferencia 15' }, actor);
    assert.equal(first.transaction.status, 'APPROVED', 'con saldo pendiente sigue aprobada');
    assert.equal(first.outstanding, 1508300);
    assert.equal(first.financialRecord.amount, 1000000);
    assert.equal(first.financialRecord.type, 'EXPENSE');
    assert.equal(first.financialRecord.category, 'NOMINA');
    assert.equal(first.financialRecord.origin, 'SYSTEM');
    assert.equal(first.financialRecord.reference, 'Transferencia 15');
    assert.equal(first.payment.financialRecordId, first.financialRecord.id);

    // Sin importe se paga lo que falta.
    const second = await payPayrollTransaction(db, 'tx-1', { accountId: 'acc-2', paidAt: '2026-09-30' }, actor);
    assert.equal(second.payment.amount, 1508300);
    assert.equal(second.transaction.status, 'PAID');
    assert.equal(second.outstanding, 0);
    assert.equal(new Date(second.transaction.paidAt).toISOString().slice(0, 10), '2026-09-30');
    assert.equal(tables.financialRecord.length, 2, 'un egreso por pago');
    assert.equal(tables.payrollTransaction[0].financialRecordId, null, 'los pagos nuevos no usan el vínculo único antiguo');
});

test('no se paga de más, ni en cero, ni una liquidación sin aprobar o ya pagada', async () => {
    const { db } = seed();
    await assert.rejects(payPayrollTransaction(db, 'tx-1', { amount: '3000000', accountId: 'acc-1', paidAt: '2026-09-15' }, actor), (error) => error.code === 'PAYROLL_OVERPAYMENT');
    await assert.rejects(payPayrollTransaction(db, 'tx-1', { amount: '0', accountId: 'acc-1', paidAt: '2026-09-15' }, actor), (error) => error.code === 'PAYROLL_PAYMENT_AMOUNT_INVALID');
    await assert.rejects(payPayrollTransaction(db, 'tx-1', { amount: '10', paidAt: '2026-09-15' }, actor), (error) => error.code === 'PAYROLL_ACCOUNT_REQUIRED');
    const draft = seed({ status: 'DRAFT' });
    await assert.rejects(payPayrollTransaction(draft.db, 'tx-1', { accountId: 'acc-1', paidAt: '2026-09-15' }, actor), (error) => error.code === 'PAYROLL_NOT_APPROVED');
    const paid = seed({ status: 'PAID' });
    await assert.rejects(payPayrollTransaction(paid.db, 'tx-1', { accountId: 'acc-1', paidAt: '2026-09-15' }, actor), (error) => error.code === 'PAYROLL_ALREADY_PAID');
});

const manualAdvance = (overrides = {}) => ({
    id: 'rec-adelanto', amount: 500000, type: 'EXPENSE', category: 'NOMINA', status: 'POSTED', scenario: 'ACTUAL',
    origin: 'MANUAL', isProjection: false, accountId: 'acc-1', date: new Date('2026-09-05T12:00:00Z'), year: 2026, month: 9,
    description: 'Adelanto Elisa', reference: null, ...overrides
});

test('un adelanto que ya estaba registrado se aplica a la liquidación sin duplicar el egreso', async () => {
    const { db, tables } = seed();
    tables.financialRecord.push(manualAdvance());
    const candidates = await listPayrollPaymentCandidates(db, 'tx-1');
    assert.deepEqual(candidates.map((record) => record.id), ['rec-adelanto']);

    const result = await payPayrollTransaction(db, 'tx-1', { financialRecordId: 'rec-adelanto' }, actor);
    assert.equal(result.payment.amount, 500000);
    assert.equal(result.payment.accountId, 'acc-1', 'la cuenta y la fecha son las del movimiento');
    assert.equal(new Date(result.payment.paidAt).toISOString().slice(0, 10), '2026-09-05');
    assert.equal(tables.financialRecord.length, 1, 'no se crea otro egreso');
    assert.equal(result.outstanding, 2008300);
    assert.deepEqual(await listPayrollPaymentCandidates(db, 'tx-1'), [], 'ya aplicado, deja de ofrecerse');
});

test('solo se aplica un egreso de nómina, registrado a mano y libre', async () => {
    for (const wrong of [
        manualAdvance({ type: 'INCOME' }),
        manualAdvance({ category: 'SERVICIO' }),
        manualAdvance({ origin: 'SYSTEM' }),
        manualAdvance({ status: 'VOIDED' }),
        manualAdvance({ amount: 9000000 })
    ]) {
        const { db, tables } = seed();
        tables.financialRecord.push(wrong);
        await assert.rejects(payPayrollTransaction(db, 'tx-1', { financialRecordId: 'rec-adelanto' }, actor), (error) => /PAYROLL_PAYMENT_RECORD_INCOMPATIBLE|PAYROLL_OVERPAYMENT/.test(error.code));
    }
    const { db, tables } = seed();
    tables.financialRecord.push(manualAdvance());
    tables.receivablePayment.push({ id: 'rp-1', financialRecordId: 'rec-adelanto' });
    await assert.rejects(payPayrollTransaction(db, 'tx-1', { financialRecordId: 'rec-adelanto' }, actor), (error) => error.code === 'PAYROLL_PAYMENT_RECORD_INCOMPATIBLE');
});

// El pago que Rodny ya registró de una sola vez, como quedó antes de este cambio.
const seedLegacyPaid = () => {
    const { db, tables } = seed({ status: 'PAID', netAmount: 4808300 });
    tables.payrollTransaction[0].financialRecordId = 'rec-legacy';
    tables.payrollTransaction[0].paidAt = new Date('2026-09-30T12:00:00Z');
    tables.financialRecord.push({
        id: 'rec-legacy', amount: 4808300, type: 'EXPENSE', category: 'NOMINA', status: 'POSTED', scenario: 'ACTUAL',
        origin: 'SYSTEM', isProjection: false, accountId: 'acc-1', date: new Date('2026-09-30T12:00:00Z'), year: 2026, month: 9,
        description: 'Pago de nomina: Rodny Chirinos', userId: 'user-rodny'
    });
    tables.payrollPayment.push({
        id: 'payroll-payment-legacy:tx-1', transactionId: 'tx-1', accountId: 'acc-1', financialRecordId: 'rec-legacy',
        amount: 4808300, paidAt: new Date('2026-09-30T12:00:00Z'), reference: null, notes: null, reversedAt: null
    });
    return { db, tables };
};

test('un pago se parte en varios, cada uno con su fecha, cuenta y referencia', async () => {
    const { db, tables } = seedLegacyPaid();
    const parts = [
        { amount: '800000', paidAt: '2026-09-05', accountId: 'acc-2', reference: 'Adelanto' },
        { amount: '2000000', paidAt: '2026-09-15', accountId: 'acc-1', reference: 'Quincena 15' },
        { amount: '2008300', paidAt: '2026-09-30', accountId: 'acc-1', reference: 'Quincena 30' }
    ];
    const result = await splitPayrollPayment(db, 'payroll-payment-legacy:tx-1', { parts }, actor);

    assert.equal(result.payments.length, 3);
    assert.deepEqual(result.payments.map((payment) => payment.amount), [800000, 2000000, 2008300]);
    const original = tables.payrollPayment.find((payment) => payment.id === 'payroll-payment-legacy:tx-1');
    assert.ok(original.reversedAt, 'el pago original queda como evidencia, no se borra');
    assert.match(original.reversalReason, /Desglosado en 3 pagos/);
    const legacyRecord = tables.financialRecord.find((record) => record.id === 'rec-legacy');
    assert.equal(legacyRecord.status, 'VOIDED', 'su egreso se anula: el dinero lo cuentan ahora las partes');
    assert.equal(tables.payrollTransaction[0].financialRecordId, null, 'se suelta el vínculo antiguo');
    const newRecords = tables.financialRecord.filter((record) => record.status === 'POSTED');
    assert.equal(newRecords.length, 3);
    assert.deepEqual(newRecords.map((record) => record.reference), ['Adelanto', 'Quincena 15', 'Quincena 30']);
    assert.equal(newRecords[0].accountId, 'acc-2');
    assert.equal(newRecords[0].userId, 'user-rodny', 'las partes conservan a quién se le pagó');
    assert.equal(result.transaction.status, 'PAID', 'el total no cambia');
    assert.equal(new Date(result.transaction.paidAt).toISOString().slice(0, 10), '2026-09-30');
    // Solo acciones que existen en FinancialAuditAction: la operación va dentro del evento.
    const auditActions = new Set(['CREATE', 'UPDATE', 'POST', 'VOID', 'CLOSE', 'REOPEN', 'IMPORT', 'PAYMENT', 'DELETE']);
    assert.ok(tables.financialAuditEvent.every((event) => auditActions.has(event.data?.action ?? event.action)));
    assert.ok(tables.financialAuditEvent.some((event) => event.entityType === 'PayrollPayment' && event.action === 'UPDATE' && event.after.operation === 'SPLIT'));
});

test('las partes tienen que sumar exactamente el pago, y hacen falta al menos dos', async () => {
    const { db, tables } = seedLegacyPaid();
    await assert.rejects(splitPayrollPayment(db, 'payroll-payment-legacy:tx-1', { parts: [
        { amount: '1000000', paidAt: '2026-09-15', accountId: 'acc-1' },
        { amount: '1000000', paidAt: '2026-09-30', accountId: 'acc-1' }
    ] }, actor), (error) => error.code === 'PAYROLL_SPLIT_TOTAL_MISMATCH' && /4\.808\.300/.test(error.message));
    await assert.rejects(splitPayrollPayment(db, 'payroll-payment-legacy:tx-1', { parts: [
        { amount: '4808300', paidAt: '2026-09-15', accountId: 'acc-1' }
    ] }, actor), (error) => error.code === 'PAYROLL_SPLIT_PARTS_REQUIRED');
    await assert.rejects(splitPayrollPayment(db, 'payroll-payment-legacy:tx-1', { parts: [
        { amount: '4000000', paidAt: '2026-09-15', accountId: 'acc-1' },
        { amount: '808300', paidAt: '2026-09-30' }
    ] }, actor), (error) => error.code === 'PAYROLL_ACCOUNT_REQUIRED');
    assert.equal(tables.financialRecord.find((record) => record.id === 'rec-legacy').status, 'POSTED', 'un intento fallido no toca nada');
});

test('un adelanto aplicado no se parte: es un movimiento de otra persona', async () => {
    const { db, tables } = seed();
    tables.financialRecord.push(manualAdvance());
    const { payment } = await payPayrollTransaction(db, 'tx-1', { financialRecordId: 'rec-adelanto' }, actor);
    await assert.rejects(splitPayrollPayment(db, payment.id, { parts: [
        { amount: '250000', paidAt: '2026-09-05', accountId: 'acc-1' },
        { amount: '250000', paidAt: '2026-09-06', accountId: 'acc-1' }
    ] }, actor), (error) => error.code === 'PAYROLL_SPLIT_NOT_SYSTEM' && /Revertir/.test(error.message));
});

test('revertir un pago anula su egreso, o suelta el adelanto intacto, y reabre la liquidación', async () => {
    const legacy = seedLegacyPaid();
    await assert.rejects(reversePayrollPayment(legacy.db, 'payroll-payment-legacy:tx-1', { reason: ' ' }, actor), (error) => error.code === 'PAYROLL_PAYMENT_REVERSAL_REASON_REQUIRED');
    const reversed = await reversePayrollPayment(legacy.db, 'payroll-payment-legacy:tx-1', { reason: 'Se registró con la cuenta equivocada' }, actor);
    assert.equal(reversed.transaction.status, 'APPROVED');
    assert.equal(reversed.transaction.paidAt, null);
    assert.equal(reversed.outstanding, 4808300);
    assert.equal(legacy.tables.financialRecord[0].status, 'VOIDED');
    assert.equal(legacy.tables.payrollTransaction[0].financialRecordId, null);
    await assert.rejects(reversePayrollPayment(legacy.db, 'payroll-payment-legacy:tx-1', { reason: 'otra vez' }, actor), (error) => error.code === 'PAYROLL_PAYMENT_ALREADY_REVERSED');

    const applied = seed();
    applied.tables.financialRecord.push(manualAdvance());
    const { payment } = await payPayrollTransaction(applied.db, 'tx-1', { financialRecordId: 'rec-adelanto' }, actor);
    await reversePayrollPayment(applied.db, payment.id, { reason: 'Era de otra persona' }, actor);
    assert.equal(applied.tables.financialRecord[0].status, 'POSTED', 'el adelanto registrado a mano se conserva');
    assert.equal(applied.tables.payrollPayment[0].financialRecordId, null, 'y queda libre para aplicarlo donde toque');
});

test('la referencia y la nota de un pago se corrigen sin tocar el dinero', async () => {
    const { db, tables } = seedLegacyPaid();
    const updated = await updatePayrollPayment(db, 'payroll-payment-legacy:tx-1', { reference: 'Transferencia 0098', notes: 'Incluye prima' }, actor);
    assert.equal(updated.reference, 'Transferencia 0098');
    assert.equal(tables.financialRecord[0].reference, 'Transferencia 0098');
    assert.equal(tables.financialRecord[0].notes, 'Incluye prima');
    assert.equal(tables.financialRecord[0].amount, 4808300);
});

test('en Movimientos, un pago de nómina dice dónde se parte y dónde se suben sus comprobantes', () => {
    const reason = financialRecordLockReason({ payrollPayment: { id: 'p-1' } });
    assert.match(reason, /Nómina/);
    assert.match(reason, /Desglosar/);
    assert.match(reason, /comprobante/);
});

test('la fila dice «Pago parcial» cuando una aprobada ya tiene pagos', () => {
    assert.equal(payrollStatus(null).label, 'Sin generar');
    assert.equal(payrollStatus({ status: 'DRAFT' }).label, 'Borrador');
    assert.equal(payrollStatus({ status: 'APPROVED', paidAmount: 0 }).label, 'Aprobada');
    assert.equal(payrollStatus({ status: 'APPROVED', paidAmount: 800000 }).label, 'Pago parcial');
    assert.equal(payrollStatus({ status: 'PAID', paidAmount: 4808300 }).label, 'Pagada');
});

test('desglosar arranca con el pago entero y solo deja guardar cuando los ítems cuadran', () => {
    const parts = initialSplitParts({ amount: 4808300, paidAt: '2026-09-30T12:00:00.000Z', accountId: 'acc-1', reference: 'TRX' }, '2026-09-30');
    assert.equal(parts.length, 2);
    assert.equal(parts[0].amount, '4808300');
    assert.equal(parts[0].paidAt, '2026-09-30');
    assert.equal(splitBalance(parts, 4808300).ready, false, 'la segunda parte está vacía');
    parts[0].amount = '2800000';
    parts[1].amount = '2000000';
    assert.deepEqual(splitBalance(parts, 4808300), { partsCents: 480000000, diffCents: 830000, ready: false });
    parts[1].amount = '2008300';
    assert.equal(splitBalance(parts, 4808300).ready, true);
    parts[1].accountId = '';
    assert.equal(splitBalance(parts, 4808300).ready, false, 'cada parte necesita su cuenta');
});

test('el comprobante se revisa antes de subirlo', () => {
    assert.equal(payrollDocumentProblem({ name: 'soporte.pdf', size: 1000 }), null);
    assert.equal(payrollDocumentProblem({ name: 'foto.JPG', size: 1000 }), null);
    assert.match(payrollDocumentProblem({ name: 'hoja.xlsx', size: 1000 }), /PDF, JPG o PNG/);
    assert.match(payrollDocumentProblem({ name: 'grande.pdf', size: 26 * 1024 * 1024 }), /25 MB/);
    assert.match(payrollDocumentProblem({ name: 'vacio.png', size: 0 }), /vacío/);
});

test('la Nómina ofrece pagar por partes, desglosar con documentos de respaldo, revertir y subir comprobantes', () => {
    const source = fs.readFileSync(new URL('../src/components/modules/financial/PayrollPayments.jsx', import.meta.url), 'utf8');
    for (const text of ['Desglosar pago', 'Aplicar desglose', 'Documento de respaldo', 'Revertir', 'Subir comprobante', 'Aplicar un egreso ya registrado', '/payroll-payments/', '/payment-candidates', '/documents']) {
        assert.ok(source.includes(text), `falta «${text}»`);
    }
    const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
    assert.match(dashboard, /<PayrollPaymentList/);
    assert.match(dashboard, /<PayrollPaymentDialog/);
});
