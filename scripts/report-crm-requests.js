import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Read-only: lists the commercial requests received through /solicitud and the opportunity each one created.
// Usage: node scripts/report-crm-requests.js [--days=30]   (DATABASE_URL must be set; nothing is written)

// --detalle=CRM-0174 prints what that prospect answered about money and the lines the form suggested.
const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const days = Math.max(1, Number(daysArg?.slice(7)) || 30);
const detailArg = process.argv.find(arg => arg.startsWith('--detalle='));
const detailConsecutive = detailArg ? Number(detailArg.slice(10).replace(/\D/g, '')) : null;

export const requestBudgetDetail = request => {
  const answers = request?.answers || {};
  return {
    presupuesto: answers['budget.has'] === 'SI' ? `${answers['budget.amount']?.amount ?? answers['budget.amount'] ?? '—'} ${answers['budget.currency'] || ''}`.trim() : answers['budget.has'] || '—',
    alcance: answers['budget.scope'] || '—',
    pautaIncluida: answers['budget.adsIncluded'] || '—',
    servicios: Array.isArray(answers.services) ? answers.services.join(', ') : '',
    necesidadesMarketing: Array.isArray(answers['mkt.needs']) ? answers['mkt.needs'].join(', ') : answers['mkt.needs'] || '—',
    lineasSugeridas: (request?.suggestedItems || []).map(item => `${item.name}${item.custom ? ' (personalizada)' : ''}`)
  };
};

export const summarizeRequests = (requests = []) => requests.map(request => ({
  receivedAt: request.receivedAt,
  reference: `CRM-${String(request.lead?.consecutive ?? 0).padStart(4, '0')}`,
  company: request.lead?.company || null,
  contactName: request.lead?.contactName || null,
  email: request.lead?.email || null,
  stage: request.lead?.stage || null,
  owner: request.lead?.owner?.name || 'sin responsable',
  services: Array.isArray(request.services) ? request.services.join(', ') : '',
  campaign: request.meta?.campaign || null,
  archived: Boolean(request.lead?.archivedAt)
}));

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL es obligatoria (solo lectura).'); process.exit(1); }
  const target = new URL(process.env.DATABASE_URL);
  console.log(`Solo lectura en ${target.hostname}${target.pathname} · últimos ${days} días`);
  const { default: prisma } = await import('../src/lib/prisma.js');
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const requests = await prisma.crmRequest.findMany({
      where: { receivedAt: { gte: since } },
      orderBy: { receivedAt: 'desc' },
      include: { lead: { select: { consecutive: true, company: true, contactName: true, email: true, stage: true, archivedAt: true, owner: { select: { name: true } } } } }
    });
    const rows = summarizeRequests(requests);
    if (rows.length === 0) console.log('No hay solicitudes recibidas en ese periodo.');
    else console.table(rows.map(row => ({ ...row, receivedAt: new Date(row.receivedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) })));
    const total = await prisma.crmRequest.count();
    console.log(`Total histórico de solicitudes: ${total}`);
    if (detailConsecutive) {
      const request = await prisma.crmRequest.findFirst({ where: { lead: { consecutive: detailConsecutive } }, include: { lead: { select: { company: true, quotations: { select: { consecutive: true, status: true, total_amount: true, duration_months: true, items: true } } } } } });
      if (!request) console.log(`No hay solicitud de formulario para CRM-${detailConsecutive}.`);
      else {
        console.log(`\nDetalle de CRM-${String(detailConsecutive).padStart(4, '0')} · ${request.lead?.company || ''}`);
        console.log(JSON.stringify(requestBudgetDetail(request), null, 2));
        for (const quotation of request.lead?.quotations || []) {
          console.log(`\nCOT-${String(quotation.consecutive).padStart(4, '0')} · ${quotation.status} · ${quotation.duration_months} mes(es) · total ${Number(quotation.total_amount).toLocaleString('es-CO')}`);
          console.table((Array.isArray(quotation.items) ? quotation.items : []).map(item => ({ linea: item.name, precio: Number(item.price), cobro: item.billingType, cantidad: item.quantity })));
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
