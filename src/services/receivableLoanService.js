import { resolveFinancialParty } from './financialPartySelection.js';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { assertOpenFinancialPeriod, FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';
import { LOAN_KIND, loanProblem } from '../lib/receivableLoans.js';
import { receivableStatusAfter } from '../lib/receivableSettlement.js';
import { createLoanReceivableFor } from './loanRecordSyncService.js';

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '').trim() || null;

const incompatibleRecord = () => new FinancialDomainError(
    'LOAN_RECORD_INCOMPATIBLE',
    'El egreso debe estar registrado, ser de categoría Préstamo, tener el mismo valor y fecha y no estar ya ligado a otro préstamo ni a otra operación.',
    409
);

/**
 * Registra un préstamo a un tercero (Rodny, 20 de octubre de 2026): el egreso que sacó el
 * dinero y la cuenta por cobrar que lo sigue en Cartera, en una sola transacción.
 *
 * El egreso va con categoría PRESTAMO y sección FINANCING —no es un gasto— y queda ligado a la
 * obligación por `loanRecordId`, así que desde Movimientos no se edita ni se anula suelto: se
 * elimina el préstamo en Cartera. Si el egreso ya estaba registrado a mano («cuando registro un
 * préstamo»), se liga ese y no se crea otro: el mismo dinero no sale dos veces del libro.
 */
export const createLoan = async (prismaClient, input = {}, actor) => {
    const problem = loanProblem(input);
    if (problem) throw new FinancialDomainError('LOAN_INVALID', problem);
    const amountCents = financialCents(input.amount);
    if (amountCents === null || amountCents <= 0) {
        throw new FinancialDomainError('LOAN_INVALID', 'El valor prestado debe ser positivo, tener como máximo dos decimales y estar dentro del rango de precisión financiera.');
    }
    const amount = financialAmountFromCents(amountCents);
    const { date: lentAt, year, month } = parseFinancialDateInput(input.lentAt);
    let dueDate = null;
    if (input.dueDate) {
        try { dueDate = parseFinancialDateInput(input.dueDate).date; } catch {
            throw new FinancialDomainError('LOAN_INVALID', 'La fecha acordada de devolución debe ser una fecha válida.');
        }
    }
    const actorId = actor?.id || actor?.userId || null;
    const counterpartyType = input.counterpartyType;
    const clientId = counterpartyType === 'CLIENTE' ? text(input.clientId) : null;
    const financialRecordId = text(input.financialRecordId);
    const accountId = text(input.accountId);
    const notes = text(input.notes);

    try {
        return await prismaClient.$transaction(async (tx) => {
            await assertOpenFinancialPeriod(tx, year, month);
            let client = null;
            if (clientId) {
                client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
                if (!client) throw new FinancialDomainError('RECEIVABLE_CLIENT_NOT_FOUND', 'El cliente seleccionado no existe.', 404);
            }
            const party = input.partySelection ? await resolveFinancialParty(tx,input.partySelection,actor) : null;
            if(party && clientId && party.clientId !== clientId) throw new FinancialDomainError('LOAN_PERSON_CHANGED','El cliente no corresponde a la persona seleccionada.',409);
            const counterpartyName = party?.name || (client ? client.name : text(input.counterpartyName));

            let financialRecord;
            if (financialRecordId) {
                financialRecord = await tx.financialRecord.findUnique({
                    where: { id: financialRecordId },
                    include: { loanReceivable: { select: { id: true } }, receivablePayment: { select: { id: true } }, payrollTransaction: { select: { id: true } }, payrollPayment: { select: { id: true } } }
                });
                const recordDate = financialRecord?.date ? new Date(financialRecord.date) : null;
                const sameDay = recordDate && !Number.isNaN(recordDate.getTime()) && recordDate.toISOString().slice(0, 10) === lentAt.toISOString().slice(0, 10);
                if (!financialRecord || financialRecord.status !== 'POSTED' || financialRecord.scenario !== 'ACTUAL' || financialRecord.isProjection === true ||
                    financialRecord.type !== 'EXPENSE' || financialRecord.category !== 'PRESTAMO' || financialRecord.origin === 'SYSTEM' ||
                    financialRecord.loanReceivable || financialRecord.receivablePayment || financialRecord.payrollTransaction || financialRecord.payrollPayment ||
                    financialCents(financialRecord.amount) !== amountCents || !sameDay) {
                    throw incompatibleRecord();
                }
            } else {
                const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { id: true, isActive: true, currency: true } });
                if (!account?.isActive) throw new FinancialDomainError('LOAN_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
                if (account.currency !== 'COP') throw new FinancialDomainError('LOAN_CURRENCY_UNSUPPORTED', 'Los préstamos se registran en pesos.', 409);
                financialRecord = await tx.financialRecord.create({
                    data: {
                        amount,
                        category: 'PRESTAMO',
                        type: 'EXPENSE',
                        section: 'FINANCING',
                        date: lentAt,
                        year,
                        month,
                        clientId,
                        createdById: actorId,
                        accountId,
                        counterparty: counterpartyName,
                        description: `Préstamo a ${counterpartyName}`,
                        scenario: 'ACTUAL',
                        status: 'POSTED',
                        origin: 'SYSTEM',
                        isProjection: false,
                        notes,
                        postedAt: new Date(),
                        metadata: { loan: true }
                    }
                });
                await tx.financialAuditEvent.create({
                    data: { entityType: 'FinancialRecord', entityId: financialRecord.id, action: 'CREATE', after: cloneForAudit(financialRecord), actorId }
                });
            }

            // La misma pieza que liga un egreso de Préstamo registrado en Movimientos: un préstamo
            // nace igual venga de donde venga.
            const receivable = await createLoanReceivableFor(tx, {
                financialRecord: { ...financialRecord, amount, date: lentAt, year, month },
                counterpartyType, counterpartyName, clientId, thirdPartyId: party?.id || null, dueDate, notes, actorId
            });
            return { receivable, financialRecord, linkedExistingRecord: Boolean(financialRecordId) };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034' || error?.code === 'P2002') {
            throw new FinancialDomainError('LOAN_CONFLICT', 'Otro proceso modificó el egreso o la cartera. Actualiza los datos y vuelve a intentarlo.', 409);
        }
        throw error;
    }
};

