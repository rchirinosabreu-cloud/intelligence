import { FinancialDomainError, parseFinancialDateInput } from './financialRecordService.js';

const normalizeName = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

const readMoney = (value, field, { required = false } = {}) => {
    if ((value === undefined || value === null || value === '') && !required) return undefined;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new FinancialDomainError('PAYROLL_CONTRACT_AMOUNT_INVALID', `${field} no es válido.`);
    return amount;
};

const readDate = (value, field, { required = false } = {}) => {
    if (!value && !required) return null;
    if (!value) throw new FinancialDomainError('PAYROLL_CONTRACT_DATE_REQUIRED', `${field} es obligatoria.`);
    try {
        return parseFinancialDateInput(value).date;
    } catch {
        throw new FinancialDomainError('PAYROLL_CONTRACT_DATE_INVALID', `${field} no es válida.`);
    }
};

const upsertPosition = async (tx, title) => {
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) return null;
    return tx.payrollPosition.upsert({
        where: { title: normalizedTitle },
        update: {},
        create: { title: normalizedTitle }
    });
};

export const createPayrollContract = async (prismaClient, input = {}, actor) => {
    const name = String(input.name || '').trim();
    if (!name) throw new FinancialDomainError('PAYROLL_COLLABORATOR_NAME_REQUIRED', 'El nombre del colaborador es obligatorio.');
    const normalizedName = normalizeName(name);
    const baseSalary = readMoney(input.baseSalary, 'El salario base', { required: true });
    const socialSecurity = readMoney(input.socialSecurity ?? 0, 'La seguridad social', { required: true });
    const monthlyTotal = readMoney(input.monthlyTotal ?? baseSalary + socialSecurity, 'El total mensual', { required: true });
    const startDate = readDate(input.startDate, 'La fecha de inicio', { required: true });
    const endDate = readDate(input.endDate, 'La fecha de terminación');
    if (endDate && endDate < startDate) throw new FinancialDomainError('PAYROLL_CONTRACT_DATES_INVALID', 'La fecha de terminación no puede ser anterior al inicio.');
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        const collaborator = await tx.financialCollaborator.upsert({
            where: { normalizedName },
            update: { displayName: name, isActive: true },
            create: { displayName: name, normalizedName, isActive: true, metadata: { createdBy: actorId, origin: 'PLATFORM' } }
        });
        const position = await upsertPosition(tx, input.position);
        const contract = await tx.payrollContract.create({
            data: {
                userId: input.userId || null,
                collaboratorId: collaborator.id,
                positionId: position?.id || null,
                importBatchId: null,
                baseSalary,
                socialSecurity,
                startDate,
                endDate,
                sourceLabel: name,
                metadata: { monthlyTotal, createdBy: actorId, origin: 'PLATFORM' }
            }
        });
        await tx.financialAuditEvent.create({
            data: { entityType: 'PayrollContract', entityId: contract.id, action: 'CREATE', after: cloneForAudit(contract), actorId }
        });
        return contract;
    });
};

export const updatePayrollContract = async (prismaClient, contractId, input = {}, actor) => {
    const actorId = actor?.id || actor?.userId || null;
    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.payrollContract.findUnique({
            where: { id: contractId },
            include: { collaborator: true, position: true }
        });
        if (!existing) throw new FinancialDomainError('PAYROLL_CONTRACT_NOT_FOUND', 'El contrato no existe.', 404);

        const name = input.name === undefined ? null : String(input.name || '').trim();
        if (input.name !== undefined && !name) throw new FinancialDomainError('PAYROLL_COLLABORATOR_NAME_REQUIRED', 'El nombre del colaborador es obligatorio.');
        if (name && existing.collaboratorId) {
            await tx.financialCollaborator.update({
                where: { id: existing.collaboratorId },
                data: { displayName: name, normalizedName: normalizeName(name) }
            });
        }

        const position = input.position === undefined ? null : await upsertPosition(tx, input.position);
        const startDate = input.startDate === undefined ? existing.startDate : readDate(input.startDate, 'La fecha de inicio', { required: true });
        const endDate = input.endDate === undefined ? existing.endDate : readDate(input.endDate, 'La fecha de terminación');
        if (endDate && endDate < startDate) throw new FinancialDomainError('PAYROLL_CONTRACT_DATES_INVALID', 'La fecha de terminación no puede ser anterior al inicio.');
        const baseSalary = readMoney(input.baseSalary, 'El salario base');
        const socialSecurity = readMoney(input.socialSecurity, 'La seguridad social');
        const monthlyTotal = readMoney(input.monthlyTotal, 'El total mensual');
        const data = {
            startDate,
            endDate,
            metadata: {
                ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
                ...(monthlyTotal === undefined ? {} : { monthlyTotal }),
                editedBy: actorId,
                editedAt: new Date().toISOString()
            }
        };
        if (name) data.sourceLabel = name;
        if (input.position !== undefined) data.positionId = position?.id || null;
        if (baseSalary !== undefined) data.baseSalary = baseSalary;
        if (socialSecurity !== undefined) data.socialSecurity = socialSecurity;

        const contract = await tx.payrollContract.update({
            where: { id: contractId },
            data,
            include: { collaborator: true, position: true, transactions: true }
        });
        await tx.financialAuditEvent.create({
            data: { entityType: 'PayrollContract', entityId: contractId, action: 'UPDATE', before: cloneForAudit(existing), after: cloneForAudit(contract), actorId }
        });
        return contract;
    });
};
