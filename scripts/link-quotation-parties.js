#!/usr/bin/env node
// Liga con su tercero las cotizaciones que ya existían (punto 1 de la solicitud de Elisa, 23 de octubre de 2026).
//
// Desde ese día cada cotización queda ligada al guardarse: al cliente que ya existe o a su ficha de cliente
// potencial en el CRM. Las anteriores lo harían solo al volver a guardarse; este script lo hace de una vez, con
// la misma regla (`linkQuotationParty`), de la más vieja a la más nueva, para que dos versiones de la misma
// propuesta caigan en la misma oportunidad.
//
// Lo que acordó Rodny ese día para no llenar el CRM de oportunidades viejas: una oportunidad que el script
// tenga que **crear** queda en la etapa que dicen sus cotizaciones —
//   - con alguna aprobada: «Ganado» (ya se contrató; no es una formalización pendiente);
//   - con alguna todavía vigente: abierta, en su etapa;
//   - todas vencidas sin respuesta: «Perdido», con el motivo «Cotización vencida sin respuesta». Comercial la
//     reabre en el CRM si sigue viva.
// Las oportunidades que ya existían no cambian de etapa por este script más allá de lo que ya hace la regla
// (una cotización emitida o aceptada nunca la mueve hacia atrás).
//
//   node scripts/link-quotation-parties.js                                   # muestra qué haría
//   node scripts/link-quotation-parties.js --omitir COT-0012                 # deja una fuera (se repite)
//   node scripts/link-quotation-parties.js --cliente COT-0022=FoobeSpain     # dice a qué ficha va (se repite)
//   node scripts/link-quotation-parties.js --oportunidad COT-0022=CRM-0178   # dice a qué oportunidad va (se repite)
//   node scripts/link-quotation-parties.js ... --confirmar LIGAR             # escribe
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { isQuotationPartyKnown, matchQuotationClient, matchQuotationLead, partyNameKey, quotationParty } from '../src/lib/quotationParty.js';
import { linkQuotationParty } from '../src/services/quotationPartyService.js';
import { changeStage } from '../src/services/crmService.js';

const argv = process.argv.slice(2);
const flags = (name) => argv.reduce((values, token, index) => (token === name && argv[index + 1] ? [...values, argv[index + 1]] : values), []);
const confirm = flags('--confirmar')[0] === 'LIGAR';
const omitted = new Set(flags('--omitir').map((value) => value.toUpperCase()));
const pairs = (name) => Object.fromEntries(flags(name).map((value) => { const [key, ...rest] = value.split('='); return [key.toUpperCase(), rest.join('=')]; }));
const forcedNames = pairs('--cliente');
const forcedLeadCodes = pairs('--oportunidad');

const LOST_REASON = 'Cotización vencida sin respuesta (ligada al ordenar Terceros, 23 de octubre de 2026). Reabrir si sigue viva.';
const prisma = new PrismaClient();
const code = (quotation) => `COT-${String(quotation.consecutive).padStart(4, '0')}`;
const now = new Date();
const isExpired = (quotation) => quotation.status !== 'APROBADA' && quotation.expires_at && new Date(quotation.expires_at) < now;

// La etapa final de una oportunidad que crea el script, según todas sus cotizaciones. La propuesta vencida de
// alguien que ya es cliente (una renovación, un servicio más) queda abierta: es más probable que siga viva, y la
// cierra Comercial si no.
const finalStage = (quotations, { isClient = false } = {}) => {
    if (quotations.some((quotation) => quotation.status === 'APROBADA')) return 'GANADO';
    if (isClient || quotations.some((quotation) => !isExpired(quotation))) return null; // la que puso la regla
    return 'PERDIDO';
};
const STAGE_LABEL = { GANADO: 'Ganado', PERDIDO: 'Perdido (vencida sin respuesta)' };