const loanCorrectionError = (code, message, status = 409) => new FinancialDomainError(code, message, status);
const isoDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

/**
 * Corrige un préstamo desde Cuentas por cobrar (Elisa, reunión de noviembre de 2026: «en todo
 * lo que haga un movimiento, los valores se tienen que poder modificar; siempre me puedo
 * equivocar»). Antes solo se podía eliminar y volver a registrar, y con reintegros ni eso.
 *
 * El préstamo y el egreso que sacó el dinero son un solo hecho: valor, fecha y cuenta cambian
 * en los dos dentro de la misma transacción, con motivo y con el antes y el después en la
 * auditoría. Los reintegros, descuentos de nómina y comprobantes se conservan; el valor nunca
 * puede quedar por debajo de lo que ya se aplicó.
 */
export const correctLoan = async (prismaClient, receivableId, input = {}, actor) => {
    const reason = text(input.reason);
    if (!reason || reason.length > 300) {
        throw loanCorrectionError('LOAN_CORRECTION_REASON_REQUIRED', 'Escribe el motivo de la corrección, en máximo 300 caracteres.', 400);
    }
    const amountCents = financialCents(input.amount);
    if (amountCents === null || amountCents <= 0) {
        throw loanCorrectionError('LOAN_INVALID', 'El valor prestado debe ser positivo y tener como máximo dos decimales.', 400);
    }
    const amount = financialAmountFromCents(amountCents);
    const { date: lentAt, year, month } = parseFinancialDateInput(input.lentAt);
    const actorId = actor?.id || actor?.userId || null;
    const requestedAccountId = text(input.accountId);

    try {
        return await prismaClient.$transaction(async (tx) => {
            const loan = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: { payments: true, loanRecord: { include: { allocations: { select: { id: true } } } } }
            });
            if (!loan || loan.kind !== LOAN_KIND) throw loanCorrectionError('LOAN_NOT_FOUND', 'El préstamo no existe.', 404);
            if (input.expectedUpdatedAt && new Date(loan.updatedAt).toISOString() !== input.expectedUpdatedAt) {
                throw loanCorrectionError('LOAN_CHANGED', 'El préstamo cambió mientras lo corregías. Actualiza la pantalla y vuelve a revisarlo.');
            }

            const active = (loan.payments || []).filter((payment) => !payment.reversedAt);
            let appliedCents = 0;
            for (const payment of active) {
                const cents = financialCents(payment.amount);
                if (cents === null) throw loanCorrectionError('LOAN_BALANCE_REVIEW', 'Un reintegro de este préstamo tiene un valor por verificar. Revísalo antes de corregir.');
                appliedCents += cents;
            }
            if (amountCents < appliedCents) {
                throw loanCorrectionError(
                    'LOAN_AMOUNT_BELOW_REPAYMENTS',
                    `A este préstamo ya se le aplicaron $${Number(financialAmountFromCents(appliedCents)).toLocaleString('es-CO')} entre reintegros y descuentos. El valor no puede quedar por debajo; si alguno sobra, reviértelo primero.`
                );
            }

            const record = loan.loanRecord && loan.loanRecord.status !== 'VOIDED' ? loan.loanRecord : null;
            if (record?.allocations?.length) {
                throw loanCorrectionError('LOAN_RECORD_SPLIT', 'El egreso de este préstamo tiene un desglose interno en Movimientos. Quita o ajusta ese desglose antes de cambiar el valor.');
            }
            const accountId = record ? (requestedAccountId || record.accountId) : null;
            const changed = financialCents(loan.amount) !== amountCents || isoDay(loan.period) !== isoDay(lentAt)
                || (record && (financialCents(record.amount) !== amountCents || isoDay(record.date) !== isoDay(lentAt) || record.accountId !== accountId));
            if (!changed) throw loanCorrectionError('LOAN_CORRECTION_EMPTY', 'No cambiaste el valor, la fecha ni la cuenta del préstamo.', 400);

            const loanDate = new Date(loan.period);
            await assertOpenFinancialPeriod(tx, loan.year || loanDate.getUTCFullYear(), loan.month || loanDate.getUTCMonth() + 1);
            await assertOpenFinancialPeriod(tx, year, month);

            let financialRecord = null;
            if (record) {
                const account = await tx.financialAccount.findUnique({ where: { id: accountId || '' }, select: { id: true, isActive: true, currency: true } });
                if (!account?.isActive) throw loanCorrectionError('LOAN_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.');
                if (account.currency !== 'COP') throw loanCorrectionError('LOAN_CURRENCY_UNSUPPORTED', 'Los préstamos se registran en pesos.');
                if (record.year && record.month) await assertOpenFinancialPeriod(tx, record.year, record.month);
                financialRecord = await tx.financialRecord.update({ where: { id: record.id }, data: { amount, date: lentAt, year, month, accountId } });
                await tx.financialAuditEvent.create({
                    data: {
                        entityType: 'FinancialRecord', entityId: record.id, action: 'UPDATE', actorId,
                        before: cloneForAudit(record), after: cloneForAudit({ ...financialRecord, operation: 'LOAN_CORRECTED', reason, receivableId })
                    }
                });
            }

            const receivable = await tx.accountsReceivable.update({
                where: { id: receivableId },
                data: {
                    amount, period: lentAt, year, month,
                    status: receivableStatusAfter({ outstandingCents: amountCents - appliedCents, payments: active, currentStatus: loan.status })
                }
            });
            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsReceivable', entityId: receivableId, action: 'UPDATE', actorId,
                    before: cloneForAudit(loan), after: cloneForAudit({ ...receivable, operation: 'LOAN_CORRECTED', reason, financialRecordId: record?.id || null })
                }
            });
            return { receivable, financialRecord };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034') throw loanCorrectionError('LOAN_CONFLICT', 'Otro proceso modificó el préstamo. Actualiza los datos y vuelve a intentarlo.');
        throw error;
    }
};
