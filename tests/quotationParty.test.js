import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    describeQuotationParty, isOpenLead, isQuotationPartyKnown, matchQuotationClient, matchQuotationLead, partyNameKey, quotationParty
} from '../src/lib/quotationParty.js';
import { normalizeCompanyKey } from '../src/services/crmService.js';
import { linkProspectClient, linkQuotationParty, listPartyCommercial } from '../src/services/quotationPartyService.js';
import { buildPartyRows, filterPartyRows, isPartyActive, partyContact, summarizeParties } from '../src/lib/clientDirectoryRows.js';

// Punto 1 de la solicitud de Elisa (20 de octubre de 2026): «al crear una cotización, el sistema deberá buscar si el
// cliente ya existe; si no existe, se generará su ficha en Terceros; si existe, se vinculará la cotización sin
// duplicar datos».

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('what a quotation says about its client, normalized', () => {
    assert.deepEqual(quotationParty({ client_company: ' Titanes S.A.S. ', client_name: 'Juan', client_email: 'JUAN@Titanes.co ', client_phone: '300' }), {
        company: 'Titanes S.A.S.', contactName: 'Juan', email: 'juan@titanes.co', phone: '300', name: 'Titanes S.A.S.', nameKey: 'titanes sas'
    });
    // Una persona natural se reconoce por su propio nombre.
    assert.equal(quotationParty({ client_name: 'Laura Gómez', client_email: 'no-es-correo' }).nameKey, 'laura gomez');
    assert.equal(quotationParty({ client_name: 'Laura', client_email: 'no-es-correo' }).email, null);
    // Un borrador vacío no es nadie: no se busca ni se crea nada.
    assert.equal(isQuotationPartyKnown(quotationParty({ client_name: 'Borrador', client_email: '' })), false);
    assert.equal(isQuotationPartyKnown(quotationParty({ client_name: '', client_email: 'a@b.co' })), true);
    // Una sola regla para agrupar nombres: la del CRM es esta misma.
    assert.equal(normalizeCompanyKey('Café  Altura S.A.S.'), partyNameKey('café altura sas'));
});

test('an existing client is found by email first, then by name or legal name, and never guessed', () => {
    const clients = [
        { id: 'c1', name: 'Titanes', legalName: 'Corporación Deportiva Los Titanes', email: 'pagos@titanes.co', isArchived: false },
        { id: 'c2', name: 'Nuva', legalName: null, email: null, isArchived: false },
        { id: 'c3', name: 'Nuva', legalName: null, email: null, isArchived: true },
        { id: 'c4', name: 'Endova', legalName: null, email: null, isArchived: false },
        { id: 'c5', name: 'Endova', legalName: null, email: null, isArchived: false }
    ];
    assert.equal(matchQuotationClient(clients, quotationParty({ client_company: 'Otro nombre', client_email: 'Pagos@Titanes.co' }))?.id, 'c1');
    assert.equal(matchQuotationClient(clients, quotationParty({ client_company: 'CORPORACION DEPORTIVA LOS TITANES' }))?.id, 'c1');
    // Entre una ficha vigente y una archivada del mismo nombre, la vigente.
    assert.equal(matchQuotationClient(clients, quotationParty({ client_company: 'nuva' }))?.id, 'c2');
    // Dos fichas vigentes con el mismo nombre: no se elige por nadie.
    assert.equal(matchQuotationClient(clients, quotationParty({ client_company: 'Endova' })), null);
    assert.equal(matchQuotationClient(clients, quotationParty({ client_company: 'Café Altura' })), null);
});

