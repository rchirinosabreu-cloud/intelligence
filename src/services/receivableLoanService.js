import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { assertOpenFinancialPeriod, FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';
import { loanProblem } from '../lib/receivableLoans.js';
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
            const counterpartyName = client ? client.name : text(input.counterpartyName);

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
                counterpartyType, counterpartyName, clientId, dueDate, notes, actorId
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
