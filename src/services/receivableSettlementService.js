import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import { assertOpenFinancialPeriod, FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';
import { outstandingCentsOf } from './receivablePaymentService.js';
import { SETTLEMENT_KINDS, isReceivableClosed, receivableStatusAfter, settlementDetail, settlementKindLabel, settlementProblem } from '../lib/receivableSettlement.js';
import { adjustmentsRange, summarizeAdjustments } from '../lib/receivableAdjustments.js';
import { loanCounterpartyLabel } from '../lib/receivableLoans.js';

const toNumber = (value) => (value === null || value === undefined ? 0 : (typeof value.toNumber === 'function' ? value.toNumber() : Number(value)) || 0);

/**
 * Resumen de ajustes de cartera del periodo (Rodny, 20 de octubre de 2026): cierres sin dinero
 * vigentes por su fecha, y la diferencia en cambio de las cuentas en dólares. Solo lee.
 */
export const listReceivableAdjustments = async (prismaClient, query = {}) => {
    const year = Number.parseInt(query.year, 10) || new Date().getUTCFullYear();
    const { from, to } = adjustmentsRange({ year, month: query.month });
    const [settlements, usdReceivables] = await Promise.all([
        prismaClient.receivablePayment.findMany({
            where: { kind: { in: SETTLEMENT_KINDS.map((kind) => kind.value) }, reversedAt: null, paidAt: { gte: from, lt: to } },
            include: { receivable: { include: { client: { select: { id: true, name: true, slug: true } } } } },
            orderBy: [{ paidAt: 'desc' }, { id: 'desc' }]
        }),
        prismaClient.accountsReceivable.findMany({
            where: { currency: 'USD' },
            select: { id: true, currency: true, foreignAmount: true, metadata: true, client: { select: { id: true, name: true, slug: true } } }
        })
    ]);
    const items = settlements.map((settlement) => {
        const receivable = settlement.receivable || {};
        const detail = settlement.detail && typeof settlement.detail === 'object' ? settlement.detail : {};
        return {
            id: settlement.id,
            receivableId: receivable.id || null,
            kind: settlement.kind,
            kindLabel: settlementKindLabel(settlement.kind),
            amount: toNumber(settlement.amount),
            originalAmount: toNumber(receivable.amount),
            date: settlement.paidAt instanceof Date ? settlement.paidAt.toISOString() : settlement.paidAt,
            clientId: receivable.client?.id || null,
            clientName: receivable.client?.name || receivable.counterpartyName || receivable.sourceLabel || 'Sin nombre',
            counterpartyLabel: receivable.kind === 'PRESTAMO' ? `Préstamo · ${loanCounterpartyLabel(receivable.counterpartyType)}` : null,
            reason: settlement.notes || null,
            authorizedBy: detail.authorizedBy || null,
            goods: detail.goods || null,
            destination: detail.destination || null,
            offsetAgainst: detail.offsetAgainst || null
        };
    });
    const exchangeAdjustments = [];
    for (const receivable of usdReceivables) {
        const list = Array.isArray(receivable.metadata?.exchangeAdjustments) ? receivable.metadata.exchangeAdjustments : [];
        for (const adjustment of list) {
            const at = new Date(adjustment.at);
            if (Number.isNaN(at.getTime()) || at < from || at >= to) continue;
            exchangeAdjustments.push({
                receivableId: receivable.id,
                clientId: receivable.client?.id || null,
                clientName: receivable.client?.name || 'Sin nombre',
                foreignAmount: toNumber(receivable.foreignAmount),
                date: at.toISOString(),
                fromCents: Number(adjustment.fromCents) || 0,
                toCents: Number(adjustment.toCents) || 0,
                from: (Number(adjustment.fromCents) || 0) / 100,
                to: (Number(adjustment.toCents) || 0) / 100,
                difference: ((Number(adjustment.toCents) || 0) - (Number(adjustment.fromCents) || 0)) / 100
            });
        }
    }
    exchangeAdjustments.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { year, month: adjustmentsRange({ year, month: query.month }).to - from < 32 * 24 * 3600 * 1000 ? Number.parseInt(query.month, 10) : null, items, exchangeAdjustments, summary: summarizeAdjustments({ settlements: items, exchangeAdjustments }) };
};

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