test('the open opportunity of the same client, email or company receives the quotation', () => {
    const leads = [
        { id: 'l-old', clientId: null, email: 'laura@cafealtura.co', companyKey: 'cafe altura', stage: 'CONTACTADO', updatedAt: '2026-10-01' },
        { id: 'l-new', clientId: null, email: null, companyKey: 'cafe altura', stage: 'NEGOCIACION', updatedAt: '2026-10-10' },
        { id: 'l-lost', clientId: null, email: 'laura@cafealtura.co', companyKey: 'cafe altura', stage: 'PERDIDO', updatedAt: '2026-10-20' },
        { id: 'l-titanes', clientId: 'c1', email: null, companyKey: 'titanes', stage: 'APROBADA', updatedAt: '2026-09-01' },
        { id: 'l-other', clientId: 'c9', email: null, companyKey: 'cafe altura', stage: 'CONTACTADO', updatedAt: '2026-10-22' }
    ];
    const cafe = quotationParty({ client_company: 'Café Altura', client_email: 'laura@cafealtura.co' });
    // El correo manda sobre el nombre, y una oportunidad perdida no recibe otra versión.
    assert.equal(matchQuotationLead(leads, cafe)?.id, 'l-old');
    assert.equal(matchQuotationLead(leads, quotationParty({ client_company: 'Café Altura' }))?.id, 'l-new');
    // Con ficha de cliente, la oportunidad de ese cliente; nunca la de otro cliente con el mismo nombre.
    assert.equal(matchQuotationLead(leads, quotationParty({ client_company: 'Titanes' }), 'c1')?.id, 'l-titanes');
    // Un cliente con una oportunidad vieja ya ligada y otra nueva del mismo correo: la propuesta nueva va con la nueva.
    const brieva = [
        { id: 'l-89', clientId: 'c-brieva', email: null, companyKey: 'grupo brieva', stage: 'APROBADA', updatedAt: '2026-08-24' },
        { id: 'l-177', clientId: null, email: 'gerencia@brieva.co', companyKey: 'grupo brieva', stage: 'PROPUESTA_ENVIADA', updatedAt: '2026-10-14' }
    ];
    assert.equal(matchQuotationLead(brieva, quotationParty({ client_company: 'Grupo Brieva', client_email: 'gerencia@brieva.co' }), 'c-brieva')?.id, 'l-177');
    assert.equal(isOpenLead({ stage: 'GANADO' }), false);
    assert.equal(isOpenLead({ stage: 'APROBADA', archivedAt: null }), true);
    assert.equal(isOpenLead({ stage: 'CONTACTADO', archivedAt: '2026-10-01' }), false);
});

test('a linked party reads as a client or as a potential client', () => {
    assert.deepEqual(describeQuotationParty({ id: 'l1', consecutive: 7, company: 'Titanes', client: { id: 'c1', name: 'Titanes' } }),
        { kind: 'CLIENTE', label: 'Cliente', name: 'Titanes', clientId: 'c1', leadId: 'l1', leadCode: 'CRM-0007' });
    assert.equal(describeQuotationParty({ id: 'l2', consecutive: 12, company: null, contactName: 'Laura', client: null }).kind, 'CLIENTE_POTENCIAL');
    assert.equal(describeQuotationParty(null), null);
});

// Una base en memoria con lo justo que tocan el CRM y el enlace.
const fakeDb = ({ clients = [], leads = [] } = {}) => {
    const state = { leads: leads.map((lead) => ({ activities: [], quotations: [], consecutive: 1, ...lead })), quotationUpdates: [], activities: [], leadUpdates: [] };
    const findLead = (id) => state.leads.find((lead) => lead.id === id) || null;
    const withClient = (lead) => (lead ? { ...lead, client: clients.find((client) => client.id === lead.clientId) || null } : null);
    return {
        state,
        client: {
            findMany: async () => clients,
            findUnique: async ({ where }) => clients.find((client) => client.id === where.id) || null
        },
        crmLead: {
            findMany: async () => state.leads,
            findUnique: async ({ where }) => withClient(findLead(where.id)),
            create: async ({ data }) => {
                const lead = { id: `lead-${state.leads.length + 1}`, consecutive: 90 + state.leads.length, activities: [], quotations: [], request: null, createdAt: new Date(), updatedAt: new Date(), ...data };
                state.leads.push(lead);
                return lead;
            },
            update: async ({ where, data }) => {
                state.leadUpdates.push({ id: where.id, data });
                Object.assign(findLead(where.id), data);
                return findLead(where.id);
            }
        },
        quotation: { update: async (args) => { state.quotationUpdates.push(args); return args; } },
        crmActivity: { create: async ({ data }) => { state.activities.push(data); return data; } },
        teamMember: { findFirst: async () => null }
    };
};

test('a quotation for a new prospect creates its opportunity in the CRM, already at the right stage', async () => {
    const db = fakeDb({ clients: [{ id: 'c1', name: 'Titanes', email: null, isArchived: false }] });
    const quotation = { id: 'q1', consecutive: 42, status: 'ACTIVA', client_company: 'Café Altura', client_name: 'Laura Gómez', client_email: 'laura@cafealtura.co', client_phone: '+57 300', total_amount: '3200000', currency: 'COP', lead_id: null };
    const result = await linkQuotationParty(db, quotation, { userId: 'u1' }, { now: new Date('2026-10-23T15:00:00Z') });
    assert.equal(result.created, true);
    const lead = db.state.leads[0];
    assert.equal(lead.stage, 'PROPUESTA_ENVIADA');
    assert.equal(lead.company, 'Café Altura');
    assert.equal(lead.contactName, 'Laura Gómez');
    assert.equal(lead.email, 'laura@cafealtura.co');
    assert.equal(lead.clientId, null);
    assert.equal(lead.quotationId, 'q1');
    assert.equal(lead.originDetail, 'Cotización COT-0042');
    assert.equal(Number(lead.quotedValue), 3200000);
    assert.deepEqual(db.state.quotationUpdates[0], { where: { id: 'q1' }, data: { lead_id: lead.id } });
    assert.match(db.state.activities[0].note, /Oportunidad creada desde la cotización COT-0042/);
    assert.equal(result.party.kind, 'CLIENTE_POTENCIAL');
    assert.equal(result.party.name, 'Café Altura');
});

