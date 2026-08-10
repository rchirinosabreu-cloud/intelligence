import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

const toNumber = (value) => {
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value) || 0;
};

export const createReceivablePayment = async (prismaClient, receivableId, input = {}, actor) => {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_AMOUNT_INVALID', 'El pago debe ser mayor que cero.');
    }
    const { date: paidAt, year, month } = parseFinancialDateInput(input.paidAt);
    const actorId = actor?.id || actor?.userId || null;
    const accountId = String(input.accountId || '').trim();
    if (!accountId) {
        throw new FinancialDomainError(
            'RECEIVABLE_PAYMENT_ACCOUNT_REQUIRED',
            'Selecciona la cuenta donde se recibio el pago.'
        );
    }

    return prismaClient.$transaction(async (tx) => {
        const receivable = await tx.accountsReceivable.findUnique({
            where: { id: receivableId },
            include: { payments: { select: { amount: true } } }
        });
        if (!receivable) {
            throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
        }

        const paidBefore = receivable.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
        const outstandingBefore = Math.max(toNumber(receivable.amount) - paidBefore, 0);
        if (amount - outstandingBefore > 0.005) {
            throw new FinancialDomainError(
                'RECEIVABLE_OVERPAYMENT',
                'El pago supera el saldo pendiente de la cuenta por cobrar.',
                409
            );
        }

        await assertOpenFinancialPeriod(tx, year, month);
        const financialRecord = await tx.financialRecord.create({
            data: {
                amount,
                category: 'MEMBRESIA',
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
                reference: String(input.reference || '').trim() || null,
                notes: String(input.notes || '').trim() || null,
                postedAt: new Date(),
                metadata: { receivableId }
            }
        });
        const payment = await tx.receivablePayment.create({
            data: {
                receivableId,
                accountId,
                financialRecordId: financialRecord.id,
                amount,
                paidAt,
                reference: String(input.reference || '').trim() || null,
                notes: String(input.notes || '').trim() || null,
                createdById: actorId
            }
        });
        const outstanding = Math.max(outstandingBefore - amount, 0);
        const updatedReceivable = await tx.accountsReceivable.update({
            where: { id: receivableId },
            data: { status: outstanding <= 0.005 ? 'PAGADO' : 'DEBE' }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'AccountsReceivable',
                entityId: receivableId,
                action: 'PAYMENT',
                before: { status: receivable.status, outstanding: outstandingBefore },
                after: { status: updatedReceivable.status, outstanding, paymentId: payment.id },
                actorId
            }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialRecord',
                entityId: financialRecord.id,
                action: 'CREATE',
                after: JSON.parse(JSON.stringify(financialRecord)),
                actorId
            }
        });

        return { payment, financialRecord, receivable: updatedReceivable, outstanding };
    });
};
