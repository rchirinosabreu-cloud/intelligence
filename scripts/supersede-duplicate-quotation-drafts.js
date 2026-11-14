// Los borradores que quedaron atrás de una cotización ya emitida (Elisa, 13 de noviembre de 2026: «¿por qué hay
// cotizaciones repetidas para un mismo cliente, unas en borrador y otras activas?»). Desde hoy, emitir una
// cotización reemplaza sola los otros borradores de la oportunidad; esto limpia lo que ya estaba: en cada
// oportunidad con una cotización emitida o aprobada, sus borradores pasan a REEMPLAZADA con nota en la bitácora.
// No toca dos emitidas del mismo cliente (Amedline 20/21, Rossana Truco 33/34): eso lo decide Comercial.
//
//   node scripts/supersede-duplicate-quotation-drafts.js                       # simula
//   node scripts/supersede-duplicate-quotation-drafts.js --confirmar REEMPLAZAR  # escribe
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { supersedeSiblingDrafts } from '../src/services/quotationDraftService.js';

const confirm = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'REEMPLAZAR';
const code = (n) => `COT-${String(n).padStart(4, '0')}`;

const rows = await prisma.quotation.findMany({
  where: { lead_id: { not: null } },
  select: { id: true, consecutive: true, status: true, lead_id: true, client_company: true, client_name: true, issued_at: true, created_at: true },
  orderBy: { consecutive: 'asc' }
});
const byLead = new Map();
for (const row of rows) { if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, []); byLead.get(row.lead_id).push(row); }

let total = 0;
for (const [leadId, list] of byLead) {
  const issued = list.filter((row) => ['ACTIVA', 'APROBADA'].includes(row.status));
  const drafts = list.filter((row) => row.status === 'BORRADOR');
  if (!issued.length || !drafts.length) continue;
  // La referencia es la última emitida o aprobada: la que de verdad quedó.
  const reference = issued.sort((a, b) => new Date(b.issued_at || b.created_at) - new Date(a.issued_at || a.created_at))[0];
  const name = reference.client_company || reference.client_name;
  console.log(`${name}: ${drafts.map((row) => code(row.consecutive)).join(', ')} → reemplazados por ${code(reference.consecutive)} (${reference.status})`);
  total += drafts.length;
  if (confirm) await supersedeSiblingDrafts(prisma, { id: reference.id, consecutive: reference.consecutive, lead_id: leadId }, {});
}
console.log(confirm ? `Listo: ${total} borradores reemplazados.` : `Simulación: ${total} borradores quedarían reemplazados. Para escribir: --confirmar REEMPLAZAR`);
await prisma.$disconnect();
