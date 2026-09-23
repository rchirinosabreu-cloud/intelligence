import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { createClientWith } from './clientService.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

const parseReceivableDueDate = (value) => {
    if (value === undefined || value === null || value === '') return null;
    try {
        return parseFinancialDateInput(value).date;
    } catch {
        throw new FinancialDomainError('RECEIVABLE_DUE_DATE_INVALID', 'La fecha de vencimiento debe ser una fecha válida en formato AAAA-MM-DD.');
    }
};

export const CLIENT_NAME_MAX = 120;

export const createReceivable = async (prismaClient, input = {}, actor) => {
    const clientId = String(input.clientId || '').trim();
    // Se puede crear la ficha del cliente aquí mismo (Rodny, 23 de septiembre de 2026):
    // registrar un cobro de alguien nuevo no debería obligar a salir a crearlo primero.
    const newClientName = String(input.client?.name || '').trim();
    if (!clientId && !newClientName) {
        throw new FinancialDomainError('RECEIVABLE_CLIENT_REQUIRED', 'Elige el cliente de la cuenta por cobrar, o escribe el nombre de uno nuevo.');
    }
    if (newClientName.length > CLIENT_NAME_MAX) {
        throw new FinancialDomainError('RECEIVABLE_CLIENT_NAME_TOO_LONG', `El nombre del cliente admite como máximo ${CLIENT_NAME_MAX} caracteres.`);
    }
    const amountCents = financialCents(input.amount);
    if (amountCents === null || amountCents <= 0) throw new FinancialDomainError('RECEIVABLE_AMOUNT_INVALID', 'El monto debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
    const amount = financialAmountFromCents(amountCents);
    const { date: period, year, month } = parseFinancialDateInput(input.period);
    const dueDate = parseReceivableDueDate(input.dueDate);
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        await assertOpenFinancialPeriod(tx, year, month);
        let client;
        if (clientId) {
            client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
            if (!client) throw new FinancialDomainError('RECEIVABLE_CLIENT_NOT_FOUND', 'El cliente seleccionado no existe.', 404);
        } else {
            // Dentro de la misma transacción: o quedan la ficha y el cobro, o ninguno.
            client = await createClientWith(tx, { name: newClientName });
            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'Client',
                    entityId: client.id,
                    action: 'CREATE',
                    after: cloneForAudit({ id: client.id, name: client.name, slug: client.slug }),
                    actorId
                }
            });
        }
        const receivable = await tx.accountsReceivable.create({
            data: {
                clientId: client.id,
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
    if (input.status !== undefined && !['DEBE', 'PROMESADO', 'PAGADO'].includes(input.status)) {
        throw new FinancialDomainError('RECEIVABLE_STATUS_INVALID', 'El estado de la cuenta por cobrar no es válido.');
    }

    try {
        return await prismaClient.$transaction(async (tx) => {
            const existing = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true, reversedAt: true } } }
            });
            if (!existing) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            const periodDate = new Date(existing.period);
            await assertOpenFinancialPeriod(tx, existing.year || periodDate.getUTCFullYear(), existing.month || periodDate.getUTCMonth() + 1);

            const amountCents = financialCents(input.amount === undefined ? existing.amount : input.amount);
            if (amountCents === null || amountCents <= 0) {
                if (input.amount === undefined) {
                    throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'El monto histórico requiere revisión antes de editar la cuenta por cobrar. No se cambió su saldo ni su estado.', 409);
                }
                throw new FinancialDomainError('RECEIVABLE_AMOUNT_INVALID', 'El monto de cartera debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
            }
            const amount = financialAmountFromCents(amountCents);
            let paidCents = 0;
            for (const payment of existing.payments || []) {
                if (payment.reversedAt) continue;
                const cents = financialCents(payment.amount);
                if (cents === null || !Number.isSafeInteger(paidCents + cents)) {
                    throw new FinancialDomainError('RECEIVABLE_BALANCE_INVALID', 'Los pagos históricos requieren revisión de precisión antes de editar la cuenta por cobrar.', 409);
                }
                paidCents += cents;
            }
            if (existing.status === 'PAGADO' && financialCents(existing.amount) !== paidCents) {
                throw new FinancialDomainError(
                    'RECEIVABLE_BALANCE_INVALID',
                    'La cuenta figura pagada, pero sus abonos no respaldan ese estado. Requiere revisión antes de editarla; no se cambió su saldo ni se reabrió el cobro.',
                    409
                );
            }
            if (paidCents > amountCents) {
                throw new FinancialDomainError(
                    'RECEIVABLE_AMOUNT_BELOW_PAYMENTS',
                    'El monto total no puede ser inferior a los pagos ya registrados.',
                    409
                );
            }

            const outstandingCents = amountCents - paidCents;
            if (input.status === 'PAGADO' && outstandingCents > 0) {
                throw new FinancialDomainError(
                    'RECEIVABLE_PAYMENT_REQUIRED',
                    'Registra el pago para marcar esta cuenta por cobrar como pagada.',
                    409
                );
            }

            let dueDate = existing.dueDate;
            if (input.dueDate !== undefined) {
                dueDate = parseReceivableDueDate(input.dueDate);
            }

            const data = {
                amount,
                status: outstandingCents === 0 ? 'PAGADO' : ((input.status ?? existing.status) === 'PROMESADO' ? 'PROMESADO' : 'DEBE'),
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
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034') {
            throw new FinancialDomainError('RECEIVABLE_CONFLICT', 'La cuenta por cobrar cambió durante la operación. Actualiza sus datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};
