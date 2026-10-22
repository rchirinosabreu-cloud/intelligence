import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { assertOpenFinancialPeriod, FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';
import {
    isPayableClosed, payableDueState, payablePaymentProblem, payableProblem, payableStatusAfter, PAYABLE_REASON_MAX
} from '../lib/accountsPayable.js';

// Cuentas por pagar (Rodny, 20 de octubre de 2026): el espejo de Cartera. Una cuenta es un documento
// que llegó de un tercero; pagarla crea el egreso en Movimientos ligado al pago, con la categoría de
// la cuenta, y nunca se escribe dos veces el mismo dinero. Nómina sigue aparte.

const text = (value) => String(value ?? '').trim() || null;
const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const actorIdFrom = (actor) => actor?.id || actor?.userId || null;
const ACTIVE_PAYMENT = { reversedAt: null };
const OPEN_STATUSES = ['POR_PAGAR', 'PARCIAL'];

const centsOrThrow = (value, code, message) => {
    const cents = financialCents(value);
    if (cents === null || cents <= 0) throw new FinancialDomainError(code, message);
    return cents;
};

const paidCentsOf = (payable) => (payable.payments || []).reduce((sum, payment) => (payment.reversedAt ? sum : sum + (financialCents(payment.amount) || 0)), 0);

export const serializePayable = (payable, today = new Date()) => {
    const amountCents = financialCents(payable.amount) || 0;
    const paidCents = paidCentsOf(payable);
    const outstandingCents = Math.max(amountCents - paidCents, 0);
    return {
        ...payable,
        amount: Number(financialAmountFromCents(amountCents)),
        paidAmount: Number(financialAmountFromCents(paidCents)),
        outstanding: isPayableClosed(payable.status) && payable.status === 'ANULADA' ? 0 : Number(financialAmountFromCents(outstandingCents)),
        dueState: payableDueState(payable, today),
        payments: (payable.payments || []).map((payment) => ({
            ...payment,
            amount: Number(financialAmountFromCents(financialCents(payment.amount) || 0)),
            accountName: payment.account?.name || null,
            documents: (payment.financialRecord?.documents || []).filter((document) => !document.voidedAt)
        })),
        documents: (payable.documents || []).filter((document) => !document.voidedAt)
    };
};

const PAYABLE_INCLUDE = {
    thirdParty: true,
    payments: { orderBy: { paidAt: 'asc' }, include: { account: { select: { id: true, name: true } }, financialRecord: { select: { id: true, status: true, documents: true } } } },
    documents: { orderBy: { uploadedAt: 'asc' } }
};

/**
 * La pestaña «Por pagar»: todo lo abierto, de cualquier fecha, más lo cerrado del periodo elegido,
 * agrupado por tercero y con los totales de arriba (por pagar, vencido, pagado en el periodo).
 */
export const listPayablesLedger = async (prismaClient, filters = {}) => {
    const year = Number.parseInt(filters.year, 10);
    const month = Number.parseInt(filters.month, 10);
    const q = text(filters.q);
    const periodWhere = { ...(Number.isInteger(year) ? { year } : {}), ...(Number.isInteger(month) && month >= 1 && month <= 12 ? { month } : {}) };
    const where = {
        OR: [{ status: { in: OPEN_STATUSES } }, periodWhere],
        ...(text(filters.thirdPartyId) ? { thirdPartyId: text(filters.thirdPartyId) } : {}),
        ...(text(filters.status) ? { status: text(filters.status) } : {}),
        ...(q ? { AND: [{ OR: [{ concept: { contains: q, mode: 'insensitive' } }, { documentNumber: { contains: q, mode: 'insensitive' } }, { thirdParty: { name: { contains: q, mode: 'insensitive' } } }] }] } : {})
    };
    const rows = await prismaClient.accountsPayable.findMany({ where, include: PAYABLE_INCLUDE, orderBy: [{ dueDate: 'asc' }, { receivedAt: 'asc' }] });
    const today = new Date();
    const groups = new Map();
    const totals = { outstanding: 0, overdue: 0, paidInPeriod: 0, openCount: 0, overdueCount: 0 };
    for (const row of rows) {
        const payable = serializePayable(row, today);
        const key = row.thirdPartyId;
        if (!groups.has(key)) groups.set(key, { thirdParty: row.thirdParty, payables: [], outstanding: 0, overdue: 0 });
        const group = groups.get(key);
        group.payables.push(payable);
        if (!isPayableClosed(payable.status)) {
            group.outstanding += payable.outstanding;
            totals.outstanding += payable.outstanding;
            totals.openCount += 1;
            if (payable.dueState.key === 'VENCIDA') { group.overdue += payable.outstanding; totals.overdue += payable.outstanding; totals.overdueCount += 1; }
        }
        for (const payment of payable.payments) {
            if (payment.reversedAt) continue;
            const paid = new Date(payment.paidAt);
            const inPeriod = (!Number.isInteger(year) || paid.getUTCFullYear() === year) && (!(Number.isInteger(month) && month >= 1 && month <= 12) || paid.getUTCMonth() + 1 === month);
            if (inPeriod) totals.paidInPeriod += payment.amount;
        }
    }
    const round = (value) => Math.round(value * 100) / 100;
    const items = [...groups.values()].map((group) => ({ ...group, outstanding: round(group.outstanding), overdue: round(group.overdue) }))
        .sort((a, b) => (b.overdue - a.overdue) || (b.outstanding - a.outstanding) || a.thirdParty.name.localeCompare(b.thirdParty.name, 'es'));
    return { items, totals: { ...totals, outstanding: round(totals.outstanding), overdue: round(totals.overdue), paidInPeriod: round(totals.paidInPeriod) } };
};

export const createPayable = async (prismaClient, input = {}, actor) => {
    const problem = payableProblem(input);
    if (problem) throw new FinancialDomainError('PAYABLE_INVALID', problem);
    const amountCents = centsOrThrow(input.amount, 'PAYABLE_INVALID', 'El valor debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
    const { date: receivedAt, year, month } = parseFinancialDateInput(input.receivedAt);
    let dueDate = null;
    if (text(input.dueDate)) {
        try { dueDate = parseFinancialDateInput(input.dueDate).date; } catch { throw new FinancialDomainError('PAYABLE_INVALID', 'El vencimiento debe ser una fecha válida.'); }
    }
    const actorId = actorIdFrom(actor);
    return prismaClient.$transaction(async (tx) => {
        const thirdParty = await tx.thirdParty.findUnique({ where: { id: String(input.thirdPartyId) }, select: { id: true, name: true, isActive: true } });
        if (!thirdParty?.isActive) throw new FinancialDomainError('THIRD_PARTY_NOT_FOUND', 'El tercero no existe o está desactivado.', 404);
        await assertOpenFinancialPeriod(tx, year, month);
        const payable = await tx.accountsPayable.create({
            data: {
                thirdPartyId: thirdParty.id,
                concept: text(input.concept),
                category: input.category,
                amount: financialAmountFromCents(amountCents),
                currency: 'COP',
                documentNumber: text(input.documentNumber),
                receivedAt, year, month, dueDate,
                status: 'POR_PAGAR',
                notes: text(input.notes),
                createdById: actorId,
                metadata: { createdBy: actorId, origin: 'PLATFORM' }
            },
            include: PAYABLE_INCLUDE
        });
        await tx.financialAuditEvent.create({ data: { entityType: 'AccountsPayable', entityId: payable.id, action: 'CREATE', after: cloneForAudit(payable), actorId } });
        return serializePayable(payable);
    });
};

export const updatePayable = async (prismaClient, payableId, patch = {}, actor) => {
    const actorId = actorIdFrom(actor);
    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.accountsPayable.findUnique({ where: { id: payableId }, include: PAYABLE_INCLUDE });
        if (!existing) throw new FinancialDomainError('PAYABLE_NOT_FOUND', 'La cuenta por pagar no existe.', 404);
        if (existing.status === 'ANULADA') throw new FinancialDomainError('PAYABLE_VOIDED', 'Una cuenta anulada no se edita.', 409);
        const merged = {
            thirdPartyId: existing.thirdPartyId,
            concept: patch.concept !== undefined ? patch.concept : existing.concept,
            category: patch.category !== undefined ? patch.category : existing.category,
            amount: patch.amount !== undefined ? patch.amount : existing.amount,
            receivedAt: patch.receivedAt !== undefined ? patch.receivedAt : existing.receivedAt.toISOString().slice(0, 10),
            dueDate: patch.dueDate !== undefined ? patch.dueDate : (existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : ''),
            notes: patch.notes !== undefined ? patch.notes : existing.notes
        };
        const problem = payableProblem(merged);
        if (problem) throw new FinancialDomainError('PAYABLE_INVALID', problem);
        const amountCents = centsOrThrow(merged.amount, 'PAYABLE_INVALID', 'El valor debe ser positivo y con dos decimales como máximo.');
        const paidCents = paidCentsOf(existing);
        if (amountCents < paidCents) throw new FinancialDomainError('PAYABLE_AMOUNT_BELOW_PAYMENTS', 'El valor no puede quedar por debajo de lo ya pagado. Revierte primero los pagos que sobren.', 409);
        const { date: receivedAt, year, month } = parseFinancialDateInput(merged.receivedAt);
        await assertOpenFinancialPeriod(tx, existing.year, existing.month);
        await assertOpenFinancialPeriod(tx, year, month);
        const dueDate = text(merged.dueDate) ? parseFinancialDateInput(merged.dueDate).date : null;
        const updated = await tx.accountsPayable.update({
            where: { id: payableId },
            data: {
                concept: text(merged.concept), category: merged.category, amount: financialAmountFromCents(amountCents),
                documentNumber: patch.documentNumber !== undefined ? text(patch.documentNumber) : existing.documentNumber,
                receivedAt, year, month, dueDate, notes: text(merged.notes),
                status: payableStatusAfter({ amountCents, paidCents })
            },
            include: PAYABLE_INCLUDE
        });
        await tx.financialAuditEvent.create({ data: { entityType: 'AccountsPayable', entityId: payableId, action: 'UPDATE', before: cloneForAudit(existing), after: cloneForAudit(updated), actorId } });
        return serializePayable(updated);
    });
};

