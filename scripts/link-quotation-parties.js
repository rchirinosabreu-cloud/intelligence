#!/usr/bin/env node
// Liga con su tercero las cotizaciones que ya existían (punto 1 de la solicitud de Elisa, 23 de octubre de 2026).
//
// Desde ese día cada cotización queda ligada al guardarse: al cliente que ya existe o a su ficha de cliente
// potencial en el CRM. Las anteriores lo harían solo al volver a guardarse; este script lo hace de una vez, con
// la misma regla (`linkQuotationParty`), de la más vieja a la más nueva, para que dos versiones de la misma
// propuesta caigan en la misma oportunidad. Simula por defecto; escribe solo con `--confirmar LIGAR`.
//
//   node scripts/link-quotation-parties.js                    # muestra qué haría
//   node scripts/link-quotation-parties.js --confirmar LIGAR  # liga y crea las oportunidades que falten
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { isQuotationPartyKnown, matchQuotationClient, matchQuotationLead, quotationParty } from '../src/lib/quotationParty.js';
import { linkQuotationParty } from '../src/services/quotationPartyService.js';

const confirm = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'LIGAR';
const prisma = new PrismaClient();
const code = (quotation) => `COT-${String(quotation.consecutive).padStart(4, '0')}`;

try {
    const quotations = await prisma.quotation.findMany({ where: { lead_id: null }, orderBy: { created_at: 'asc' } });
    const clients = await prisma.client.findMany({ select: { id: true, name: true, legalName: true, email: true, isArchived: true } });
    const leads = await prisma.crmLead.findMany({
        where: { archivedAt: null },
        select: { id: true, stage: true, clientId: true, email: true, company: true, companyKey: true, contactName: true, updatedAt: true, archivedAt: true }
    });
    // En la simulación, las oportunidades que se crearían también reciben a las cotizaciones siguientes.
    const planned = [];
    let skipped = 0;
    console.log(`${quotations.length} cotización(es) sin tercero.`);
    for (const quotation of quotations) {
        const party = quotationParty(quotation);
        if (!isQuotationPartyKnown(party)) { skipped += 1; console.log(`  - ${code(quotation)}  sin datos del cliente: se queda como está`); continue; }
        const client = matchQuotationClient(clients, party);
        const lead = matchQuotationLead([...leads, ...planned], party, client?.id ?? null);
        const target = lead
            ? (lead.planned ? `la oportunidad nueva de «${lead.company || lead.contactName}»` : 'su oportunidad abierta del CRM')
            : 'una oportunidad nueva en el CRM';
        if (!lead) planned.push({ id: `nueva-${planned.length}`, planned: true, stage: 'POR_GESTIONAR', clientId: client?.id ?? null, email: party.email, company: party.company, companyKey: party.nameKey, contactName: party.contactName, updatedAt: new Date() });
        console.log(`  - ${code(quotation)}  «${party.name || party.email}» → ${client ? `cliente ${client.name}` : 'cliente potencial'}, en ${target}`);
    }
    console.log(`\n${quotations.length - skipped} por ligar · ${planned.length} oportunidad(es) nueva(s) · ${skipped} sin datos.`);
    if (!confirm) {
        console.log('Simulación: no se escribió nada. Para ligarlas: node scripts/link-quotation-parties.js --confirmar LIGAR');
    } else {
        let linked = 0;
        for (const quotation of quotations) {
            const result = await linkQuotationParty(prisma, quotation, {});
            if (result.linked) { linked += 1; console.log(`  ✔ ${code(quotation)} → ${result.party?.leadCode} (${result.party?.label}: ${result.party?.name})`); }
        }
        console.log(`\nListo: ${linked} cotización(es) ligadas.`);
    }
} finally {
    await prisma.$disconnect();
}
