const TYPES = new Set(['INCOME', 'EXPENSE']);
const CATEGORIES = new Set([
    'MEMBRESIA',
    'PAUTA',
    'NOMINA',
    'LOGISTICA',
    'ADMINISTRATIVO',
    'TAX',
    'FINANCIAL',
    'OPERATIVO'
]);
const SCENARIOS = new Set(['ACTUAL', 'FORECAST', 'BUDGET']);
const STATUSES = new Set(['DRAFT', 'POSTED']);

export class FinancialDomainError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.name = 'FinancialDomainError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const requiredText = (value, code, message) => {
    const normalized = String(value || '').trim();
    if (!normalized) throw new FinancialDomainError(code, message);
    return normalized;
};

const optionalText = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

export const parseFinancialDateInput = (value) => {
    const raw = requiredText(value, 'FINANCIAL_RECORD_DATE_REQUIRED', 'La fecha contable es obligatoria.');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) {
        throw new FinancialDomainError(
            'FINANCIAL_RECORD_DATE_INVALID',
            'La fecha contable debe tener el formato AAAA-MM-DD.'
        );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        throw new FinancialDomainError('FINANCIAL_RECORD_DATE_INVALID', 'La fecha contable no es valida.');
    }

    return { date, year, month };
};

const requireEnum = (value, allowed, code, message) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!allowed.has(normalized)) throw new FinancialDomainError(code, message);
    return normalized;
};

export const normalizeFinancialRecordInput = (input = {}) => {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new FinancialDomainError(
            'FINANCIAL_RECORD_AMOUNT_INVALID',
            'El valor debe ser un numero mayor que cero.'
        );
    }

    const { date, year, month } = parseFinancialDateInput(input.date);
    const type = requireEnum(input.type, TYPES, 'FINANCIAL_RECORD_TYPE_INVALID', 'El tipo de movimiento no es valido.');
    const category = requireEnum(
        input.category,
        CATEGORIES,
        'FINANCIAL_RECORD_CATEGORY_INVALID',
        'La categoria financiera no es valida.'
    );
    const scenario = requireEnum(
        input.scenario || 'ACTUAL',
        SCENARIOS,
        'FINANCIAL_RECORD_SCENARIO_INVALID',
        'El escenario financiero no es valido.'
    );
    const status = requireEnum(
        input.status || 'POSTED',
        STATUSES,
        'FINANCIAL_RECORD_STATUS_INVALID',
        'El estado del movimiento no es valido.'
    );
    const origin = input.origin === 'IMPORT' ? 'IMPORT' : 'MANUAL';
    const accountId = input.accountId || null;
    if (scenario === 'ACTUAL' && status === 'POSTED' && origin === 'MANUAL' && !accountId) {
        throw new FinancialDomainError(
            'FINANCIAL_RECORD_ACCOUNT_REQUIRED',
            'Selecciona la cuenta de caja o banco donde se registro el movimiento.'
        );
    }

    return {
        amount,
        type,
        category,
        section: input.section || (type === 'INCOME' ? 'REVENUE' : 'OPERATING_EXPENSE'),
        date,
        year,
        month,
        scenario,
        status,
        origin,
        isProjection: scenario !== 'ACTUAL',
        clientId: input.clientId || null,
        userId: input.userId || null,
        accountId,
        description: optionalText(input.description),
        counterparty: optionalText(input.counterparty),
        subcategory: optionalText(input.subcategory),
        reference: optionalText(input.reference),
        notes: optionalText(input.notes),
        attachmentUrl: optionalText(input.attachmentUrl),
        attachmentName: optionalText(input.attachmentName),
        attachmentMimeType: optionalText(input.attachmentMimeType),
        postedAt: status === 'POSTED' ? new Date() : null
    };
};

export const assertOpenFinancialPeriod = async (tx, year, month) => {
    const period = await tx.financialPeriod.findUnique({
        where: { year_month: { year, month } },
        select: { status: true }
    });
    if (period?.status === 'CLOSED') {
        throw new FinancialDomainError(
            'FINANCIAL_PERIOD_CLOSED',
            `El periodo ${String(month).padStart(2, '0')}/${year} esta cerrado.`,
            409
        );
    }
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

const auditSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const createFinancialRecord = async (prismaClient, input, actor) => {
    const data = normalizeFinancialRecordInput({ ...input, origin: 'MANUAL' });
    const actorId = actorIdFrom(actor);

    return prismaClient.$transaction(async (tx) => {
        await assertOpenFinancialPeriod(tx, data.year, data.month);
        const record = await tx.financialRecord.create({
            data: {
                ...data,
                createdById: actorId
            },
            include: {
                client: { select: { id: true, name: true, slug: true } },
                account: { select: { id: true, name: true, type: true } }
            }
        });

        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialRecord',
                entityId: record.id,
                action: 'CREATE',
                after: auditSnapshot(record),
                actorId
            }
        });

        return record;
    });
};