export const voidPayable = async (prismaClient, payableId, reason, actor) => {
    const voidReason = text(reason);
    if (!voidReason) throw new FinancialDomainError('PAYABLE_VOID_REASON_REQUIRED', 'Indica por qué se anula la cuenta.');
    if (voidReason.length > PAYABLE_REASON_MAX) throw new FinancialDomainError('PAYABLE_VOID_REASON_TOO_LONG', `El motivo admite como máximo ${PAYABLE_REASON_MAX} caracteres.`);
    const actorId = actorIdFrom(actor);
    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.accountsPayable.findUnique({ where: { id: payableId }, include: PAYABLE_INCLUDE });
        if (!existing) throw new FinancialDomainError('PAYABLE_NOT_FOUND', 'La cuenta por pagar no existe.', 404);
        if (existing.status === 'ANULADA') throw new FinancialDomainError('PAYABLE_ALREADY_VOIDED', 'La cuenta ya está anulada.', 409);
        if (paidCentsOf(existing) > 0) throw new FinancialDomainError('PAYABLE_HAS_PAYMENTS', 'La cuenta tiene pagos vigentes. Revierte primero cada pago; su egreso se anula solo.', 409);
        const updated = await tx.accountsPayable.update({ where: { id: payableId }, data: { status: 'ANULADA', voidedAt: new Date(), voidReason, voidedById: actorId }, include: PAYABLE_INCLUDE });
        await tx.financialAuditEvent.create({ data: { entityType: 'AccountsPayable', entityId: payableId, action: 'VOID', before: cloneForAudit(existing), after: cloneForAudit(updated), actorId } });
        return serializePayable(updated);
    });
};

