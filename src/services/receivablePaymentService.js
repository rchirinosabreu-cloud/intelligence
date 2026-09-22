import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

const PAYMENT_CATEGORIES = new Set(['MEMBRESIA', 'SERVICIO', 'PAUTA']);
export const REVERSAL_REASON_MAX = 300;
// Los abonos se leen ya filtrados, pero el saldo vuelve a comprobar `reversedAt`:
// una consulta futura que olvide el filtro no puede inventar dinero aplicado.
const activePaymentsOf = (receivable) => (receivable.payments || []).filter((payment) => !payment.reversedAt);
const normalizeText = (value) => String(value || '').trim() || null;
const outstandingCentsOf = (receivable) => {
    const amountCents = financialCents(receivable.amount);
    let paidCents = 0;
    for (const payment of activePaymentsOf(receivable)) {
        const cents = financialCents(payment.amount);
        if (cents === null || !Number.isSafeInteger(paidCents + cents)) {
            throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'Los pagos históricos requieren revisión de precisión antes de registrar otro abono.', 409);
        }
        paidCents += cents;
    }
    if (amountCents === null || amountCents <= 0 || paidCents > amountCents) {
        throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'El saldo histórico requiere revisión antes de registrar otro abono.', 409);
    }
    return amountCents - paidCents;
};
const incompatibleRecord = () => new FinancialDomainError(
    'RECEIVABLE_PAYMENT_RECORD_INCOMPATIBLE',
    'El ingreso debe estar registrado, corresponder al mismo cliente, cuenta, fecha, categoría e importe completo y no estar aplicado a otro pago. No se permite dividir ingresos en esta operación.',
    409
);

