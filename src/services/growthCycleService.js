export const persistGrowthCyclePlan = async (prismaClient, plan, { actorId = null } = {}) => {
  const existing = await prismaClient.growthCycle.findUnique({ where: { sourceHash: plan.sourceHash } });
  if (existing) return { cycle: existing, created: false };

  const cycle = await prismaClient.$transaction(async (tx) => {
    const created = await tx.growthCycle.create({
      data: {
        name: plan.cycle.name,
        description: 'Ciclo operativo importado desde la ruta oficial de crecimiento.',
        startDate: new Date(plan.cycle.startDate),
        endDate: new Date(plan.cycle.endDate),
        status: 'ACTIVE',
        sourceHash: plan.sourceHash,
        sourceFile: plan.filename,
        createdById: actorId
      }
    });

    const weekIds = new Map();
    for (const week of plan.weeks) {
      const startsAt = new Date(new Date(plan.cycle.startDate).getTime() + (week.number - 1) * 7 * 86400000);
      const endsAt = new Date(startsAt.getTime() + 7 * 86400000 - 1);
      const saved = await tx.growthWeek.create({
        data: { cycleId: created.id, number: week.number, title: week.title, startsAt, endsAt }
      });
      weekIds.set(week.number, saved.id);
    }

    if (plan.actions.length) {
      await tx.growthAction.createMany({ data: plan.actions.map((action) => ({
        cycleId: created.id,
        weekId: weekIds.get(action.weekNumber),
        title: action.title,
        front: action.front,
        ownerName: action.ownerName,
        sourceRow: action.sourceRow,
        evidenceRequired: action.evidenceRequired,
        isCritical: action.isCritical,
        dueDate: action.dueDate ? new Date(action.dueDate) : null,
        description: action.evidenceLabel ? `Evidencia esperada: ${action.evidenceLabel}` : null
      })) });
    }

    if (plan.metrics.length) {
      await tx.growthMetricSnapshot.createMany({ data: plan.metrics.map((metric) => ({
        cycleId: created.id,
        name: metric.name,
        value: metric.value || 0,
        target: metric.target,
        unit: metric.unit,
        source: metric.unit === 'COP' ? 'IMPORT_PROVISIONAL' : 'IMPORT',
        justification: metric.unit === 'COP' ? 'Pendiente de conciliación contable.' : null,
        createdById: actorId
      })) });
    }
    return created;
  });

  return { cycle, created: true };
};
