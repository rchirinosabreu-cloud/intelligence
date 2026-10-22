import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { LOAN_KIND, isLoanUntouched, loanFromRecord } from '../lib/receivableLoans.js';

// El préstamo en Cartera y el egreso que sacó el dinero son un solo hecho (Rodny, 20 de octubre
// de 2026: «si tiene esa categoría de préstamo vaya a cuenta por cobrar en seguida»). Este
// módulo los mantiene juntos: crea la cuenta por cobrar cuando aparece un egreso de categoría
// Préstamo, la corrige cuando el egreso se corrige y la quita cuando el egreso se anula o deja de
// ser préstamo, siempre dentro de la transacción de quien escribe el movimiento. Solo mientras
// nadie haya reintegrado nada: con un reintegro vigente, el egreso queda bloqueado en Movimientos.

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '').trim() || null;

const datePartsOf = (record) => {
    const date = record.date instanceof Date ? record.date : new Date(record.date);
    const year = Number.isInteger(record.year) ? record.year : date.getUTCFullYear();
    const month = Number.isInteger(record.month) ? record.month : date.getUTCMonth() + 1;
    return { date, year, month };
};

/**
 * Crea la cuenta por cobrar de un préstamo a partir del egreso que lo desembolsó. La usan
 * «Registrar préstamo» en Cartera y la sincronización desde Movimientos, para que un préstamo
 * nazca igual venga de donde venga.
 */
export const createLoanReceivableFor = async (tx, {
    financialRecord, counterpartyType, counterpartyName, clientId = null, dueDate = null, notes = null, actorId = null, metadata = {}
}) => {
    const amountCents = financialCents(financialRecord.amount);
    const { date, year, month } = datePartsOf(financialRecord);
    const receivable = await tx.accountsReceivable.create({
        data: {
            kind: LOAN_KIND,
            clientId,
            counterpartyType,
            counterpartyName,
            loanRecordId: financialRecord.id,
            amount: financialAmountFromCents(amountCents),
            currency: 'COP',
            period: date,
            year,
            month,
            dueDate,
            status: 'DEBE',
            origin: 'MANUAL',
            notes,
            sourceLabel: counterpartyName,
            metadata: { createdBy: actorId, origin: 'PLATFORM', loan: true, ...metadata }
        }
    });
    await tx.financialAuditEvent.create({
        data: { entityType: 'AccountsReceivable', entityId: receivable.id, action: 'CREATE', after: cloneForAudit(receivable), actorId }
    });
    return receivable;
};

// A quién se le prestó, cuando el movimiento no lo dice: un cliente si lo tiene; alguien del
// equipo si el nombre coincide con una persona activa de Equipo; si no, otro tercero.
const inferCounterpartyType = async (tx, counterpartyName, clientId) => {
    if (clientId) return 'CLIENTE';
    const firstWord = String(counterpartyName || '').split(/\s+/)[0] || '';
    if (firstWord.length >= 3 && typeof tx.teamMember?.findFirst === 'function') {
        const member = await tx.teamMember.findFirst({
            where: { isActive: true, name: { contains: firstWord, mode: 'insensitive' } },
            select: { id: true, name: true }
        });
        if (member) return 'COLABORADOR';
    }
    return 'OTRO';
};

/**
 * Alinea la cartera con un movimiento recién escrito. `record` es el movimiento tal como quedó
 * (con `status` VOIDED si se anuló) y `record.loanReceivable` —o `existingLoan`— el préstamo que
 * ya tenía, con `status` y sus `payments` vigentes. Devuelve qué hizo, para quien quiera decirlo.
 */
export const syncLoanWithRecord = async (tx, record, { actorId = null, existingLoan } = {}) => {
    const loan = existingLoan === undefined ? (record?.loanReceivable || null) : existingLoan;
    const wanted = record?.status === 'VOIDED' ? null : loanFromRecord(record);

    if (!loan) {
        if (!wanted) return { action: 'NONE' };
        const counterpartyType = wanted.counterpartyType || await inferCounterpartyType(tx, wanted.counterpartyName, wanted.clientId);
        const receivable = await createLoanReceivableFor(tx, {
            financialRecord: record,
            counterpartyType,
            counterpartyName: wanted.counterpartyName,
            clientId: wanted.clientId,
            notes: text(record.notes),
            actorId,
            metadata: { autoLinked: true }
        });
        return { action: 'CREATED', receivable };
    }

    // Con un reintegro vigente o cerrado, el egreso ya no se pudo tocar: no hay nada que seguir.
    if (!isLoanUntouched(loan)) return { action: 'KEPT' };

    const current = await tx.accountsReceivable.findUnique({ where: { id: loan.id } });
    if (!current) return { action: 'NONE' };

    if (!wanted) {
        await tx.accountsReceivable.delete({ where: { id: loan.id } });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'AccountsReceivable', entityId: loan.id, action: 'DELETE', before: cloneForAudit(current), actorId,
                after: { reason: record?.status === 'VOIDED' ? 'El egreso del préstamo se anuló en Movimientos.' : 'El movimiento dejó de ser un préstamo.', financialRecordId: record.id }
            }
        });
        return { action: 'DELETED' };
    }

    const { date, year, month } = datePartsOf(record);
    const data = {
        amount: financialAmountFromCents(financialCents(record.amount)),
        period: date,
        year,
        month,
        counterpartyName: wanted.counterpartyName,
        sourceLabel: wanted.counterpartyName,
        clientId: wanted.clientId,
        counterpartyType: wanted.clientId ? 'CLIENTE' : (current.counterpartyType === 'CLIENTE' ? 'OTRO' : current.counterpartyType)
    };
    const updated = await tx.accountsReceivable.update({ where: { id: loan.id }, data });
    await tx.financialAuditEvent.create({
        data: { entityType: 'AccountsReceivable', entityId: loan.id, action: 'UPDATE', before: cloneForAudit(current), after: cloneForAudit(updated), actorId }
    });
    return { action: 'UPDATED', receivable: updated };
};