export const createReceivablePayment = async (prismaClient, receivableId, input = {}, actor) => {
    const amountCents = financialCents(input.amount);
    if (amountCents === null || amountCents <= 0) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_AMOUNT_INVALID', 'El pago debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
    }
    const amount = financialAmountFromCents(amountCents);
    const { date: paidAt, year, month } = parseFinancialDateInput(input.paidAt);
    const actorId = actor?.id || actor?.userId || null;
    const accountId = String(input.accountId || '').trim();
    if (!accountId) {
        throw new FinancialDomainError(
            'RECEIVABLE_PAYMENT_ACCOUNT_REQUIRED',
            'Selecciona la cuenta donde se recibio el pago.'
        );
    }

    const financialRecordId = normalizeText(input.financialRecordId);
    const category = normalizeText(input.category)?.toUpperCase() || null;
    if (!financialRecordId && !PAYMENT_CATEGORIES.has(category)) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_CATEGORY_INVALID', 'Selecciona si el pago corresponde a una membresía, servicio o pauta.');
    }
    let requestId = null;
    if (input.requestId !== undefined && input.requestId !== null) {
        requestId = String(input.requestId).trim().toLowerCase();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_REQUEST_ID_INVALID', 'El identificador del intento de pago no es válido.');
        }
    }
    const reference = normalizeText(input.reference);
    const notes = normalizeText(input.notes);
    const paymentId = requestId ? `receivable-payment:${requestId}` : null;
    const auditId = requestId ? `receivable-payment-request:${requestId}` : null;
    const requestFingerprint = requestId ? createHash('sha256').update(JSON.stringify({
        receivableId, actorId, amount, paidAt: paidAt.toISOString().slice(0, 10), accountId, category, financialRecordId, reference, notes
    })).digest('hex') : null;

    try {
        return await prismaClient.$transaction(async (tx) => {
            if (paymentId) {
                const previousPayment = await tx.receivablePayment.findUnique({
                    where: { id: paymentId },
                    include: { financialRecord: true, receivable: { include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, reversedAt: true } } } } }
                });
                if (previousPayment) {
                    const previousAudit = await tx.financialAuditEvent.findUnique({ where: { id: auditId } });
                    if (previousAudit?.after?.requestFingerprint !== requestFingerprint || previousPayment.receivableId !== receivableId) {
                        throw new FinancialDomainError('RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT', 'Este intento ya se utilizó para otro pago o con otros datos. Consulta el pago registrado antes de iniciar una operación nueva.', 409);
                    }
                    // Un reintento no puede resucitar un abono revertido ni volver a aplicarlo en silencio:
                    // para cobrarlo otra vez hay que registrarlo de nuevo, con su propio identificador.
                    if (previousPayment.reversedAt) {
                        throw new FinancialDomainError('RECEIVABLE_PAYMENT_REVERSED', 'Este intento corresponde a un abono que ya fue revertido. Registra un abono nuevo si el pago sigue vigente.', 409);
                    }
                    if (!previousPayment.financialRecord || !previousPayment.receivable) {
                        throw new FinancialDomainError('RECEIVABLE_PAYMENT_REPLAY_UNAVAILABLE', 'El pago ya existe, pero su vínculo requiere revisión. No se generó otro ingreso.', 409);
                    }
                    const { financialRecord, receivable, ...payment } = previousPayment;
                    return { payment, financialRecord, receivable, outstanding: financialAmountFromCents(outstandingCentsOf(receivable)), replayed: true };
                }
            }

            const receivable = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, reversedAt: true } } }
            });
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            if (receivable.status === 'PAGADO') {
                throw new FinancialDomainError('RECEIVABLE_ALREADY_PAID', 'La cuenta por cobrar figura pagada. Revisa su historial antes de registrar otro cobro; no se inferirá un saldo nuevo.', 409);
            }

            const client = receivable.clientId ? await tx.client.findUnique({ where: { id: receivable.clientId }, select: { id: true } }) : null;
            if (!client) throw new FinancialDomainError('RECEIVABLE_CLIENT_NOT_FOUND', 'La cuenta por cobrar debe estar vinculada a un cliente existente.', 409);
            const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { id: true, isActive: true, currency: true } });
            if (!account?.isActive) throw new FinancialDomainError('RECEIVABLE_PAYMENT_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
            if (account.currency !== 'COP' || (receivable.metadata?.currency && receivable.metadata.currency !== 'COP')) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_CURRENCY_UNSUPPORTED', 'Este flujo de cartera admite pagos en COP. No se aplican conversiones de moneda automáticamente.', 409);
            }

            const outstandingBeforeCents = outstandingCentsOf(receivable);
            const outstandingBefore = financialAmountFromCents(outstandingBeforeCents);
            if (amountCents > outstandingBeforeCents) {
                throw new FinancialDomainError(
                    'RECEIVABLE_OVERPAYMENT',
                    'El pago supera el saldo pendiente de la cuenta por cobrar.',
                    409
                );
            }

            await assertOpenFinancialPeriod(tx, year, month);
            let financialRecord;
            if (financialRecordId) {
                financialRecord = await tx.financialRecord.findUnique({
                    where: { id: financialRecordId },
                    include: { receivablePayment: { select: { id: true } }, payrollTransaction: { select: { id: true } } }
                });
                const recordDate = financialRecord?.date ? new Date(financialRecord.date) : null;
                const sameDay = recordDate && !Number.isNaN(recordDate.getTime()) && recordDate.toISOString().slice(0, 10) === paidAt.toISOString().slice(0, 10);
                if (!financialRecord || financialRecord.status !== 'POSTED' || financialRecord.scenario !== 'ACTUAL' || financialRecord.isProjection === true ||
                    financialRecord.year !== year || financialRecord.month !== month ||
                    financialRecord.type !== 'INCOME' || financialRecord.origin === 'SYSTEM' ||
                    financialRecord.receivablePayment || financialRecord.payrollTransaction ||
                    financialRecord.clientId !== receivable.clientId || financialRecord.accountId !== accountId ||
                    financialCents(financialRecord.amount) !== amountCents || !sameDay ||
                    !PAYMENT_CATEGORIES.has(financialRecord.category) || (category && financialRecord.category !== category)) {
                    throw incompatibleRecord();
                }
            } else {
                financialRecord = await tx.financialRecord.create({
                    data: {
                        amount,
                        category,
                        type: 'INCOME',
                        section: 'REVENUE',
                        date: paidAt,
                        year,
                        month,
                        clientId: receivable.clientId || null,
                        createdById: actorId,
                        accountId,
                        description: `Pago de cartera: ${receivable.sourceLabel || receivable.notes || receivableId}`,
                        scenario: 'ACTUAL',
                        status: 'POSTED',
                        origin: 'SYSTEM',
                        isProjection: false,
                        reference,
                        notes,
                        postedAt: new Date(),
                        metadata: { receivableId }
                    }
                });
            }
            const payment = await tx.receivablePayment.create({
                data: {
                    ...(paymentId ? { id: paymentId } : {}),
                    receivableId,
                    accountId,
                    financialRecordId: financialRecord.id,
                    amount,
                    paidAt,
                    reference,
                    notes,
                    createdById: actorId
                }
            });
            const outstandingCents = outstandingBeforeCents - amountCents;
            const outstanding = financialAmountFromCents(outstandingCents);
            const updatedReceivable = await tx.accountsReceivable.update({
                where: { id: receivableId },
                data: { status: outstandingCents === 0 ? 'PAGADO' : (receivable.status === 'PROMESADO' ? 'PROMESADO' : 'DEBE') }
            });
            await tx.financialAuditEvent.create({
                data: {
                    ...(auditId ? { id: auditId } : {}),
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'PAYMENT',
                    before: { status: receivable.status, outstanding: outstandingBefore },
                    after: { status: updatedReceivable.status, outstanding, paymentId: payment.id, financialRecordId: financialRecord.id, appliedExistingIncome: Boolean(financialRecordId), ...(requestFingerprint ? { requestFingerprint } : {}) },
                    actorId
                }
            });
            if (!financialRecordId) await tx.financialAuditEvent.create({
                data: {
                    entityType: 'FinancialRecord',
                    entityId: financialRecord.id,
                    action: 'CREATE',
                    after: JSON.parse(JSON.stringify(financialRecord)),
                    actorId
                }
            });

            return { payment, financialRecord, receivable: updatedReceivable, outstanding, replayed: false };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_CONFLICT', 'Otro proceso modificó el pago o la cuenta por cobrar. Actualiza los datos y reintenta conservando el mismo identificador para no duplicar el ingreso.', 409);
        }
        throw error;
    }
};

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

