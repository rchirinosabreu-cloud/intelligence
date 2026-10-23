// Liga cada cotización con su tercero (punto 1 de la solicitud de Elisa, 20 de octubre de 2026). La cotización
// cuelga de una oportunidad del CRM, y esa oportunidad apunta a la ficha del cliente cuando ya existe: si el
// cliente ya está, se liga sin duplicar datos; si no, la oportunidad es su ficha de cliente potencial y aparece
// en Terceros. La regla de quién es quién vive en src/lib/quotationParty.js.
import { createLead } from './crmService.js';
import { syncLeadStageFromQuotation } from './quotationDraftService.js';
import {
    describeQuotationParty, isQuotationPartyKnown, matchQuotationClient, matchQuotationLead, quotationParty
} from '../lib/quotationParty.js';

const quotationCode = (quotation) => `COT-${String(quotation.consecutive ?? 0).padStart(4, '0')}`;

const partyLeadSelect = { id: true, consecutive: true, company: true, contactName: true, client: { select: { id: true, name: true } } };

/** El tercero de una cotización ya ligada, tal como lo muestran Cotizaciones y Terceros. */
export const readQuotationParty = async (db, leadId) => {
    if (!leadId) return null;
    const lead = await db.crmLead.findUnique({ where: { id: leadId }, select: partyLeadSelect });
    return describeQuotationParty(lead);
};

// Lo que la cotización ya le dijo al cliente, para que la oportunidad no quede atrás: emitida es propuesta
// enviada y aceptada es aprobada. Nunca la mueve hacia atrás.
const STAGE_FOR_STATUS = { ACTIVA: 'PROPUESTA_ENVIADA', APROBADA: 'APROBADA' };
const EVENT_FOR_STATUS = { ACTIVA: 'ISSUED', APROBADA: 'ACCEPTED' };

const actorTeamMemberId = async (db, actor) => {
    const userId = actor?.userId || actor?.id;
    if (!userId) return null;
    const member = await db.teamMember.findFirst({ where: { userId, isActive: true }, select: { id: true } });
    return member?.id || null;
};

const serializePartyQuotation = (quotation) => ({
    id: quotation.id,
    code: quotationCode(quotation),
    status: quotation.status,
    total: Number(quotation.total_amount) || 0,
    currency: quotation.currency || 'COP',
    createdAt: quotation.created_at,
    acceptedAt: quotation.accepted_at ?? null
});

/**
 * Lo comercial de cada tercero para Terceros: los clientes potenciales (oportunidades con cotización y sin
 * ficha de cliente) y las cotizaciones de cada cliente. Solo las oportunidades que tienen cotización: una
 * prospección de LinkedIn que nunca recibió propuesta no es todavía un tercero de Brain Studio.
 */
export const listPartyCommercial = async (db) => {
    const leads = await db.crmLead.findMany({
        where: { archivedAt: null, quotations: { some: {} } },
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true, consecutive: true, company: true, contactName: true, email: true, phone: true, stage: true, clientId: true,
            owner: { select: { id: true, name: true } },
            quotations: { orderBy: { created_at: 'desc' }, select: { id: true, consecutive: true, status: true, total_amount: true, currency: true, created_at: true, accepted_at: true } }
        }
    });
    const prospects = [];
    const quotationsByClient = {};
    for (const lead of leads) {
        const quotations = lead.quotations.map(serializePartyQuotation);
        if (lead.clientId) {
            quotationsByClient[lead.clientId] = [...(quotationsByClient[lead.clientId] || []), ...quotations]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            continue;
        }
        prospects.push({
            id: lead.id,
            code: `CRM-${String(lead.consecutive ?? 0).padStart(4, '0')}`,
            company: lead.company ?? null,
            contactName: lead.contactName ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            stage: lead.stage,
            owner: lead.owner ? { id: lead.owner.id, name: lead.owner.name } : null,
            quotations
        });
    }
    return { prospects, quotationsByClient };
};

const partyError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

/**
 * Un cliente potencial que ya es cliente: su oportunidad queda apuntando a la ficha de cliente, y con ella sus
 * cotizaciones. No crea la ficha (eso lo hace la pantalla de la ficha, con su validación y su auditoría): la liga.
 */
