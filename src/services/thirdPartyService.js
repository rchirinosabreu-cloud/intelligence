import { FinancialDomainError } from './financialRecordService.js';
import { thirdPartyProblem } from '../lib/accountsPayable.js';

// El registro de terceros (Rodny, 20 de octubre de 2026): cada proveedor, colaborador, arrendador
// o socio al que Brain Studio le paga, una sola vez, con sus datos de pago. Nada se borra: un
// tercero que ya no se usa se desactiva y conserva sus cuentas.

const text = (value) => String(value ?? '').trim() || null;
const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

const FIELDS = ['kind', 'name', 'legalName', 'documentType', 'documentNumber', 'email', 'phone', 'bankName', 'bankAccountType', 'bankAccountNumber', 'teamMemberId', 'clientId', 'notes'];

// Terceros (23 de octubre de 2026): un tercero que también es cliente queda ligado a la ficha del
// cliente, una sola vez. Se comprueba aquí para decir el motivo, no con un error de la base.
const assertClientLink = async (tx, clientId, thirdPartyId = null) => {
    if (!clientId) return;
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw new FinancialDomainError('THIRD_PARTY_CLIENT_NOT_FOUND', 'El cliente que se quiere ligar no existe.', 404);
    const taken = await tx.thirdParty.findFirst({ where: { clientId, ...(thirdPartyId ? { id: { not: thirdPartyId } } : {}) }, select: { name: true } });
    if (taken) throw new FinancialDomainError('THIRD_PARTY_CLIENT_TAKEN', `«${client.name}» ya tiene su ficha de pago como «${taken.name}». Edita esa en vez de crear otra.`, 409);
};

// El equipo (26 de octubre de 2026): la ficha de pago de alguien del equipo queda ligada a esa persona, una sola
// vez. Igual que con el cliente, se comprueba aquí para decir el motivo.
const assertTeamMemberLink = async (tx, teamMemberId, thirdPartyId = null) => {
    if (!teamMemberId) return;
    const member = await tx.teamMember.findUnique({ where: { id: teamMemberId }, select: { id: true, name: true } });
    if (!member) throw new FinancialDomainError('THIRD_PARTY_TEAM_MEMBER_NOT_FOUND', 'La persona del equipo que se quiere ligar no existe.', 404);
    const taken = await tx.thirdParty.findFirst({ where: { teamMemberId, ...(thirdPartyId ? { id: { not: thirdPartyId } } : {}) }, select: { name: true } });
    if (taken) throw new FinancialDomainError('THIRD_PARTY_TEAM_MEMBER_TAKEN', `${member.name} ya tiene su ficha de pago como «${taken.name}». Edita esa en vez de crear otra.`, 409);
};

/** El equipo activo, con lo justo para su fila en Terceros: la lista de Equipo, no una copia. */
export const listPartyTeam = async (prismaClient) => ({
    team: await prismaClient.teamMember.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true, email: true, avatarUrl: true, isActive: true }
    })
});

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
        await assertClientLink(tx, data.clientId);
        await assertTeamMemberLink(tx, data.teamMemberId);
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
        if (data.clientId && data.clientId !== existing.clientId) await assertClientLink(tx, data.clientId, thirdPartyId);
        if (data.teamMemberId && data.teamMemberId !== existing.teamMemberId) await assertTeamMemberLink(tx, data.teamMemberId, thirdPartyId);
        const updated = await tx.thirdParty.update({ where: { id: thirdPartyId }, data });
        await tx.financialAuditEvent.create({ data: { entityType: 'ThirdParty', entityId: thirdPartyId, action: 'UPDATE', before: cloneForAudit(existing), after: cloneForAudit(updated), actorId } });
        return updated;
    });
};