/**
 * Revierte un abono mal registrado y corrige todos sus efectos en una sola transacción.
 *
 * El abono nunca se borra: queda marcado con su motivo y deja de sumar, de modo que la
 * cartera vuelve al saldo que tenía antes sin perder la evidencia de lo ocurrido.
 *
 * El ingreso asociado se trata según su origen:
 *  - SYSTEM: lo creó este mismo flujo, así que se anula. Ese dinero no existía por su cuenta.
 *  - MANUAL/IMPORT: es un ingreso que ya estaba registrado y solo se había aplicado a la
 *    cartera. Se desvincula y se conserva intacto, para poder aplicarlo donde corresponda.
 */
export const reverseReceivablePayment = async (prismaClient, paymentId, input = {}, actor) => {
    const reason = String(input.reason || '').trim();
    if (!reason) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_REVERSAL_REASON_REQUIRED', 'Explica por qué se revierte el abono.');
    }
    if (reason.length > REVERSAL_REASON_MAX) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_REVERSAL_REASON_TOO_LONG', `El motivo admite como máximo ${REVERSAL_REASON_MAX} caracteres.`);
    }
    const actorId = actor?.id || actor?.userId || null;

    try {
        return await prismaClient.$transaction(async (tx) => {
            const payment = await tx.receivablePayment.findUnique({
                where: { id: paymentId },
                include: {
                    financialRecord: true,
                    receivable: { include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { id: true, amount: true, reversedAt: true } } } }
                }
            });
            if (!payment) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_NOT_FOUND', 'El abono no existe.', 404);
            }
            if (payment.reversedAt) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_ALREADY_REVERSED', 'Este abono ya fue revertido.', 409);
            }
            const receivable = payment.receivable;
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar del abono no existe.', 409);
            }

            // El mes del abono y el del ingreso son el mismo por contrato, pero un cierre
            // parcial no puede dejar media reversión aplicada: se comprueban los dos.
            const paidAt = new Date(payment.paidAt);
            if (Number.isNaN(paidAt.getTime())) {
                throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'La fecha del abono requiere revisión antes de revertirlo.', 409);
            }
            const { year, month } = parseFinancialDateInput(paidAt.toISOString().slice(0, 10));
            await assertOpenFinancialPeriod(tx, year, month);
            const record = payment.financialRecord;
            if (record && (record.year !== year || record.month !== month)) {
                await assertOpenFinancialPeriod(tx, record.year, record.month);
            }

            const amountCents = financialCents(payment.amount);
            if (amountCents === null || amountCents <= 0) {
                throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'El importe del abono requiere revisión antes de revertirlo.', 409);
            }

            let voidedRecord = null;
            if (record && record.status !== 'VOIDED') {
                if (record.origin === 'SYSTEM') {
                    voidedRecord = await tx.financialRecord.update({
                        where: { id: record.id },
                        data: { status: 'VOIDED', voidedAt: new Date(), voidReason: `Reversión del abono: ${reason}` }
                    });
                    await tx.financialAuditEvent.create({
                        data: {
                            entityType: 'FinancialRecord',
                            entityId: record.id,
                            action: 'VOID',
                            before: cloneForAudit(record),
                            after: cloneForAudit(voidedRecord),
                            actorId
                        }
                    });
                }
            }

            const reversedPayment = await tx.receivablePayment.update({
                where: { id: paymentId },
                data: {
                    reversedAt: new Date(),
                    reversalReason: reason,
                    reversedById: actorId,
                    // Se suelta el vínculo para que un ingreso preexistente vuelva a estar
                    // disponible; el enlace original queda en `before` de la auditoría.
                    financialRecordId: null
                }
            });

            let paidCents = 0;
            for (const other of receivable.payments) {
                if (other.id === paymentId || other.reversedAt) continue;
                const cents = financialCents(other.amount);
                if (cents === null || !Number.isSafeInteger(paidCents + cents)) {
                    throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'Los abonos restantes requieren revisión de precisión antes de revertir este.', 409);
                }
                paidCents += cents;
            }
            const totalCents = financialCents(receivable.amount);
            if (totalCents === null || totalCents <= 0 || paidCents > totalCents) {
                throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'El saldo de la cuenta por cobrar requiere revisión antes de revertir un abono.', 409);
            }
            const outstandingCents = totalCents - paidCents;
            const outstanding = financialAmountFromCents(outstandingCents);
            const updatedReceivable = await tx.accountsReceivable.update({
                where: { id: receivable.id },
                data: { status: outstandingCents === 0 ? 'PAGADO' : (receivable.status === 'PROMESADO' ? 'PROMESADO' : 'DEBE') }
            });

            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'ReceivablePayment',
                    entityId: paymentId,
                    action: 'VOID',
                    // El abono tal como estaba, con su vínculo al ingreso: es la evidencia de lo revertido.
                    before: cloneForAudit({ ...payment, financialRecord: undefined, receivable: undefined }),
                    after: {
                        reversalReason: reason,
                        reversedAt: reversedPayment.reversedAt,
                        receivableId: receivable.id,
                        receivableStatus: updatedReceivable.status,
                        outstanding,
                        unlinkedFinancialRecordId: record?.id || null,
                        voidedFinancialRecordId: voidedRecord?.id || null
                    },
                    actorId
                }
            });

            return { payment: reversedPayment, receivable: updatedReceivable, outstanding, voidedRecord, unlinkedRecordId: voidedRecord ? null : (record?.id || null) };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_CONFLICT', 'Otro proceso modificó el abono o la cuenta por cobrar. Actualiza los datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};