export const linkProspectClient = async (db, leadId, clientId, actor = {}, { now = new Date() } = {}) => {
    const lead = await db.crmLead.findUnique({ where: { id: String(leadId || '') }, select: { id: true, clientId: true, archivedAt: true } });
    if (!lead || lead.archivedAt) throw partyError(404, 'PROSPECT_NOT_FOUND', 'Ese cliente potencial ya no existe.');
    const client = clientId ? await db.client.findUnique({ where: { id: String(clientId) }, select: { id: true, name: true } }) : null;
    if (!client) throw partyError(404, 'PROSPECT_CLIENT_NOT_FOUND', 'La ficha de cliente elegida no existe.');
    if (lead.clientId && lead.clientId !== client.id) throw partyError(409, 'PROSPECT_ALREADY_CLIENT', 'Esta oportunidad ya está ligada a otra ficha de cliente.');
    if (lead.clientId === client.id) return { leadId: lead.id, clientId: client.id };
    await db.crmLead.update({ where: { id: lead.id }, data: { clientId: client.id, updatedAt: now, lastActivityAt: now } });
    await db.crmActivity.create({
        data: { leadId: lead.id, type: 'NOTA', occurredAt: now, authorId: actor?.userId || actor?.id || null, note: `Quedó ligada a la ficha del cliente ${client.name}, desde Terceros.` }
    });
    return { leadId: lead.id, clientId: client.id };
};

/**
 * Liga la cotización con la oportunidad de su tercero, o crea esa oportunidad si no existe. Una cotización ya
 * ligada no se mueve. Devuelve `{ linked, created, party }`; sin datos suficientes del cliente (un borrador
 * vacío) no hace nada. Quien la llama decide qué hacer si falla: guardar la cotización nunca depende de esto.
 */
export const linkQuotationParty = async (db, quotation, actor = {}, { now = new Date() } = {}) => {
    if (!quotation?.id) return { linked: false, created: false, party: null };
    if (quotation.lead_id) return { linked: false, created: false, party: await readQuotationParty(db, quotation.lead_id) };

    const party = quotationParty(quotation);
    if (!isQuotationPartyKnown(party)) return { linked: false, created: false, party: null };

    const clients = await db.client.findMany({ select: { id: true, name: true, legalName: true, email: true, isArchived: true } });
    const client = matchQuotationClient(clients, party);

    const where = [
        client ? { clientId: client.id } : null,
        party.email ? { email: party.email } : null,
        party.nameKey ? { companyKey: party.nameKey } : null,
        party.name ? { contactName: { equals: party.name, mode: 'insensitive' } } : null
    ].filter(Boolean);
    const leads = await db.crmLead.findMany({
        where: { archivedAt: null, OR: where },
        select: { id: true, stage: true, clientId: true, email: true, company: true, companyKey: true, contactName: true, updatedAt: true, archivedAt: true, quotationId: true, quotedValue: true }
    });
    const match = matchQuotationLead(leads, party, client?.id ?? null);
    const code = quotationCode(quotation);
    const total = Number(quotation.total_amount) || 0;

    let leadId;
    let created = false;
    if (match) {
        leadId = match.id;
        await db.crmLead.update({
            where: { id: leadId },
            data: {
                ...(client && !match.clientId ? { clientId: client.id } : {}),
                ...(!match.quotationId ? { quotationId: quotation.id } : {}),
                ...(total > 0 && match.quotedValue == null ? { quotedValue: total, currency: quotation.currency || 'COP' } : {}),
                lastActivityAt: now,
                updatedAt: now
            }
        });
    } else {
        const lead = await createLead(db, {
            origin: client ? 'CLIENTE_ANTERIOR' : 'OTRO',
            originDetail: `Cotización ${code}`,
            company: party.company,
            contactName: party.contactName || (party.company ? null : party.email),
            email: party.email,
            phone: party.phone,
            clientId: client?.id ?? null,
            quotationId: quotation.id,
            ownerId: await actorTeamMemberId(db, actor),
            quotedValue: total > 0 ? total : null,
            currency: quotation.currency || 'COP',
            nextAction: 'Hacer seguimiento a la cotización.',
            stage: STAGE_FOR_STATUS[quotation.status] || 'POR_GESTIONAR'
        }, actor, now);
        leadId = lead.id;
        created = true;
    }

    await db.quotation.update({ where: { id: quotation.id }, data: { lead_id: leadId } });
    await db.crmActivity.create({
        data: {
            leadId,
            type: 'NOTA',
            occurredAt: now,
            authorId: actor?.userId || actor?.id || null,
            note: created
                ? `Oportunidad creada desde la cotización ${code}${client ? `, para el cliente ${client.name}` : ''}.`
                : `La cotización ${code} quedó ligada a esta oportunidad.`
        }
    });
    if (!created && EVENT_FOR_STATUS[quotation.status]) {
        await syncLeadStageFromQuotation(db, { ...quotation, lead_id: leadId }, EVENT_FOR_STATUS[quotation.status], { now });
    }
    return { linked: true, created, party: await readQuotationParty(db, leadId) };
};
