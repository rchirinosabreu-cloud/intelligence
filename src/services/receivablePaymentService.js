import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

const PAYMENT_CATEGORIES = new Set(['MEMBRESIA', 'SERVICIO', 'PAUTA']);
const normalizeText = (value) => String(value || '').trim() || null;
const outstandingCentsOf = (receivable) => {
    const amountCents = financialCents(receivable.amount);
    let paidCents = 0;
    for (const payment of receivable.payments || []) {
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
                    include: { financialRecord: true, receivable: { include: { payments: { select: { amount: true } } } } }
                });
                if (previousPayment) {
                    const previousAudit = await tx.financialAuditEvent.findUnique({ where: { id: auditId } });
                    if (previousAudit?.after?.requestFingerprint !== requestFingerprint || previousPayment.receivableId !== receivableId) {
                        throw new FinancialDomainError('RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT', 'Este intento ya se utilizó para otro pago o con otros datos. Consulta el pago registrado antes de iniciar una operación nueva.', 409);
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
                include: { payments: { select: { amount: true } } }
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