test('a quotation for an existing client links to it without duplicating anything', async () => {
    const db = fakeDb({
        clients: [{ id: 'c1', name: 'Titanes', legalName: 'Corporación Deportiva Los Titanes', email: 'pagos@titanes.co', isArchived: false }],
        leads: [{ id: 'l-titanes', clientId: null, email: 'pagos@titanes.co', company: 'Titanes', companyKey: 'titanes', stage: 'CONTACTADO', updatedAt: '2026-10-01', quotationId: null, quotedValue: null }]
    });
    const quotation = { id: 'q2', consecutive: 43, status: 'BORRADOR', client_company: 'Titanes', client_name: 'Juan', client_email: 'pagos@titanes.co', total_amount: '0', currency: 'COP', lead_id: null };
    const result = await linkQuotationParty(db, quotation, {}, { now: new Date('2026-10-23T15:00:00Z') });
    assert.equal(result.created, false);
    assert.equal(db.state.leads.length, 1, 'no se crea otra oportunidad');
    // La oportunidad que no tenía ficha queda apuntando al cliente que sí existe.
    assert.equal(db.state.leads[0].clientId, 'c1');
    assert.equal(db.state.leads[0].quotationId, 'q2');
    assert.equal(result.party.kind, 'CLIENTE');
    assert.equal(result.party.name, 'Titanes');
    assert.match(db.state.activities[0].note, /COT-0043 quedó ligada/);
});

test('an existing client without an open opportunity gets one, marked as a returning client', async () => {
    const db = fakeDb({ clients: [{ id: 'c1', name: 'Titanes', email: null, isArchived: false }] });
    await linkQuotationParty(db, { id: 'q3', consecutive: 44, status: 'BORRADOR', client_company: 'TITANES', client_name: 'Juan', client_email: '', total_amount: '0', lead_id: null });
    assert.equal(db.state.leads[0].clientId, 'c1');
    assert.equal(db.state.leads[0].origin, 'CLIENTE_ANTERIOR');
    assert.equal(db.state.leads[0].stage, 'POR_GESTIONAR');
});

test('a quotation already linked, or without client data, is left alone', async () => {
    const db = fakeDb({ leads: [{ id: 'l1', consecutive: 5, company: 'Nuva', clientId: null }] });
    const linked = await linkQuotationParty(db, { id: 'q4', lead_id: 'l1', client_company: 'Otra' });
    assert.equal(linked.linked, false);
    assert.equal(linked.party.leadId, 'l1');
    const empty = await linkQuotationParty(db, { id: 'q5', lead_id: null, client_name: 'Borrador', client_email: '' });
    assert.deepEqual(empty, { linked: false, created: false, party: null });
    assert.equal(db.state.quotationUpdates.length, 0);
});

test('a potential client that becomes a client points its opportunity to the new card', async () => {
    const db = fakeDb({ clients: [{ id: 'c1', name: 'Café Altura' }], leads: [{ id: 'lead-cafe', clientId: null }, { id: 'lead-other', clientId: 'c9' }] });
    assert.deepEqual(await linkProspectClient(db, 'lead-cafe', 'c1', { userId: 'u1' }), { leadId: 'lead-cafe', clientId: 'c1' });
    assert.equal(db.state.leads[0].clientId, 'c1');
    assert.match(db.state.activities[0].note, /ficha del cliente Café Altura/);
    await assert.rejects(linkProspectClient(db, 'lead-other', 'c1'), { statusCode: 409, code: 'PROSPECT_ALREADY_CLIENT' });
    await assert.rejects(linkProspectClient(db, 'nope', 'c1'), { statusCode: 404, code: 'PROSPECT_NOT_FOUND' });
    await assert.rejects(linkProspectClient(db, 'lead-cafe', 'nope'), { statusCode: 404, code: 'PROSPECT_CLIENT_NOT_FOUND' });
});

