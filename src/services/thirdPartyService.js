import { FinancialDomainError } from './financialRecordService.js';
import { thirdPartyProblem } from '../lib/accountsPayable.js';

// El registro de terceros (Rodny, 20 de octubre de 2026): cada proveedor, colaborador, arrendador
// o socio al que Brain Studio le paga, una sola vez, con sus datos de pago. Nada se borra: un
// tercero que ya no se usa se desactiva y conserva sus cuentas.

const text = (value) => String(value ?? '').trim() || null;
const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

const FIELDS = ['kind', 'name', 'legalName', 'documentType', 'documentNumber', 'email', 'phone', 'bankName', 'bankAccountType', 'bankAccountNumber', 'teamMemberId', 'notes'];

const normalize = (input) => {
    const data = {};
    for (const field of FIELDS) if (input[field] !== undefined) data[field] = text(input[field]);
    if (data.documentType) data.documentType = data.documentType.toUpperCase();
    return data;
};

export const listThirdParties = async (prismaClient, filters = {}) => {
    const q = text(filters.q);
    const kind = text(filters.kind);
    const includeInactive = filters.includeInactive === true || filters.includeInactive === 'true';
    const where = {
        ...(includeInactive ? {} : { isActive: true }),
        ...(kind ? { kind } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { legalName: { contains: q, mode: 'insensitive' } }, { documentNumber: { contains: q } }] } : {})
    };
    const thirdParties = await prismaClient.thirdParty.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return { thirdParties };
};

export const createThirdParty = async (prismaClient, input = {}, actor) => {
    const data = normalize(input);
    const problem = thirdPartyProblem(data);
    if (problem) throw new FinancialDomainError('THIRD_PARTY_INVALID', problem);
    const actorId = actorIdFrom(actor);
    return prismaClient.$transaction(async (tx) => {
        const duplicate = await tx.thirdParty.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, kind: data.kind, isActive: true }, select: { id: true, name: true } });
        if (duplicate) throw new FinancialDomainError('THIRD_PARTY_DUPLICATE', `Ya existe «${duplicate.name}» como ${data.kind.toLowerCase()}. Úsalo o edítalo en vez de crear otro.`, 409);
        const thirdParty = await tx.thirdParty.create({ data: { ...data, createdById: actorId } });
        await tx.financialAuditEvent.create({ data: { entityType: 'ThirdParty', entityId: thirdParty.id, action: 'CREATE', after: cloneForAudit(thirdParty), actorId } });
        return thirdParty;
    });
};

export const updateThirdParty = async (prismaClient, thirdPartyId, patch = {}, actor) => {
    const actorId = actorIdFrom(actor);
    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.thirdParty.findUnique({ where: { id: thirdPartyId } });
        if (!existing) throw new FinancialDomainError('THIRD_PARTY_NOT_FOUND', 'El tercero no existe.', 404);
        const data = normalize(patch);
        if (patch.isActive !== undefined) data.isActive = patch.isActive === true || patch.isActive === 'true';
        const merged = { ...existing, ...data };
        const problem = thirdPartyProblem(merged);
        if (problem) throw new FinancialDomainError('THIRD_PARTY_INVALID', problem);
        const updated = await tx.thirdParty.update({ where: { id: thirdPartyId }, data });
        await tx.financialAuditEvent.create({ data: { entityType: 'ThirdParty', entityId: thirdPartyId, action: 'UPDATE', before: cloneForAudit(existing), after: cloneForAudit(updated), actorId } });
        return updated;
    });
};