try {
    const quotations = await prisma.quotation.findMany({ where: { lead_id: null }, orderBy: { created_at: 'asc' } });
    const clients = await prisma.client.findMany({ select: { id: true, name: true, legalName: true, email: true, isArchived: true } });
    const forcedClient = {};
    for (const [quotationCode, name] of Object.entries(forcedNames)) {
        const found = clients.filter((client) => [client.name, client.legalName].some((value) => partyNameKey(value) === partyNameKey(name)));
        if (found.length !== 1) throw new Error(`«${name}» (para ${quotationCode}) no es una sola ficha de cliente: ${found.length} coinciden.`);
        forcedClient[quotationCode] = found[0];
    }
    const leads = await prisma.crmLead.findMany({
        where: { archivedAt: null },
        select: { id: true, consecutive: true, stage: true, clientId: true, email: true, company: true, companyKey: true, contactName: true, updatedAt: true, archivedAt: true }
    });
    const forcedLead = {};
    for (const [quotationCode, leadCode] of Object.entries(forcedLeadCodes)) {
        const lead = leads.find((item) => `CRM-${String(item.consecutive).padStart(4, '0')}` === leadCode.toUpperCase());
        if (!lead) throw new Error(`La oportunidad ${leadCode} (para ${quotationCode}) no existe o está archivada.`);
        forcedLead[quotationCode] = lead;
    }

    // Simulación: las oportunidades que se crearían también reciben a las cotizaciones siguientes.
    const planned = [];
    const rows = [];
    for (const quotation of quotations) {
        const party = quotationParty(quotation);
        if (omitted.has(code(quotation))) { rows.push({ quotation, note: 'se deja fuera a pedido' }); continue; }
        if (!isQuotationPartyKnown(party)) { rows.push({ quotation, note: 'sin datos del cliente: se queda como está' }); continue; }
        const client = forcedClient[code(quotation)] || matchQuotationClient(clients, party);
        let lead = forcedLead[code(quotation)] || matchQuotationLead([...leads, ...planned], party, client?.id ?? null);
        // Como el servicio: una oportunidad existente sin ficha queda apuntando al cliente que se encontró.
        if (lead && !lead.planned && client && !lead.clientId) lead.clientId = client.id;
        if (!lead) {
            lead = { id: `nueva-${planned.length}`, planned: true, stage: 'POR_GESTIONAR', clientId: client?.id ?? null, email: party.email, company: party.company, companyKey: party.nameKey, contactName: party.contactName, updatedAt: now, quotations: [] };
            planned.push(lead);
        } else if (lead.planned && client && !lead.clientId) lead.clientId = client.id;
        if (lead.planned) lead.quotations.push(quotation);
        // Como al escribir: ligar mueve la oportunidad, así que pasa a ser la más reciente para las siguientes.
        lead.updatedAt = new Date(now.getTime() + rows.length);
        rows.push({ quotation, party, client, lead });
    }

    console.log(`${quotations.length} cotización(es) sin tercero.\n`);
    for (const { quotation, party, client, lead, note } of rows) {
        const head = `  - ${code(quotation)}  ${quotation.status === 'APROBADA' ? 'aprobada' : isExpired(quotation) ? 'vencida ' : 'vigente '}`;
        if (note) { console.log(`${head} ${note}`); continue; }
        const where = lead.planned
            ? `oportunidad nueva «${lead.company || lead.contactName || lead.email}» → ${STAGE_LABEL[finalStage(lead.quotations, { isClient: Boolean(lead.clientId) })] || 'abierta'}`
            : `su oportunidad CRM-${String(lead.consecutive).padStart(4, '0')} (${lead.stage})`;
        console.log(`${head} «${party.name || party.email}» → ${client ? `cliente ${client.name}` : 'cliente potencial'}, ${where}`);
    }
    const linkable = rows.filter((row) => row.lead).length;
    const byStage = planned.reduce((acc, lead) => { const stage = finalStage(lead.quotations, { isClient: Boolean(lead.clientId) }) || 'ABIERTA'; acc[stage] = (acc[stage] || 0) + 1; return acc; }, {});
    console.log(`\n${linkable} por ligar · ${planned.length} oportunidad(es) nueva(s): ${Object.entries(byStage).map(([stage, count]) => `${count} ${STAGE_LABEL[stage] || 'abierta(s)'}`).join(', ') || 'ninguna'} · ${rows.length - linkable} sin ligar.`);

    if (!confirm) {
        console.log('Simulación: no se escribió nada. Para escribir, repite el comando con --confirmar LIGAR.');
    } else {
        const created = new Map(); // leadId → cotizaciones
        let linked = 0;
        for (const { quotation, lead } of rows) {
            if (!lead) continue;
            const result = await linkQuotationParty(prisma, quotation, {}, { now, clientId: forcedClient[code(quotation)]?.id || null, leadId: forcedLead[code(quotation)]?.id || null });
            if (!result.linked) continue;
            linked += 1;
            if (result.created) created.set(result.party.leadId, Object.assign([quotation], { isClient: Boolean(result.party.clientId) }));
            else if (created.has(result.party.leadId)) {
                const list = created.get(result.party.leadId);
                list.push(quotation);
                if (result.party.clientId) list.isClient = true;
            }
            console.log(`  ✔ ${code(quotation)} → ${result.party.leadCode} (${result.party.label}: ${result.party.name})`);
        }
        for (const [leadId, leadQuotations] of created) {
            const stage = finalStage(leadQuotations, { isClient: leadQuotations.isClient });
            if (!stage) continue;
            await changeStage(prisma, leadId, stage === 'PERDIDO'
                ? { stage, lostReason: LOST_REASON }
                : { stage, note: 'Cotización aprobada: ligada al ordenar Terceros (23 de octubre de 2026).' }, {}, now);
            console.log(`  · oportunidad ${leadId} → ${STAGE_LABEL[stage]}`);
        }
        console.log(`\nListo: ${linked} cotización(es) ligadas, ${created.size} oportunidad(es) creadas.`);
    }
} finally {
    await prisma.$disconnect();
}
