import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

const toNumber = (value) => {
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value) || 0;
};

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

export const createReceivable = async (prismaClient, input = {}, actor) => {
    const clientId = String(input.clientId || '').trim();
    if (!clientId) throw new FinancialDomainError('RECEIVABLE_CLIENT_REQUIRED', 'Selecciona el cliente de la cuenta por cobrar.');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new FinancialDomainError('RECEIVABLE_AMOUNT_INVALID', 'El monto debe ser mayor que cero.');
    const { date: period, year, month } = parseFinancialDateInput(input.period);
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) throw new FinancialDomainError('RECEIVABLE_DUE_DATE_INVALID', 'La fecha de vencimiento no es válida.');
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        await assertOpenFinancialPeriod(tx, year, month);
        const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
        if (!client) throw new FinancialDomainError('RECEIVABLE_CLIENT_NOT_FOUND', 'El cliente seleccionado no existe.', 404);
        const receivable = await tx.accountsReceivable.create({
            data: {
                clientId,
                amount,
                period,
                year,
                month,
                dueDate,
                status: 'DEBE',
                origin: 'MANUAL',
                notes: String(input.notes || '').trim() || null,
                comments: String(input.comments || '').trim() || null,
                sourceLabel: client.name,
                metadata: { createdBy: actorId, origin: 'PLATFORM' }
            }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'AccountsReceivable',
                entityId: receivable.id,
                action: 'CREATE',
                after: cloneForAudit(receivable),
                actorId
            }
        });
        return receivable;
    });
};

export const updateReceivable = async (prismaClient, receivableId, input = {}, actor) => {
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.accountsReceivable.findUnique({
            where: { id: receivableId },
            include: { payments: { select: { amount: true } } }
        });
        if (!existing) {
            throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
        }
        const periodDate = new Date(existing.period);
        await assertOpenFinancialPeriod(tx, existing.year || periodDate.getUTCFullYear(), existing.month || periodDate.getUTCMonth() + 1);

        const paidAmount = (existing.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0);
        const amount = input.amount === undefined ? toNumber(existing.amount) : Number(input.amount);
        if (!Number.isFinite(amount) || amount < 0) {
            throw new FinancialDomainError('RECEIVABLE_AMOUNT_INVALID', 'El monto de cartera no es válido.');
        }
        if (paidAmount - amount > 0.005) {
            throw new FinancialDomainError(
                'RECEIVABLE_AMOUNT_BELOW_PAYMENTS',
                'El monto total no puede ser inferior a los pagos ya registrados.',
                409
            );
        }

        const outstanding = Math.max(amount - paidAmount, 0);
        if (input.status === 'PAGADO' && outstanding > 0.005) {
            throw new FinancialDomainError(
                'RECEIVABLE_PAYMENT_REQUIRED',
                'Registra el pago para marcar esta cuenta por cobrar como pagada.',
                409
            );
        }

        let dueDate = existing.dueDate;
        if (input.dueDate !== undefined) {
            dueDate = input.dueDate ? new Date(input.dueDate) : null;
            if (dueDate && Number.isNaN(dueDate.getTime())) {
                throw new FinancialDomainError('RECEIVABLE_DUE_DATE_INVALID', 'La fecha de vencimiento no es válida.');
            }
        }

        const data = {
            amount,
            status: outstanding <= 0.005 ? 'PAGADO' : (input.status === 'PROMESADO' ? 'PROMESADO' : 'DEBE'),
            dueDate,
            metadata: {
                ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
                editedBy: actorId,
                editedAt: new Date().toISOString()
            }
        };
        if (input.comments !== undefined) data.comments = input.comments;
        if (input.notes !== undefined) data.notes = input.notes;

        const receivable = await tx.accountsReceivable.update({
            where: { id: receivableId },
            data,
            include: {
                client: { select: { name: true, slug: true } },
                payments: {
                    include: { account: { select: { id: true, name: true } } },
                    orderBy: { paidAt: 'desc' }
                }
            }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'AccountsReceivable',
                entityId: receivableId,
                action: 'UPDATE',
                before: cloneForAudit(existing),
                after: cloneForAudit(receivable),
                actorId
            }
        });
        return receivable;
    });
};