test('Terceros receives the potential clients and the quotations of each client', async () => {
    const quotation = (id, consecutive, status, created) => ({ id, consecutive, status, total_amount: '1000', currency: 'COP', created_at: new Date(created), accepted_at: null });
    const db = {
        crmLead: {
            findMany: async ({ where }) => {
                assert.deepEqual(where, { archivedAt: null, quotations: { some: {} } });
                return [
                    { id: 'l1', consecutive: 3, company: 'Café Altura', contactName: 'Laura', email: 'l@c.co', phone: null, stage: 'PROPUESTA_ENVIADA', clientId: null, owner: { id: 't1', name: 'Francisco' }, quotations: [quotation('q1', 42, 'ACTIVA', '2026-10-15')] },
                    { id: 'l2', consecutive: 4, company: 'Titanes', clientId: 'c1', owner: null, quotations: [quotation('q2', 30, 'APROBADA', '2026-08-01')] },
                    { id: 'l3', consecutive: 5, company: 'Titanes', clientId: 'c1', owner: null, quotations: [quotation('q3', 45, 'BORRADOR', '2026-10-20')] }
                ];
            }
        }
    };
    const { prospects, quotationsByClient } = await listPartyCommercial(db);
    assert.equal(prospects.length, 1);
    assert.equal(prospects[0].code, 'CRM-0003');
    assert.equal(prospects[0].quotations[0].code, 'COT-0042');
    assert.deepEqual(quotationsByClient.c1.map((item) => item.code), ['COT-0045', 'COT-0030']);
});

test('the Terceros list shows potential clients as their own role, with their quotations', () => {
    const commercial = {
        prospects: [
            { id: 'l1', code: 'CRM-0003', company: 'Café Altura', contactName: 'Laura', email: 'laura@cafealtura.co', phone: '300', stage: 'PROPUESTA_ENVIADA', quotations: [{ id: 'q1' }] },
            { id: 'l2', code: 'CRM-0004', company: null, contactName: 'Pedro', email: null, phone: null, stage: 'PERDIDO', quotations: [] }
        ],
        quotationsByClient: { c1: [{ id: 'q2' }] }
    };
    const rows = buildPartyRows([{ sourceId: 'c1', clientId: 'c1', name: 'Titanes', profile: { isArchived: false } }], [], commercial);
    assert.deepEqual(rows.map((row) => [row.name, row.roles]), [['Titanes', ['CLIENTE']], ['Café Altura', ['CLIENTE_POTENCIAL']], ['Pedro', ['CLIENTE_POTENCIAL']]]);
    assert.equal(rows[0].quotations.length, 1);
    assert.equal(rows[1].sourceId, 'prospecto:l1');
    assert.equal(partyContact(rows[1]), '300 · laura@cafealtura.co');
    // Una oportunidad perdida queda como tercero inactivo, no desaparece.
    assert.equal(isPartyActive(rows[1]), true);
    assert.equal(isPartyActive(rows[2]), false);
    assert.equal(summarizeParties(rows).prospects, 2);
    assert.deepEqual(filterPartyRows(rows, { role: 'CLIENTE_POTENCIAL', status: 'ACTIVO' }).map((row) => row.name), ['Café Altura']);
    assert.deepEqual(filterPartyRows(rows, { search: 'laura@' }).map((row) => row.name), ['Café Altura']);
});

test('quotations link their party on create, update and acceptance, and a failure never undoes the quotation', () => {
    const controller = read('../src/controllers/quotationController.js');
    assert.match(controller, /const linkParty = async \(quotation, actor\) => \{\s*try \{/);
    assert.equal(controller.match(/await linkParty\(/g)?.length, 3);
    assert.match(controller, /Tercero de la cotización no ligado/);
    const routes = read('../src/routes/api/financials.js');
    assert.match(routes, /router\.get\('\/parties\/commercial', requireFinancialAccess, listPartyCommercialHandler\)/);
    assert.match(routes, /router\.post\('\/parties\/prospects\/:leadId\/client', requireFinancialWrite, linkProspectClientHandler\)/);
});

test('the quotation form says which party it belongs to, and Terceros shows potential clients', () => {
    const form = read('../src/components/modules/Quotations/QuotationForm.jsx');
    assert.match(form, /data-quotation-party=\{party\?\.kind \|\| 'NONE'\}/);
    assert.match(form, /if \(data\.party\) setParty\(data\.party\)/);
    const directory = read('../src/components/modules/financial/FinancialPartiesDirectory.jsx');
    assert.match(directory, /data-prospect-card/);
    assert.match(directory, /data-party-quotations/);
    assert.match(directory, /\/parties\/prospects\/\$\{prospect\.id\}\/client/);
    assert.match(read('../src/utils/financialQueryCache.js'), /'financial-party-commercial'/);
});
