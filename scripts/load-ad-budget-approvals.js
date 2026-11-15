import prisma from '../src/lib/prisma.js';
import { bogotaToday } from '../src/services/adBudgetService.js';
import { adApprovalKey, currentContractOf } from '../src/lib/adBudgetApproval.js';
import { adBudgetName } from '../src/lib/adBudgets.js';

// La pauta aprobada pasa de la pauta al contrato del cliente (Rodny, 13 de noviembre de 2026: «el presupuesto de pauta
// debe vivir en la ficha operativa del cliente»). Copia, una sola vez, la cifra y la moneda de cada pauta vigente a
// `ClientContract.adBudgets` del contrato vigente de su cliente, si todavía no tiene esa plataforma y marca. Simula por
// defecto; escribe solo con `--confirmar CARGAR`. Se puede correr dos veces: lo que ya está se salta. No toca las pautas.
const confirmed = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'CARGAR';
const today = bogotaToday();

const budgets = await prisma.adBudget.findMany({
    where: { status: { not: 'TERMINADA' } },
    include: { client: { select: { id: true, name: true, isArchived: true, contracts: { select: { id: true, startDate: true, adBudgets: true } } } } }
});

const plan = new Map();
for (const budget of budgets) {
    const name = adBudgetName(budget);
    if (!budget.client || budget.client.isArchived) { console.log(`  SIN CLIENTE  ${name}`); continue; }
    const contract = currentContractOf(budget.client.contracts || [], today);
    if (!contract) { console.log(`  SIN CONTRATO ${name}: ${budget.client.name} no tiene contrato vigente; se agrega a mano en la ficha`); continue; }
    const rows = Array.isArray(contract.adBudgets) ? contract.adBudgets : [];
    if (rows.some((row) => adApprovalKey(row) === adApprovalKey(budget))) { console.log(`  YA ESTÁ     ${name}`); continue; }
    if (!plan.has(contract.id)) plan.set(contract.id, { contract, client: budget.client.name, rows: [...rows], added: [] });
    const entry = { platform: budget.platform, brand: budget.brand || null, currency: budget.currency, amount: Number(budget.amount) };
    plan.get(contract.id).rows.push(entry);
    plan.get(contract.id).added.push(`${name}: ${budget.currency} ${Number(budget.amount)}`);
}

for (const { client, added } of plan.values()) for (const line of added) console.log(`  AGREGAR     ${client} · ${line}`);

if (!confirmed) {
    console.log(`\nSimulación: ${[...plan.values()].reduce((sum, item) => sum + item.added.length, 0)} entradas por agregar. Para cargar: node scripts/load-ad-budget-approvals.js --confirmar CARGAR`);
} else {
    let written = 0;
    for (const { contract, rows, added } of plan.values()) {
        await prisma.clientContract.update({ where: { id: contract.id }, data: { adBudgets: rows } });
        written += added.length;
    }
    console.log(`\n${written} entradas agregadas a ${plan.size} contratos.`);
}
await prisma.$disconnect();