/**
 * Pagar una cuenta: el egreso en Movimientos y el pago en la cuenta nacen en la misma transacción.
 * El egreso lleva la categoría de la cuenta, el tercero como contraparte y origen SYSTEM, y desde
 * Movimientos no se edita ni se anula suelto: se revierte el pago aquí.
 */
export const payPayable = async (prismaClient, payableId, input = {}, actor) => {
    const problem = payablePaymentProblem({ ...input, outstanding: undefined });
    if (problem) throw new FinancialDomainError('PAYABLE_PAYMENT_INVALID', problem);
    const amountCents = centsOrThrow(input.amount, 'PAYABLE_PAYMENT_INVALID', 'El valor pagado debe ser positivo y con dos decimales como máximo.');
    const amount = financialAmountFromCents(amountCents);
    const { date: paidAt, year, month } = parseFinancialDateInput(input.paidAt);
    const accountId = String(input.accountId);
    const reference = text(input.reference);
    const notes = text(input.notes);
    const actorId = actorIdFrom(actor);
    try {
        return await prismaClient.$transaction(async (tx) => {
            const payable = await tx.accountsPayable.findUnique({ where: { id: payableId }, include: PAYABLE_INCLUDE });
            if (!payable) throw new FinancialDomainError('PAYABLE_NOT_FOUND', 'La cuenta por pagar no existe.', 404);
            if (isPayableClosed(payable.status)) throw new FinancialDomainError('PAYABLE_CLOSED', payable.status === 'ANULADA' ? 'La cuenta está anulada.' : 'La cuenta ya está pagada.', 409);
            const totalCents = financialCents(payable.amount) || 0;
            const paidBefore = paidCentsOf(payable);
            const outstandingBefore = totalCents - paidBefore;
            if (amountCents > outstandingBefore) throw new FinancialDomainError('PAYABLE_OVERPAYMENT', 'El pago supera el saldo pendiente de la cuenta.', 409);
            const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { id: true, isActive: true, currency: true } });
            if (!account?.isActive) throw new FinancialDomainError('PAYABLE_PAYMENT_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
            if (account.currency !== 'COP') throw new FinancialDomainError('PAYABLE_PAYMENT_CURRENCY_UNSUPPORTED', 'Las cuentas por pagar se pagan en pesos.', 409);
            await assertOpenFinancialPeriod(tx, year, month);
            const financialRecord = await tx.financialRecord.create({
                data: {
                    amount, category: payable.category, type: 'EXPENSE', section: 'OPERATING_EXPENSE',
                    date: paidAt, year, month, createdById: actorId, accountId,
                    counterparty: payable.thirdParty?.name || null,
                    description: `Pago a ${payable.thirdParty?.name || 'tercero'}: ${payable.concept}`,
                    scenario: 'ACTUAL', status: 'POSTED', origin: 'SYSTEM', isProjection: false,
                    reference, notes, postedAt: new Date(), metadata: { payableId }
                }
            });
            const payment = await tx.payablePayment.create({ data: { payableId, accountId, financialRecordId: financialRecord.id, amount, paidAt, reference, notes, createdById: actorId } });
            const paidAfter = paidBefore + amountCents;
            const updated = await tx.accountsPayable.update({ where: { id: payableId }, data: { status: payableStatusAfter({ amountCents: totalCents, paidCents: paidAfter }) }, include: PAYABLE_INCLUDE });
            await tx.financialAuditEvent.create({ data: { entityType: 'FinancialRecord', entityId: financialRecord.id, action: 'CREATE', after: cloneForAudit(financialRecord), actorId } });
            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsPayable', entityId: payableId, action: 'PAYMENT',
                    before: { status: payable.status, outstanding: Number(financialAmountFromCents(outstandingBefore)) },
                    after: { status: updated.status, outstanding: Number(financialAmountFromCents(totalCents - paidAfter)), paymentId: payment.id, financialRecordId: financialRecord.id },
                    actorId
                }
            });
            return { payment, financialRecord, payable: serializePayable(updated), outstanding: Number(financialAmountFromCents(totalCents - paidAfter)) };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('PAYABLE_PAYMENT_CONFLICT', 'Otro proceso modificó la cuenta o el pago. Actualiza los datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};

/** Revertir un pago: el pago queda como evidencia y deja de sumar; su egreso se anula con el motivo. */
export const reversePayablePayment = async (prismaClient, paymentId, reason, actor) => {
    const reversalReason = text(reason);
    if (!reversalReason) throw new FinancialDomainError('PAYABLE_REVERSAL_REASON_REQUIRED', 'Indica por qué se revierte el pago.');
    if (reversalReason.length > PAYABLE_REASON_MAX) throw new FinancialDomainError('PAYABLE_REVERSAL_REASON_TOO_LONG', `El motivo admite como máximo ${PAYABLE_REASON_MAX} caracteres.`);
    const actorId = actorIdFrom(actor);
    try {
        return await prismaClient.$transaction(async (tx) => {
            const payment = await tx.payablePayment.findUnique({ where: { id: paymentId }, include: { financialRecord: { include: { bankMatches: { where: { status: 'APPROVED' }, select: { id: true } } } } } });
            if (!payment) throw new FinancialDomainError('PAYABLE_PAYMENT_NOT_FOUND', 'El pago no existe.', 404);
            if (payment.reversedAt) throw new FinancialDomainError('PAYABLE_PAYMENT_ALREADY_REVERSED', 'El pago ya fue revertido.', 409);
            if (payment.financialRecord?.bankMatches?.length) throw new FinancialDomainError('PAYABLE_PAYMENT_RECONCILED', 'El egreso de este pago tiene una conciliación bancaria aprobada. Primero hay que deshacer esa conciliación.', 409);
            const paidDate = new Date(payment.paidAt);
            await assertOpenFinancialPeriod(tx, paidDate.getUTCFullYear(), paidDate.getUTCMonth() + 1);
            const now = new Date();
            const reversed = await tx.payablePayment.update({ where: { id: paymentId }, data: { reversedAt: now, reversalReason, reversedById: actorId } });
            if (payment.financialRecord && payment.financialRecord.status !== 'VOIDED') {
                const voided = await tx.financialRecord.update({ where: { id: payment.financialRecord.id }, data: { status: 'VOIDED', voidedAt: now, voidReason: `Pago de cuenta por pagar revertido: ${reversalReason}` } });
                await tx.financialAuditEvent.create({ data: { entityType: 'FinancialRecord', entityId: voided.id, action: 'VOID', before: cloneForAudit(payment.financialRecord), after: cloneForAudit(voided), actorId } });
            }
            const payable = await tx.accountsPayable.findUnique({ where: { id: payment.payableId }, include: PAYABLE_INCLUDE });
            const totalCents = financialCents(payable.amount) || 0;
            const updated = await tx.accountsPayable.update({ where: { id: payable.id }, data: { status: payableStatusAfter({ amountCents: totalCents, paidCents: paidCentsOf(payable), voided: payable.status === 'ANULADA' }) }, include: PAYABLE_INCLUDE });
            await tx.financialAuditEvent.create({ data: { entityType: 'PayablePayment', entityId: paymentId, action: 'VOID', before: cloneForAudit(payment), after: cloneForAudit(reversed), actorId } });
            return { payment: reversed, payable: serializePayable(updated) };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034') throw new FinancialDomainError('PAYABLE_PAYMENT_CONFLICT', 'Otro proceso modificó el pago. Actualiza los datos y vuelve a intentarlo.', 409);
        throw error;
    }
};
