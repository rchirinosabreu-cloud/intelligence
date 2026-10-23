import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';
import { RETENTION_KIND, isReceivableClosed, normalizeRetentions, receivableStatusAfter, retentionsProblem } from '../lib/receivableSettlement.js';
import { isLoanReceivable } from '../lib/receivableLoans.js';
import { normalizeReceivableCurrency } from '../lib/receivableCurrency.js';

const PAYMENT_CATEGORIES = new Set(['MEMBRESIA', 'SERVICIO', 'PAUTA']);
export const REVERSAL_REASON_MAX = 300;
// Los abonos se leen ya filtrados, pero el saldo vuelve a comprobar `reversedAt`:
// una consulta futura que olvide el filtro no puede inventar dinero aplicado.
const activePaymentsOf = (receivable) => (receivable.payments || []).filter((payment) => !payment.reversedAt);
const normalizeText = (value) => String(value || '').trim() || null;
// Lo que falta por cobrar: el valor menos todo lo aplicado y vigente, sea dinero o un
// ajuste (acuerdo, canje, compensación, condonación). Lo usa también el cierre de deuda.
export const outstandingCentsOf = (receivable) => {
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
    const requestedCategory = normalizeText(input.category)?.toUpperCase() || null;
    // Lo que el cliente retuvo de este mismo pago (Elisa, 22 de octubre de 2026, Fundación Grit):
    // entra en la misma transacción como filas RETENCION, sin ingreso, y cierra la cuenta como pagada.
    const retentionProblem = retentionsProblem(input.retentions);
    if (retentionProblem) throw new FinancialDomainError('RECEIVABLE_RETENTION_INVALID', retentionProblem);
    const retentions = normalizeRetentions(input.retentions).map((item) => {
        const cents = financialCents(item.amount);
        if (cents === null || cents <= 0) throw new FinancialDomainError('RECEIVABLE_RETENTION_INVALID', 'Cada retención debe ser positiva y tener como máximo dos decimales.');
        return { type: item.type, cents };
    });
    const retentionCents = retentions.reduce((sum, item) => sum + item.cents, 0);
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
        receivableId, actorId, amount, paidAt: paidAt.toISOString().slice(0, 10), accountId, category: requestedCategory, financialRecordId, reference, notes,
        ...(retentions.length ? { retentions: retentions.map((item) => [item.type, item.cents]) } : {})
    })).digest('hex') : null;

    try {
        return await prismaClient.$transaction(async (tx) => {
            if (paymentId) {
                const previousPayment = await tx.receivablePayment.findUnique({
                    where: { id: paymentId },
                    include: { financialRecord: true, receivable: { include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, kind: true, reversedAt: true } } } } }
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
                include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, kind: true, reversedAt: true } } }
            });
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            if (isReceivableClosed(receivable.status)) {
                throw new FinancialDomainError('RECEIVABLE_ALREADY_PAID', receivable.status === 'SALDADO'
                    ? 'La cuenta por cobrar figura saldada por acuerdo, canje, compensación o condonación. Revisa su historial antes de registrar otro cobro; para reabrirla, revierte el ajuste.'
                    : 'La cuenta por cobrar figura pagada. Revisa su historial antes de registrar otro cobro; no se inferirá un saldo nuevo.', 409);
            }

            // La devolución de un préstamo es un reintegro (Rodny, 20 de octubre de 2026): siempre
            // categoría PRESTAMO y sección FINANCING, sin pedir concepto, y sin exigir cliente porque
            // a un colaborador o a un socio no se le abre ficha de cliente.
            const isLoan = isLoanReceivable(receivable);
            if (isLoan && retentions.length) {
                throw new FinancialDomainError('RECEIVABLE_RETENTION_INVALID', 'El reintegro de un préstamo no lleva retenciones.');
            }
            const category = isLoan ? 'PRESTAMO' : requestedCategory;
            if (!isLoan && !financialRecordId && !PAYMENT_CATEGORIES.has(category)) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_CATEGORY_INVALID', 'Selecciona si el pago corresponde a una membresía, servicio o pauta.');
            }
            const client = receivable.clientId ? await tx.client.findUnique({ where: { id: receivable.clientId }, select: { id: true } }) : null;
            if (!client && !isLoan) throw new FinancialDomainError('RECEIVABLE_CLIENT_NOT_FOUND', 'La cuenta por cobrar debe estar vinculada a un cliente existente.', 409);
            const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { id: true, isActive: true, currency: true } });
            if (!account?.isActive) throw new FinancialDomainError('RECEIVABLE_PAYMENT_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
            if (account.currency !== 'COP' || (receivable.metadata?.currency && receivable.metadata.currency !== 'COP')) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_CURRENCY_UNSUPPORTED', 'Este flujo de cartera admite pagos en COP. No se aplican conversiones de moneda automáticamente.', 409);
            }

            const outstandingWithRetentionsCents = outstandingCentsOf(receivable);
            const outstandingBefore = financialAmountFromCents(outstandingWithRetentionsCents);
            if (retentionCents > outstandingWithRetentionsCents) {
                throw new FinancialDomainError('RECEIVABLE_RETENTION_EXCEEDS_BALANCE', 'Las retenciones superan el saldo pendiente de la cuenta por cobrar.', 409);
            }
            // El dinero se compara con lo que queda después de lo retenido: la retención no es plata
            // que entró, pero sí cubre esa parte de la deuda.
            const outstandingBeforeCents = outstandingWithRetentionsCents - retentionCents;
            // Una cuenta en dólares guarda en cartera los pesos de la TRM del día en que se creó,
            // y el depósito llega con la tasa del día (Foobspain, 19 de octubre de 2026: Elisa
            // «registró el máximo permitido» porque el pago real no cabía). La cartera se ajusta
            // a lo que de verdad entró: hacia arriba sola, hacia abajo solo si quien registra dice
            // que con ese pago la cuenta queda al día. En pesos no hay tasa que lo explique.
            const isUsd = normalizeReceivableCurrency(receivable.currency) === 'USD';
            const settlesInFull = input.settlesInFull === true || input.settlesInFull === 'true';
            let exchangeAdjustment = null;
            if (amountCents > outstandingBeforeCents) {
                if (!isUsd) {
                    throw new FinancialDomainError('RECEIVABLE_OVERPAYMENT', 'El pago supera el saldo pendiente de la cuenta por cobrar.', 409);
                }
                const fromCents = financialCents(receivable.amount);
                exchangeAdjustment = { fromCents, toCents: fromCents + (amountCents - outstandingBeforeCents) };
            } else if (settlesInFull && amountCents < outstandingBeforeCents) {
                if (!isUsd) {
                    throw new FinancialDomainError('RECEIVABLE_SETTLES_IN_FULL_UNSUPPORTED', 'En pesos, dar por saldada una cuenta con menos dinero es un acuerdo: usa «Saldar de otra forma».', 409);
                }
                const fromCents = financialCents(receivable.amount);
                exchangeAdjustment = { fromCents, toCents: fromCents - (outstandingBeforeCents - amountCents) };
            }
            if (exchangeAdjustment) {
                const deltaCents = exchangeAdjustment.toCents - exchangeAdjustment.fromCents;
                exchangeAdjustment.difference = Math.sign(deltaCents) * Number(financialAmountFromCents(Math.abs(deltaCents)));
            }

            await assertOpenFinancialPeriod(tx, year, month);
            let financialRecord;
            if (financialRecordId) {
                financialRecord = await tx.financialRecord.findUnique({
                    where: { id: financialRecordId },
                    include: { receivablePayment: { select: { id: true } }, payrollTransaction: { select: { id: true } }, payrollPayment: { select: { id: true } } }
                });
                const recordDate = financialRecord?.date ? new Date(financialRecord.date) : null;
                const sameDay = recordDate && !Number.isNaN(recordDate.getTime()) && recordDate.toISOString().slice(0, 10) === paidAt.toISOString().slice(0, 10);
                if (!financialRecord || financialRecord.status !== 'POSTED' || financialRecord.scenario !== 'ACTUAL' || financialRecord.isProjection === true ||
                    financialRecord.year !== year || financialRecord.month !== month ||
                    financialRecord.type !== 'INCOME' || financialRecord.origin === 'SYSTEM' ||
                    financialRecord.receivablePayment || financialRecord.payrollTransaction || financialRecord.payrollPayment ||
                    (financialRecord.clientId || null) !== (receivable.clientId || null) || financialRecord.accountId !== accountId ||
                    financialCents(financialRecord.amount) !== amountCents || !sameDay ||
                    (isLoan ? financialRecord.category !== 'PRESTAMO' : (!PAYMENT_CATEGORIES.has(financialRecord.category) || (category && financialRecord.category !== category)))) {
                    throw incompatibleRecord();
                }
            } else {
                financialRecord = await tx.financialRecord.create({
                    data: {
                        amount,
                        category,
                        type: 'INCOME',
                        section: isLoan ? 'FINANCING' : 'REVENUE',
                        date: paidAt,
                        year,
                        month,
                        clientId: receivable.clientId || null,
                        createdById: actorId,
                        accountId,
                        ...(isLoan ? { counterparty: receivable.counterpartyName || null } : {}),
                        description: isLoan
                            ? `Reintegro de préstamo: ${receivable.counterpartyName || receivable.sourceLabel || receivableId}`
                            : `Pago de cartera: ${receivable.sourceLabel || receivable.notes || receivableId}`,
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
            const retentionPayments = [];
            for (const retention of retentions) {
                retentionPayments.push(await tx.receivablePayment.create({
                    data: {
                        receivableId,
                        kind: RETENTION_KIND,
                        amount: financialAmountFromCents(retention.cents),
                        paidAt,
                        detail: { retentionType: retention.type, withPaymentId: payment.id },
                        createdById: actorId
                    }
                }));
            }
            const outstandingCents = exchangeAdjustment ? 0 : outstandingBeforeCents - amountCents;
            const outstanding = financialAmountFromCents(outstandingCents);
            const updatedReceivable = await tx.accountsReceivable.update({
                where: { id: receivableId },
                data: {
                    status: receivableStatusAfter({ outstandingCents, payments: [...receivable.payments, payment, ...retentionPayments], currentStatus: receivable.status }),
                    ...(exchangeAdjustment ? {
                        amount: financialAmountFromCents(exchangeAdjustment.toCents),
                        metadata: {
                            ...(receivable.metadata && typeof receivable.metadata === 'object' ? receivable.metadata : {}),
                            exchangeAdjustments: [
                                ...(Array.isArray(receivable.metadata?.exchangeAdjustments) ? receivable.metadata.exchangeAdjustments : []),
                                { at: new Date().toISOString(), paymentId: payment.id, fromCents: exchangeAdjustment.fromCents, toCents: exchangeAdjustment.toCents }
                            ]
                        }
                    } : {})
                }
            });
            if (exchangeAdjustment) await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'UPDATE',
                    before: { amount: financialAmountFromCents(exchangeAdjustment.fromCents), outstanding: outstandingBefore },
                    after: { operation: 'EXCHANGE_ADJUSTMENT', amount: financialAmountFromCents(exchangeAdjustment.toCents), difference: exchangeAdjustment.difference, paymentId: payment.id, paidAmount: amount },
                    actorId
                }
            });
            await tx.financialAuditEvent.create({
                data: {
                    ...(auditId ? { id: auditId } : {}),
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'PAYMENT',
                    before: { status: receivable.status, outstanding: outstandingBefore },
                    after: {
                        status: updatedReceivable.status, outstanding, paymentId: payment.id, financialRecordId: financialRecord.id, appliedExistingIncome: Boolean(financialRecordId),
                        ...(retentionPayments.length ? { retentions: retentionPayments.map((row) => ({ paymentId: row.id, type: row.detail.retentionType, amount: row.amount })) } : {}),
                        ...(requestFingerprint ? { requestFingerprint } : {})
                    },
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

            return { payment, financialRecord, receivable: updatedReceivable, outstanding, exchangeAdjustment, retentionPayments, replayed: false };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_CONFLICT', 'Otro proceso modificó el pago o la cuenta por cobrar. Actualiza los datos y reintenta conservando el mismo identificador para no duplicar el ingreso.', 409);
        }
        throw error;
    }
};

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

const sumOtherPaymentsCents = (payments, exceptId) => {
    let total = 0;
    for (const other of payments || []) {
        if (other.id === exceptId || other.reversedAt) continue;
        const cents = financialCents(other.amount);
        if (cents === null || !Number.isSafeInteger(total + cents)) {
            throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'Los abonos de esta cuenta requieren revisión de precisión antes de corregir uno.', 409);
        }
        total += cents;
    }
    return total;
};

