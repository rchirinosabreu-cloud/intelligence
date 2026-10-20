import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import { assertOpenFinancialPeriod, FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';
import { outstandingCentsOf } from './receivablePaymentService.js';
import { isReceivableClosed, receivableStatusAfter, settlementDetail, settlementProblem } from '../lib/receivableSettlement.js';

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

/**
 * Salda (total o parcialmente) una cuenta por cobrar sin que entre dinero: acuerdo por menor
 * valor, canje, compensación o condonación (Rodny, 20 de octubre de 2026).
 *
 * El cierre es una fila de `ReceivablePayment` con `kind` distinto de PAGO, sin cuenta ni
 * ingreso: nunca crea un `FinancialRecord`, así que las ventas no se inflan. La obligación
 * conserva su valor original; el dinero que de verdad entró sigue siendo lo único que cuenta
 * como ingreso. Queda quién autorizó, el motivo y, en un canje, qué entró y a dónde fue.
 * Revertirlo es el mismo «Revertir» de los abonos.
 */
export const settleReceivable = async (prismaClient, receivableId, input = {}, actor) => {
    const problem = settlementProblem({ ...input, outstanding: undefined });
    if (problem) throw new FinancialDomainError('RECEIVABLE_SETTLEMENT_INVALID', problem);
    const amountCents = financialCents(input.amount);
    if (amountCents === null || amountCents <= 0) {
        throw new FinancialDomainError('RECEIVABLE_SETTLEMENT_INVALID', 'El valor debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
    }
    const amount = financialAmountFromCents(amountCents);
    const { date: settledAt, year, month } = parseFinancialDateInput(input.settledAt);
    const actorId = actor?.id || actor?.userId || null;
    const kind = input.kind;
    const reason = String(input.reason).trim();
    const detail = settlementDetail(input);

    try {
        return await prismaClient.$transaction(async (tx) => {
            const receivable = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, kind: true, reversedAt: true } } }
            });
            if (!receivable) throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            if (isReceivableClosed(receivable.status)) {
                throw new FinancialDomainError('RECEIVABLE_ALREADY_CLOSED', 'Esta cuenta por cobrar ya está cerrada. Revisa su historial; si hace falta reabrirla, revierte el abono o el ajuste que la cerró.', 409);
            }
            const outstandingBeforeCents = outstandingCentsOf(receivable);
            if (amountCents > outstandingBeforeCents) {
                throw new FinancialDomainError('RECEIVABLE_SETTLEMENT_EXCEEDS_BALANCE', `El valor supera el saldo pendiente (${financialAmountFromCents(outstandingBeforeCents).toLocaleString('es-CO')}).`, 409);
            }
            await assertOpenFinancialPeriod(tx, year, month);

            const payment = await tx.receivablePayment.create({
                data: {
                    receivableId,
                    kind,
                    amount,
                    paidAt: settledAt,
                    notes: reason,
                    detail,
                    createdById: actorId
                }
            });
            const outstandingCents = outstandingBeforeCents - amountCents;
            const outstanding = financialAmountFromCents(outstandingCents);
            const status = receivableStatusAfter({
                outstandingCents,
                payments: [...receivable.payments, { kind, reversedAt: null }],
                currentStatus: receivable.status
            });
            const updatedReceivable = await tx.accountsReceivable.update({ where: { id: receivableId }, data: { status } });
            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'UPDATE',
                    before: { status: receivable.status, outstanding: financialAmountFromCents(outstandingBeforeCents) },
                    after: {
                        operation: 'SETTLEMENT',
                        kind,
                        amount,
                        settledAt: settledAt.toISOString().slice(0, 10),
                        reason,
                        detail: cloneForAudit(detail),
                        paymentId: payment.id,
                        status: updatedReceivable.status,
                        outstanding
                    },
                    actorId
                }
            });
            return { payment, receivable: updatedReceivable, outstanding };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('RECEIVABLE_PAYMENT_CONFLICT', 'Otro proceso modificó la cuenta por cobrar. Actualiza los datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};
