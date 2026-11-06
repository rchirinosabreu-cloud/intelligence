import prisma from '../src/lib/prisma.js';
import { adBudgetService, bogotaToday } from '../src/services/adBudgetService.js';
import { adCycleFor, clientCutDay } from '../src/lib/adBudgets.js';
import { memberHasArea } from '../src/lib/teamAreas.js';
import { MEETING_BUDGETS, MEETING_DAY, matchResponsible, planSeed } from './lib/adBudgetSeed.js';

// Carga inicial de Pautas con lo dicho en la reunión del 6 de noviembre de 2026. Simula por defecto; escribe solo con
// `--confirmar CARGAR`. Se puede correr dos veces: lo que ya existe se salta. No toca nada que no sea crear pautas nuevas.
const confirmed = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'CARGAR';

const [clients, team, existing] = await Promise.all([
    prisma.client.findMany({ where: { isArchived: false }, select: { id: true, name: true, contracts: { select: { startDate: true, cutDay: true } } } }),
    prisma.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true, areas: true } }),
    prisma.adBudget.findMany({ select: { clientId: true, brand: true, platform: true } })
]);
const today = bogotaToday();
const closeOf = (client, row) => adCycleFor({ kind: 'MENSUAL' }, { cutDay: row.cutDay || clientCutDay(client.contracts, today).cutDay, today }).end;
const responsible = matchResponsible(team, (member) => memberHasArea(member, 'PAUTA'));
const plan = planSeed({ clients, existing, closeOf });

console.log(`Quien la lleva: ${responsible?.name || 'SIN ENCONTRAR: las pautas quedan sin responsable'}`);
for (const item of plan) {
    const name = [item.row.client, item.row.brand].filter(Boolean).join(' · ');
    if (item.action === 'SIN_CLIENTE') console.log(`  SIN FICHA   ${name}: no hay un solo cliente con ese nombre`);
    else if (item.action === 'YA_EXISTE') console.log(`  YA EXISTE   ${name}`);
    else console.log(`  CREAR       ${name}: ${item.row.currency} ${item.row.amount}, cierra ${item.end}${item.differs ? ` (en la reunión se dijo ${item.row.closesOn})` : ''}`);
}

if (!confirmed) {
    console.log('\nSimulación: no se escribió nada. Para cargar: node scripts/load-ad-budgets.js --confirmar CARGAR');
} else {
    const service = adBudgetService(prisma);
    let created = 0;
    for (const { row, client, action } of plan) {
        if (action !== 'CREAR') continue;
        const saved = await service.create({
            clientId: client.id, brand: row.brand || '', platform: 'META', kind: 'MENSUAL', currency: row.currency, amount: row.amount, cutDay: row.cutDay || null,
            objective: row.objective || '', payer: 'POR_DEFINIR', responsibleId: responsible?.id || null, notes: row.notes
        }, null);
        if (row.spent !== undefined) await service.recordSpend(saved.id, { spent: row.spent, readOn: MEETING_DAY, note: 'Dicho en la reunión de pautas' }, null);
        created += 1;
    }
    console.log(`\n${created} de ${MEETING_BUDGETS.length} pautas creadas.`);
}
await prisma.$disconnect();
