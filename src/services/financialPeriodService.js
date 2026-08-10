import { FinancialDomainError } from './financialRecordService.js';

const normalizePeriod = ({ year, month } = {}) => {
    const normalizedYear = Number.parseInt(year, 10);
    const normalizedMonth = Number.parseInt(month, 10);
    if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2200) {
        throw new FinancialDomainError('FINANCIAL_PERIOD_YEAR_INVALID', 'El año contable no es válido.');
    }
    if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
        throw new FinancialDomainError('FINANCIAL_PERIOD_MONTH_INVALID', 'El mes contable no es válido.');
    }
    return { year: normalizedYear, month: normalizedMonth };
};

export const listFinancialPeriods = async (prismaClient, year) => {
    const normalizedYear = Number.parseInt(year, 10);
    return prismaClient.financialPeriod.findMany({
        where: Number.isInteger(normalizedYear) ? { year: normalizedYear } : {},
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { closedBy: { select: { id: true, name: true } } }
    });
};

export const closeFinancialPeriod = async (prismaClient, input, actor) => {
    const { year, month } = normalizePeriod(input);
    const actorId = actor?.id || actor?.userId || null;
    const notes = String(input?.notes || '').trim() || null;

    return prismaClient.$transaction(async (tx) => {
        const draftCount = await tx.financialRecord.count({
            where: { year, month, status: 'DRAFT' }
        });
        if (draftCount > 0) {
            throw new FinancialDomainError(
                'FINANCIAL_PERIOD_HAS_DRAFTS',
                'No puedes cerrar el periodo mientras existan movimientos en borrador.',
                409
            );
        }

        const unreconciledCount = await tx.financialRecord.count({
            where: {
                year,
                month,
                scenario: 'ACTUAL',
                status: 'POSTED',
                accountId: null
            }
        });
        if (unreconciledCount > 0) {
            throw new FinancialDomainError(
                'FINANCIAL_PERIOD_UNRECONCILED',
                `Hay ${unreconciledCount} movimientos ejecutados sin cuenta de caja o banco.`,
                409
            );
        }

        const pendingPayrollCount = await tx.payrollTransaction.count({
            where: {
                year,
                month,
                status: { in: ['DRAFT', 'APPROVED'] }
            }
        });
        if (pendingPayrollCount > 0) {
            throw new FinancialDomainError(
                'FINANCIAL_PERIOD_PAYROLL_PENDING',
                `Hay ${pendingPayrollCount} liquidaciones de nómina pendientes de pago.`,
                409
            );
        }

        const closedAt = new Date();
        const period = await tx.financialPeriod.upsert({
            where: { year_month: { year, month } },
            update: { status: 'CLOSED', closedAt, closedById: actorId, notes },
            create: { year, month, status: 'CLOSED', closedAt, closedById: actorId, notes }
        });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialPeriod',
                entityId: period.id,
                action: 'CLOSE',
                after: JSON.parse(JSON.stringify(period)),
                actorId
            }
        });
        return period;
    });
};

export const reopenFinancialPeriod = async (prismaClient, input, actor) => {
    const { year, month } = normalizePeriod(input);
    const actorId = actor?.id || actor?.userId || null;
    const reason = String(input?.reason || '').trim();

    if (!reason) {
        throw new FinancialDomainError(
            'FINANCIAL_PERIOD_REOPEN_REASON_REQUIRED',
            'Debes indicar por que se reabre el periodo.',
            400
        );
    }

    return prismaClient.$transaction(async (tx) => {
        const currentPeriod = await tx.financialPeriod.findUnique({
            where: { year_month: { year, month } }
        });

        if (!currentPeriod || currentPeriod.status !== 'CLOSED') {
            throw new FinancialDomainError(
                'FINANCIAL_PERIOD_NOT_CLOSED',
                'El periodo no esta cerrado.',
                409
            );
        }

        const period = await tx.financialPeriod.update({
            where: { id: currentPeriod.id },
            data: {
                status: 'OPEN',
                closedAt: null,
                closedById: null
            }
        });

        await tx.financialAuditEvent.create({
            data: {
                entityType: 'FinancialPeriod',
                entityId: period.id,
                action: 'REOPEN',
                before: JSON.parse(JSON.stringify(currentPeriod)),
                after: {
                    ...JSON.parse(JSON.stringify(period)),
                    reason
                },
                actorId
            }
        });

        return period;
    });
};
