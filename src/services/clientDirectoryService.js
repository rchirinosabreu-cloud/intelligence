import { normalizeClientProfile, CLIENT_PROFILE_FIELDS } from '../lib/clientProfile.js';
import { formatPartyDocument } from '../lib/partyIdentity.js';
import { createClientWith } from './clientService.js';
import { FinancialDomainError } from './financialRecordService.js';

// El directorio de clientes de Financiero (Rodny, 30 de septiembre de 2026: «necesito
// crear y tener una base de datos de los clientes, un directorio»). Es la misma ficha de
// Clientes, pero la mantiene quien lleva el financiero, con su permiso, y cada cambio
// queda en la auditoría financiera: son los datos que salen impresos en un cobro.

const DIRECTORY_SELECT = Object.freeze({
    id: true,
    name: true,
    slug: true,
    isArchived: true,
    legalName: true,
    documentType: true,
    documentNumber: true,
    contactName: true,
    email: true,
    phone: true,
    address: true,
    city: true,
    country: true
});

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));

const invalidProfile = (errors) => new FinancialDomainError('CLIENT_PROFILE_INVALID', Object.values(errors)[0], 400);

const serializeDirectoryClient = (client) => ({
    ...Object.fromEntries(Object.keys(DIRECTORY_SELECT).map((key) => [key, client[key] ?? (key === 'isArchived' ? false : null)])),
    formattedDocument: formatPartyDocument(client)
});

/**
 * Todas las fichas, archivadas incluidas —un cliente archivado sigue debiendo—, en orden
 * alfabético. `q` busca por nombre, nombre legal, documento, contacto o correo.
 */
export const listClientDirectory = async (prismaClient, { q } = {}) => {
    const search = String(q ?? '').trim();
    const where = search
        ? {
            OR: ['name', 'legalName', 'documentNumber', 'contactName', 'email', 'city'].map((field) => ({
                [field]: { contains: search, mode: 'insensitive' }
            }))
        }
        : {};
    const clients = await prismaClient.client.findMany({
        where,
        select: DIRECTORY_SELECT,
        orderBy: { name: 'asc' }
    });
    return clients.map(serializeDirectoryClient);
};

/** Crea una ficha completa desde el directorio. Solo el nombre es obligatorio. */
export const createDirectoryClient = async (prismaClient, input = {}, actor) => {
    const profile = normalizeClientProfile(input, { requireName: true });
    if (!profile.valid) throw invalidProfile(profile.errors);
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        const client = await createClientWith(tx, profile.data);
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'Client',
                entityId: client.id,
                action: 'CREATE',
                after: cloneForAudit({ ...profile.data, slug: client.slug }),
                actorId
            }
        });
        return serializeDirectoryClient(client);
    });
};

/**
 * Edita la ficha: solo cambia lo que viene, y un campo enviado vacío se borra. La
 * auditoría guarda el antes y el después de esos campos.
 */
export const updateDirectoryClient = async (prismaClient, clientId, input = {}, actor) => {
    const profile = normalizeClientProfile(input);
    if (!profile.valid) throw invalidProfile(profile.errors);
    const changes = Object.fromEntries(Object.entries(profile.data).filter(([key]) => CLIENT_PROFILE_FIELDS.includes(key)));
    if (!Object.keys(changes).length) {
        throw new FinancialDomainError('CLIENT_PROFILE_EMPTY', 'No hay cambios para guardar en la ficha.', 400);
    }
    const actorId = actor?.id || actor?.userId || null;

    return prismaClient.$transaction(async (tx) => {
        const existing = await tx.client.findUnique({ where: { id: clientId }, select: DIRECTORY_SELECT });
        if (!existing) throw new FinancialDomainError('CLIENT_NOT_FOUND', 'El cliente no existe.', 404);
        const updated = await tx.client.update({ where: { id: clientId }, data: changes, select: DIRECTORY_SELECT });
        await tx.financialAuditEvent.create({
            data: {
                entityType: 'Client',
                entityId: clientId,
                action: 'UPDATE',
                before: cloneForAudit(Object.fromEntries(Object.keys(changes).map((key) => [key, existing[key] ?? null]))),
                after: cloneForAudit(changes),
                actorId
            }
        });
        return serializeDirectoryClient(updated);
    });
};