export const listFinancialRecords = async (prismaClient, filters = {}) => {
    const year = Number.parseInt(filters.year, 10);
    const month = Number.parseInt(filters.month, 10);
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(filters.pageSize, 10) || 50, 1), 100);
    const where = {};

    if (Number.isInteger(year)) where.year = year;
    if (Number.isInteger(month) && month >= 1 && month <= 12) where.month = month;
    if (filters.scenario) {
        where.scenario = requireEnum(
            filters.scenario,
            SCENARIOS,
            'FINANCIAL_RECORD_SCENARIO_INVALID',
            'El escenario financiero no es valido.'
        );
    }
    if (filters.type) {
        where.type = requireEnum(filters.type, TYPES, 'FINANCIAL_RECORD_TYPE_INVALID', 'El tipo de movimiento no es valido.');
    }
    if (filters.category) {
        where.category = requireEnum(
            filters.category,
            CATEGORIES,
            'FINANCIAL_RECORD_CATEGORY_INVALID',
            'La categoria financiera no es valida.'
        );
    }
    if (filters.status && String(filters.status).toUpperCase() !== 'ALL') {
        const allowedStatuses = new Set(['DRAFT', 'POSTED', 'VOIDED']);
        where.status = requireEnum(
            filters.status,
            allowedStatuses,
            'FINANCIAL_RECORD_STATUS_INVALID',
            'El estado del movimiento no es valido.'
        );
    } else {
        where.status = { not: 'VOIDED' };
    }
    if (filters.clientId) where.clientId = String(filters.clientId);
    if (filters.accountId) where.accountId = String(filters.accountId);

    const [items, total] = await Promise.all([
        prismaClient.financialRecord.findMany({
            where,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                client: { select: { id: true, name: true, slug: true } },
                account: { select: { id: true, name: true, type: true } },
                createdBy: { select: { id: true, name: true } }
            }
        }),
        prismaClient.financialRecord.count({ where })
    ]);

    return { items, total, page, pageSize };
};

const dateInputFrom = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
};

export const updateFinancialRecord = async (prismaClient, recordId, patch, actor) => {
    const actorId = actorIdFrom(actor);

    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.financialRecord.findUnique({ where: { id: recordId } });
        if (!existing) {
            throw new FinancialDomainError('FINANCIAL_RECORD_NOT_FOUND', 'El movimiento no existe.', 404);
        }
        if (existing.status === 'VOIDED') {
            throw new FinancialDomainError('FINANCIAL_RECORD_VOIDED', 'Un movimiento anulado no se puede editar.', 409);
        }

        await assertOpenFinancialPeriod(tx, existing.year, existing.month);
        const data = normalizeFinancialRecordInput({
            ...existing,
            ...patch,
            date: patch.date || dateInputFrom(existing.date),
            status: patch.status || existing.status
        });
        data.origin = existing.origin;
        data.postedAt = existing.postedAt || data.postedAt;
        await assertOpenFinancialPeriod(tx, data.year, data.month);

        const updated = await tx.financialRecord.update({
            where: { id: recordId },
            data
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialRecord',
                entityId: recordId,
                action: 'UPDATE',
                before: auditSnapshot(existing),
                after: auditSnapshot(updated),
                actorId
            }
        });
        return updated;
    });
};

export const voidFinancialRecord = async (prismaClient, recordId, reason, actor) => {
    const voidReason = requiredText(
        reason,
        'FINANCIAL_RECORD_VOID_REASON_REQUIRED',
        'Debes indicar por que se anula el movimiento.'
    );
    const actorId = actorIdFrom(actor);

    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.financialRecord.findUnique({ where: { id: recordId } });
        if (!existing) {
            throw new FinancialDomainError('FINANCIAL_RECORD_NOT_FOUND', 'El movimiento no existe.', 404);
        }
        if (existing.status === 'VOIDED') {
            throw new FinancialDomainError('FINANCIAL_RECORD_ALREADY_VOIDED', 'El movimiento ya esta anulado.', 409);
        }

        await assertOpenFinancialPeriod(tx, existing.year, existing.month);
        const updated = await tx.financialRecord.update({
            where: { id: recordId },
            data: {
                status: 'VOIDED',
                voidedAt: new Date(),
                voidReason
            }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialRecord',
                entityId: recordId,
                action: 'VOID',
                before: auditSnapshot(existing),
                after: auditSnapshot(updated),
                actorId
            }
        });
        return updated;
    });
};
