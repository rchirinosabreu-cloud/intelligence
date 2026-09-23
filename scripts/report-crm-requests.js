import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Read-only: lists the commercial requests received through /solicitud and the opportunity each one created.
// Usage: node scripts/report-crm-requests.js [--days=30]   (DATABASE_URL must be set; nothing is written)

const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const days = Math.max(1, Number(daysArg?.slice(7)) || 30);

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
  } finally {
    await prisma.$disconnect();
  }
}
