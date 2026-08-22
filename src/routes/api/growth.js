import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { buildGrowthImportPlan } from '../../services/growthImportService.js';
import { persistGrowthCyclePlan } from '../../services/growthCycleService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const serializeCycle = async (cycleId) => prisma.growthCycle.findUnique({
  where: { id: cycleId },
  include: {
    weeks: { orderBy: { number: 'asc' } },
    actions: { include: { evidence: true }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] },
    metrics: { orderBy: { measuredAt: 'desc' } }
  }
});

router.get('/dashboard', async (_req, res) => {
  try {
    const cycle = await prisma.growthCycle.findFirst({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      orderBy: { startDate: 'desc' }
    });
    const discrepancies = await prisma.financialDiscrepancy.findMany({
      where: { status: { not: 'APPLIED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50
    });
    res.json({ cycle: cycle ? await serializeCycle(cycle.id) : null, discrepancies });
  } catch (error) {
    console.error('[Growth] No fue posible cargar el centro:', error.response?.data || error.message);
    res.status(500).json({ error: 'No fue posible cargar el Centro de Crecimiento.' });
  }
});

router.post('/import/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona el archivo del plan de 90 días.' });
    return res.json(buildGrowthImportPlan(req.file.buffer, {
      filename: req.file.originalname,
      name: req.body.name,
      startDate: req.body.startDate,
      endDate: req.body.endDate
    }));
  } catch (error) {
    console.error('[Growth] Error leyendo el plan:', error.response?.data || error.message);
    return res.status(422).json({ error: 'No fue posible interpretar el plan. Revisa sus columnas.' });
  }
});

router.post('/import/commit', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona el archivo del plan de 90 días.' });
    const plan = buildGrowthImportPlan(req.file.buffer, {
      filename: req.file.originalname,
      name: req.body.name,
      startDate: req.body.startDate,
      endDate: req.body.endDate
    });
    const result = await persistGrowthCyclePlan(prisma, plan, { actorId: req.user.userId });
    if (!result.created) return res.status(409).json({ error: 'Este archivo ya fue importado.', cycleId: result.cycle.id });
    return res.status(201).json({ cycle: await serializeCycle(result.cycle.id) });
  } catch (error) {
    console.error('[Growth] Error importando el plan:', error.response?.data || error.message);
    return res.status(500).json({ error: 'No fue posible guardar el plan de crecimiento.' });
  }
});

router.patch('/actions/:id', async (req, res) => {
  try {
    const allowed = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'RETURNED', 'COMPLETED'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Estado de acción inválido.' });
    const action = await prisma.growthAction.update({
      where: { id: req.params.id },
      data: { status: req.body.status, completedAt: req.body.status === 'COMPLETED' ? new Date() : null }
    });
    return res.json({ action });
  } catch (error) {
    console.error('[Growth] Error actualizando acción:', error.response?.data || error.message);
    return res.status(500).json({ error: 'No fue posible actualizar la acción.' });
  }
});

router.patch('/discrepancies/:id', async (req, res) => {
  try {
    const allowed = ['DETECTED', 'IN_REVIEW', 'FINANCE_PROPOSAL', 'APPROVED', 'RETURNED', 'APPLIED'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Estado de conciliación inválido.' });
    const discrepancy = await prisma.financialDiscrepancy.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        proposal: req.body.proposal,
        resolution: req.body.resolution,
        resolvedById: req.body.status === 'APPLIED' ? req.user.userId : null,
        resolvedAt: req.body.status === 'APPLIED' ? new Date() : null
      }
    });
    return res.json({ discrepancy });
  } catch (error) {
    console.error('[Growth] Error conciliando:', error.response?.data || error.message);
    return res.status(500).json({ error: 'No fue posible actualizar la conciliación.' });
  }
});

export default router;
