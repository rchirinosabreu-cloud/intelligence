import 'dotenv/config';
import fs from 'node:fs';
import { buildGrowthImportPlan } from '../src/services/growthImportService.js';

if (process.env.DATABASE_PUBLIC_URL) process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
const { PrismaClient } = await import('@prisma/client');
const { persistGrowthCyclePlan } = await import('../src/services/growthCycleService.js');

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const workbookPath = process.argv.find((argument) => /\.xlsm?$/i.test(argument));
if (!workbookPath) throw new Error('Indica el archivo oficial del plan de crecimiento.');

try {
  const plan = buildGrowthImportPlan(fs.readFileSync(workbookPath), {
    filename: workbookPath.split(/[\\/]/).pop(),
    name: 'Plan de fortalecimiento · 90 días',
    startDate: '2026-08-24T05:00:00.000Z',
    endDate: '2026-11-22T04:59:59.999Z'
  });
  const existing = await prisma.growthCycle.findUnique({ where: { sourceHash: plan.sourceHash } });
  if (!shouldApply || existing) {
    console.log(JSON.stringify({ mode: shouldApply ? 'comprobar' : 'vista previa', existing, summary: { weeks: plan.weeks.length, actions: plan.actions.length, metrics: plan.metrics.length, startDate: plan.cycle.startDate, endDate: plan.cycle.endDate } }, null, 2));
  } else {
    const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const result = await persistGrowthCyclePlan(prisma, plan, { actorId: actor?.id || null });
    console.log(JSON.stringify({ mode: 'aplicar', created: result.created, cycleId: result.cycle.id, summary: { weeks: plan.weeks.length, actions: plan.actions.length, metrics: plan.metrics.length } }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
