// A quién se le cotiza (Elisa, 20 de octubre de 2026, punto 1 de la solicitud de actualizaciones: «al crear una
// cotización, el sistema deberá buscar si el cliente ya existe; si no existe, se generará su ficha en Terceros; si
// existe, se vinculará la cotización sin duplicar datos»).
//
// La cotización no guarda su propio vínculo con el cliente: cuelga de una oportunidad del CRM (`Quotation.lead_id`),
// y la oportunidad apunta a la ficha del cliente cuando ya lo es (`CrmLead.clientId`). Una oportunidad sin ficha es
// un cliente potencial. Así la ruta comercial, Terceros y la ficha del cliente leen lo mismo.
// Lógica pura: la usan el servicio que enlaza y las pruebas.

/** La misma clave del CRM para agrupar nombres escritos casi igual («Titanes S.A.S.» y «titanes sas»). */
export const partyNameKey = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const key = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return key || null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const partyEmail = (value) => {
    const email = String(value ?? '').trim().toLowerCase();
    return EMAIL.test(email) ? email : null;
};

// El nombre con que nace un borrador vacío no es un cliente.
const PLACEHOLDER_NAMES = new Set(['borrador']);

/** Lo que una cotización dice de su cliente, ya normalizado. */
export const quotationParty = (quotation = {}) => {
    const company = String(quotation.client_company ?? '').trim() || null;
    const rawName = String(quotation.client_name ?? '').trim();
    const contactName = rawName && !PLACEHOLDER_NAMES.has(rawName.toLowerCase()) ? rawName : null;
    const phone = String(quotation.client_phone ?? '').trim() || null;
    // Una empresa se reconoce por su nombre; una persona natural, por el suyo.
    const name = company || contactName;
    return { company, contactName, email: partyEmail(quotation.client_email), phone, name, nameKey: partyNameKey(name) };
};

/** Si la cotización ya dice lo suficiente para buscar o crear su tercero. */
export const isQuotationPartyKnown = (party) => Boolean(party?.nameKey || party?.email);

const unique = (items) => (items.length === 1 ? items[0] : null);

/**
 * La ficha de cliente que corresponde a la cotización, o null. Solo un resultado inequívoco: con dos
 * candidatas no se elige por nadie. Primero el correo; después el nombre (el de la ficha o su razón
 * social). Entre dos fichas iguales, una archivada no compite con una vigente.
 */
export const matchQuotationClient = (clients = [], party = {}) => {
    const pick = (candidates) => unique(candidates) || unique(candidates.filter((client) => !client.isArchived));
    if (party.email) {
        const byEmail = pick(clients.filter((client) => partyEmail(client.email) === party.email));
        if (byEmail) return byEmail;
    }
    if (party.nameKey) {
        return pick(clients.filter((client) => [client.name, client.legalName].some((value) => partyNameKey(value) === party.nameKey)));
    }
    return null;
};

const CLOSED_STAGES = new Set(['PERDIDO', 'DESCARTADO', 'GANADO']);
/** Una oportunidad abierta: la que sigue en la ruta comercial y puede recibir otra versión de la propuesta. */
export const isOpenLead = (lead) => Boolean(lead) && !lead.archivedAt && !CLOSED_STAGES.has(lead.stage);

/**
 * La oportunidad abierta de ese tercero, o null: la del mismo cliente, o la del mismo correo, o la de la misma
 * empresa. Si hay varias, la que se movió más recientemente.
 */
export const matchQuotationLead = (leads = [], party = {}, clientId = null) => {
    const open = leads.filter(isOpenLead);
    const newest = (candidates) => candidates.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
    if (clientId) {
        const byClient = newest(open.filter((lead) => lead.clientId === clientId));
        if (byClient) return byClient;
    }
    // Sin ficha de cliente, la oportunidad de otro cliente no es la suya aunque coincida el nombre.
    const free = open.filter((lead) => !lead.clientId || lead.clientId === clientId);
    if (party.email) {
        const byEmail = newest(free.filter((lead) => partyEmail(lead.email) === party.email));
        if (byEmail) return byEmail;
    }
    if (party.nameKey) {
        return newest(free.filter((lead) => (lead.companyKey || partyNameKey(lead.company || lead.contactName)) === party.nameKey));
    }
    return null;
};

/** Cómo se presenta el tercero de una cotización: cliente con ficha o cliente potencial. */
export const describeQuotationParty = (lead) => {
    if (!lead) return null;
    const code = `CRM-${String(lead.consecutive ?? 0).padStart(4, '0')}`;
    if (lead.client) return { kind: 'CLIENTE', label: 'Cliente', name: lead.client.name, clientId: lead.client.id, leadId: lead.id, leadCode: code };
    return { kind: 'CLIENTE_POTENCIAL', label: 'Cliente potencial', name: lead.company || lead.contactName || 'Sin nombre', clientId: null, leadId: lead.id, leadCode: code };
};
