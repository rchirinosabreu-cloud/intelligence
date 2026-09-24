import { FINANCIAL_CATEGORIES, FinancialDomainError, assertOpenFinancialPeriod } from './financialRecordService.js';

// A breakdown ("desglose") explains what one movement paid for. The movement keeps being the only
// money fact (one transfer, one account, one date); its lines add up exactly to its amount and only
// feed the category indicators. Nothing here creates, moves or hides money.
// There is no upper limit on lines (Rodny, 2026-09-24): one transfer can pay for as many things as it pays for.

const toNumber = (value) => {
    if (value === undefined || value === null) return Number.NaN;
    if (typeof value === 'number') return value;
    if (typeof value.toNumber === 'function') return value.toNumber();
    return Number(String(value).trim().replace(/,/g, '.'));
};

const toCents = (value) => Math.round(toNumber(value) * 100);

const formatMoney = (cents) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(cents / 100);

const optionalText = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

export const normalizeFinancialAllocationsInput = (record, input) => {
    if (!Array.isArray(input)) {
        throw new FinancialDomainError('FINANCIAL_ALLOCATION_INVALID', 'El desglose debe ser una lista de ítems.');
    }
    if (input.length === 0) return [];
    if (input.length === 1) {
        throw new FinancialDomainError(
            'FINANCIAL_ALLOCATION_MIN_LINES',
            'Un desglose necesita al menos dos ítems. Si el movimiento es de un solo concepto, edita su categoría directamente.'
        );
    }
    const lines = input.map((line, index) => {
        const source = line && typeof line === 'object' ? line : {};
        const amount = toNumber(source.amount);
        const cents = Math.round(amount * 100);
        if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - cents) > 1e-6) {
            throw new FinancialDomainError(
                'FINANCIAL_ALLOCATION_AMOUNT_INVALID',
                `El valor del ítem ${index + 1} debe ser mayor que cero y tener como máximo dos decimales.`
            );
        }
        const category = String(source.category || '').trim().toUpperCase();
        if (!FINANCIAL_CATEGORIES.has(category)) {
            throw new FinancialDomainError('FINANCIAL_ALLOCATION_CATEGORY_INVALID', `La categoría del ítem ${index + 1} no es válida.`);
        }
        const description = optionalText(source.description);
        if (!description) {
            throw new FinancialDomainError('FINANCIAL_ALLOCATION_DESCRIPTION_REQUIRED', `Indica el concepto del ítem ${index + 1}.`);
        }
        return { amount: cents / 100, category, description, counterparty: optionalText(source.counterparty), sortOrder: index };
    });

    const totalCents = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    const recordCents = toCents(record.amount);
    if (totalCents !== recordCents) {
        const difference = recordCents - totalCents;
        throw new FinancialDomainError(
            'FINANCIAL_ALLOCATION_SUM_MISMATCH',
            difference > 0
                ? `Los ítems suman ${formatMoney(totalCents)} y el movimiento es de ${formatMoney(recordCents)}: faltan ${formatMoney(difference)} por repartir.`
                : `Los ítems suman ${formatMoney(totalCents)} y el movimiento es de ${formatMoney(recordCents)}: sobran ${formatMoney(-difference)}.`
        );
    }
    return lines;
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;
const auditSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const replaceFinancialRecordAllocations = async (prismaClient, recordId, input, actor) => {
    const actorId = actorIdFrom(actor);
    const run = async (tx) => {
        const existing = await tx.financialRecord.findUnique({
            where: { id: recordId },
            include: { allocations: { orderBy: { sortOrder: 'asc' } } }
        });
        if (!existing) throw new FinancialDomainError('FINANCIAL_RECORD_NOT_FOUND', 'El movimiento no existe.', 404);
        if (existing.status === 'VOIDED') {
            throw new FinancialDomainError('FINANCIAL_RECORD_VOIDED', 'Un movimiento anulado no se puede desglosar.', 409);
        }
        if (existing.origin === 'SYSTEM') {
            throw new FinancialDomainError(
                'FINANCIAL_RECORD_SYSTEM_MANAGED',
                'Este movimiento fue generado por otro proceso y su concepto no se desglosa desde Movimientos.',
                409
            );
        }
        const lines = normalizeFinancialAllocationsInput(existing, input);
        await assertOpenFinancialPeriod(tx, existing.year, existing.month);

        await tx.financialRecordAllocation.deleteMany({ where: { recordId } });
        if (lines.length > 0) {
            await tx.financialRecordAllocation.createMany({ data: lines.map((line) => ({ ...line, recordId })) });
        }
        const allocations = lines.length > 0
            ? await tx.financialRecordAllocation.findMany({ where: { recordId }, orderBy: { sortOrder: 'asc' } })
            : [];
        const { allocations: previousAllocations, ...recordFields } = existing;
        const updated = { ...recordFields, allocations };
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialRecord',
                entityId: recordId,
                action: 'UPDATE',
                before: auditSnapshot({ ...recordFields, allocations: previousAllocations }),
                after: auditSnapshot(updated),
                actorId
            }
        });
        return updated;
    };

    try {
        return await prismaClient.$transaction(run, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2034') {
            throw new FinancialDomainError(
                'FINANCIAL_RECORD_CONFLICT',
                'El movimiento cambió mientras se guardaba el desglose. Actualiza los datos y vuelve a intentarlo.',
                409
            );
        }
        throw error;
    }
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// Category indicators: a movement with a breakdown contributes its lines; otherwise its own category.
export const accumulateCategoryDistribution = (records, categories = []) => {
    const distribution = { INCOME: {}, EXPENSE: {} };
    for (const category of categories) {
        distribution.INCOME[category] = 0;
        distribution.EXPENSE[category] = 0;
    }
    const add = (type, category, amount) => {
        if (!distribution[type]) return;
        distribution[type][category] = roundMoney((distribution[type][category] || 0) + amount);
    };
    for (const record of records || []) {
        const lines = Array.isArray(record.allocations) ? record.allocations : [];
        if (lines.length > 0) {
            for (const line of lines) add(record.type, line.category, toNumber(line.amount) || 0);
        } else {
            add(record.type, record.category, toNumber(record.amount) || 0);
        }
    }
    return distribution;
};