/**
 * Corrige un abono ya registrado (Rodny, 20 de octubre de 2026: «debe tener la opción de editar lo
 * que ingresó o el valor registrado para no revertirlo»). Valor, fecha, cuenta, referencia y
 * notas; cambiar el dinero —valor, fecha o cuenta— exige motivo y queda en la bitácora con el
 * antes y el después. El ingreso que creó el abono cambia con él en la misma transacción: nunca
 * quedan desacoplados. Un ingreso que ya existía (MANUAL/IMPORT) no se reescribe desde aquí: se
 * corrige en Movimientos, o se revierte el abono y se aplica otro. En dólares rige la misma regla
 * del registro: si entró más que la cartera en pesos, la cartera se ajusta a lo que entró; si ese
 * abono ya la había ajustado, el ajuste se rehace desde el valor anterior, nunca se acumula.
 */
export const updateReceivablePayment = async (prismaClient, paymentId, input = {}, actor) => {
    const actorId = actor?.id || actor?.userId || null;
    const wantsAmount = input.amount !== undefined && input.amount !== null && input.amount !== '';
    const wantsDate = input.paidAt !== undefined && input.paidAt !== null && input.paidAt !== '';
    const wantsAccount = input.accountId !== undefined && input.accountId !== null && input.accountId !== '';
    const wantsReference = input.reference !== undefined;
    const wantsNotes = input.notes !== undefined;
    const reason = String(input.reason || '').trim();
    if (reason.length > REVERSAL_REASON_MAX) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_EDIT_REASON_TOO_LONG', `El motivo admite como máximo ${REVERSAL_REASON_MAX} caracteres.`);
    }
    const touchesMoney = wantsAmount || wantsDate || wantsAccount;
    if (touchesMoney && !reason) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_EDIT_REASON_REQUIRED', 'Explica por qué se corrige el valor, la fecha o la cuenta: queda en la bitácora.');
    }
    let amountCents = null;
    if (wantsAmount) {
        amountCents = financialCents(input.amount);
        if (amountCents === null || amountCents <= 0) {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_AMOUNT_INVALID', 'El valor debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
        }
    }
    const newDate = wantsDate ? parseFinancialDateInput(input.paidAt) : null;
    const newAccountId = wantsAccount ? String(input.accountId).trim() : null;
    const settlesInFull = input.settlesInFull === true || input.settlesInFull === 'true';

    try {
        return await prismaClient.$transaction(async (tx) => {
            const payment = await tx.receivablePayment.findUnique({
                where: { id: paymentId },
                include: {
                    financialRecord: true,
                    receivable: { include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { id: true, amount: true, kind: true, reversedAt: true } } } }
                }
            });
            if (!payment) throw new FinancialDomainError('RECEIVABLE_PAYMENT_NOT_FOUND', 'El abono no existe.', 404);
            if (payment.reversedAt) throw new FinancialDomainError('RECEIVABLE_PAYMENT_ALREADY_REVERSED', 'Este abono ya fue revertido: no se corrige, se registra uno nuevo.', 409);
            const receivable = payment.receivable;
            if (!receivable) throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar del abono no existe.', 409);
            const isCash = !payment.kind || payment.kind === 'PAGO';
            if (!isCash && wantsAccount) {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_EDIT_INVALID', 'Un acuerdo, canje, compensación o condonación no tiene cuenta: no entró dinero.');
            }
            const record = payment.financialRecord;
            if (isCash && touchesMoney && record && record.origin !== 'SYSTEM') {
                throw new FinancialDomainError('RECEIVABLE_PAYMENT_RECORD_EXTERNAL', 'Este abono se aplicó sobre un ingreso que ya existía en Movimientos. Corrige ese movimiento allá, o revierte el abono y aplica el ingreso correcto.', 409);
            }

            const oldPaidAt = new Date(payment.paidAt);
            if (Number.isNaN(oldPaidAt.getTime())) throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'La fecha del abono requiere revisión antes de corregirlo.', 409);
            const oldPeriod = parseFinancialDateInput(oldPaidAt.toISOString().slice(0, 10));
            if (touchesMoney) {
                await assertOpenFinancialPeriod(tx, oldPeriod.year, oldPeriod.month);
                if (newDate) await assertOpenFinancialPeriod(tx, newDate.year, newDate.month);
                if (record && (record.year !== oldPeriod.year || record.month !== oldPeriod.month)) await assertOpenFinancialPeriod(tx, record.year, record.month);
            }
            if (newAccountId) {
                const account = await tx.financialAccount.findUnique({ where: { id: newAccountId }, select: { id: true, isActive: true, currency: true } });
                if (!account?.isActive) throw new FinancialDomainError('RECEIVABLE_PAYMENT_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
                if (account.currency !== 'COP') throw new FinancialDomainError('RECEIVABLE_PAYMENT_CURRENCY_UNSUPPORTED', 'Este flujo de cartera admite pagos en COP.', 409);
            }

            const previousCents = financialCents(payment.amount);
            const nextCents = wantsAmount ? amountCents : previousCents;
            const othersCents = sumOtherPaymentsCents(receivable.payments, paymentId);
            // En dólares, si este abono ya había ajustado la cartera por tasa, se parte del valor de
            // antes de ese ajuste y se rehace: nunca se acumula uno encima de otro.
            const isUsd = normalizeReceivableCurrency(receivable.currency) === 'USD';
            const previousAdjustments = Array.isArray(receivable.metadata?.exchangeAdjustments) ? receivable.metadata.exchangeAdjustments : [];
            const ownAdjustment = previousAdjustments.find((item) => item?.paymentId === paymentId) || null;
            const baseAmountCents = ownAdjustment ? Number(ownAdjustment.fromCents) : financialCents(receivable.amount);
            if (baseAmountCents === null || !Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
                throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'El valor de la cuenta por cobrar requiere revisión antes de corregir un abono.', 409);
            }
            const roomCents = baseAmountCents - othersCents;
            let exchangeAdjustment = null;
            let amountAfterCents = baseAmountCents;
            if (nextCents > roomCents) {
                if (!isUsd) throw new FinancialDomainError('RECEIVABLE_OVERPAYMENT', 'Con ese valor los abonos superarían el valor de la cuenta por cobrar.', 409);
                amountAfterCents = baseAmountCents + (nextCents - roomCents);
            } else if (isUsd && settlesInFull && nextCents < roomCents) {
                amountAfterCents = baseAmountCents - (roomCents - nextCents);
            }
            if (amountAfterCents !== financialCents(receivable.amount) || ownAdjustment) {
                if (amountAfterCents !== baseAmountCents || ownAdjustment) {
                    const deltaCents = amountAfterCents - baseAmountCents;
                    exchangeAdjustment = deltaCents === 0 ? null : { fromCents: baseAmountCents, toCents: amountAfterCents, difference: Math.sign(deltaCents) * Number(financialAmountFromCents(Math.abs(deltaCents))) };
                }
            }
            const outstandingCents = amountAfterCents - othersCents - nextCents;
            if (outstandingCents < 0) throw new FinancialDomainError('RECEIVABLE_OVERPAYMENT', 'Con ese valor los abonos superarían el valor de la cuenta por cobrar.', 409);

            const paymentData = {};
            if (wantsAmount) paymentData.amount = financialAmountFromCents(nextCents);
            if (newDate) paymentData.paidAt = newDate.date;
            if (newAccountId) paymentData.accountId = newAccountId;
            if (wantsReference) paymentData.reference = normalizeText(input.reference);
            if (wantsNotes) paymentData.notes = normalizeText(input.notes);
            const updatedPayment = await tx.receivablePayment.update({ where: { id: paymentId }, data: paymentData });

            let updatedRecord = null;
            if (isCash && record && record.origin === 'SYSTEM') {
                const recordData = {};
                if (wantsAmount) recordData.amount = financialAmountFromCents(nextCents);
                if (newDate) { recordData.date = newDate.date; recordData.year = newDate.year; recordData.month = newDate.month; }
                if (newAccountId) recordData.accountId = newAccountId;
                if (wantsReference) recordData.reference = normalizeText(input.reference);
                if (wantsNotes) recordData.notes = normalizeText(input.notes);
                if (Object.keys(recordData).length) {
                    updatedRecord = await tx.financialRecord.update({ where: { id: record.id }, data: recordData });
                    await tx.financialAuditEvent.create({
                        data: { entityType: 'FinancialRecord', entityId: record.id, action: 'UPDATE', before: cloneForAudit(record), after: cloneForAudit(updatedRecord), actorId }
                    });
                }
            }

            const statusAfter = receivableStatusAfter({
                outstandingCents,
                payments: receivable.payments.map((other) => (other.id === paymentId ? { ...other, kind: payment.kind } : other)),
                currentStatus: receivable.status
            });
            const amountChanged = amountAfterCents !== financialCents(receivable.amount);
            const adjustmentsChanged = Boolean(ownAdjustment) || Boolean(exchangeAdjustment);
            let updatedReceivable = receivable;
            if (statusAfter !== receivable.status || amountChanged || adjustmentsChanged) {
                const keptAdjustments = previousAdjustments.filter((item) => item?.paymentId !== paymentId);
                updatedReceivable = await tx.accountsReceivable.update({
                    where: { id: receivable.id },
                    data: {
                        status: statusAfter,
                        ...(amountChanged ? { amount: financialAmountFromCents(amountAfterCents) } : {}),
                        ...(adjustmentsChanged ? {
                            metadata: {
                                ...(receivable.metadata && typeof receivable.metadata === 'object' ? receivable.metadata : {}),
                                exchangeAdjustments: exchangeAdjustment
                                    ? [...keptAdjustments, { at: new Date().toISOString(), paymentId, fromCents: exchangeAdjustment.fromCents, toCents: exchangeAdjustment.toCents }]
                                    : keptAdjustments
                            }
                        } : {})
                    }
                });
                if (amountChanged) await tx.financialAuditEvent.create({
                    data: {
                        entityType: 'AccountsReceivable', entityId: receivable.id, action: 'UPDATE',
                        before: { amount: financialAmountFromCents(financialCents(receivable.amount)) },
                        after: { operation: 'EXCHANGE_ADJUSTMENT', amount: financialAmountFromCents(amountAfterCents), paymentId, reason },
                        actorId
                    }
                });
            }

            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'ReceivablePayment',
                    entityId: paymentId,
                    action: 'UPDATE',
                    before: cloneForAudit({ ...payment, financialRecord: undefined, receivable: undefined }),
                    after: cloneForAudit({ ...paymentData, reason: reason || null, receivableStatus: statusAfter, outstanding: financialAmountFromCents(outstandingCents), financialRecordId: record?.id || null }),
                    actorId
                }
            });

            return { payment: updatedPayment, financialRecord: updatedRecord || record || null, receivable: updatedReceivable, outstanding: financialAmountFromCents(outstandingCents), exchangeAdjustment };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_CONFLICT', 'Otro proceso modificó el abono o la cuenta por cobrar. Actualiza los datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};

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
                    receivable: { include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { id: true, amount: true, kind: true, reversedAt: true } } } }
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
                data: { status: receivableStatusAfter({ outstandingCents, payments: receivable.payments.filter((other) => other.id !== paymentId), currentStatus: receivable.status }) }
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
