export const buildProjectManagerContinuityPlan = (legacy = {}) => ({
  gabriel: {
    displayName: 'Gabriel', normalizedName: 'gabriel', baseSalary: Number(legacy.baseSalary),
    socialSecurity: Number(legacy.socialSecurity || 0), positionId: legacy.positionId,
    importBatchId: legacy.importBatchId || null, startDate: new Date('2026-01-01T12:00:00Z'), endDate: new Date('2026-06-16T12:00:00Z')
  },
  kamila: {
    displayName: 'Kamila del Toro', normalizedName: 'kamila-del-toro', baseSalary: Number(legacy.baseSalary),
    socialSecurity: Number(legacy.socialSecurity || 0), positionId: legacy.positionId,
    importBatchId: legacy.importBatchId || null, startDate: new Date('2026-05-17T12:00:00Z'), endDate: null
  }
});

export const applyProjectManagerContinuityPlan = async (prismaClient, actor = {}) => prismaClient.$transaction(async (tx) => {
  const legacy = await tx.financialCollaborator.findFirst({
    where: { OR: [{ normalizedName: 'camila-del-toro' }, { normalizedName: 'kamila-del-toro' }] },
    include: { contracts: { orderBy: { startDate: 'asc' } } }
  });
  const legacyContract = legacy?.contracts?.[0];
  if (!legacy || !legacyContract) throw new Error('No se encontró el contrato base de Kamila.');
  const position = await tx.payrollPosition.findFirst({ where: { title: 'Project Manager' } });
  if (!position) throw new Error('No se encontró el cargo Project Manager.');
  const plan = buildProjectManagerContinuityPlan({
    baseSalary: legacyContract.baseSalary,
    socialSecurity: legacyContract.socialSecurity,
    importBatchId: legacyContract.importBatchId,
    positionId: position.id
  });
  await tx.financialCollaborator.update({ where: { id: legacy.id }, data: {
    displayName: plan.kamila.displayName, normalizedName: plan.kamila.normalizedName, isActive: true
  } });
  await tx.payrollContract.update({ where: { id: legacyContract.id }, data: {
    positionId: position.id, startDate: plan.kamila.startDate, endDate: null
  } });
  const gabriel = await tx.financialCollaborator.upsert({
    where: { normalizedName: plan.gabriel.normalizedName },
    update: { displayName: plan.gabriel.displayName, isActive: false },
    create: { displayName: plan.gabriel.displayName, normalizedName: plan.gabriel.normalizedName, isActive: false }
  });
  const gabrielContract = await tx.payrollContract.findFirst({ where: { collaboratorId: gabriel.id } });
  const contractData = {
    collaboratorId: gabriel.id, positionId: position.id, importBatchId: plan.gabriel.importBatchId,
    baseSalary: plan.gabriel.baseSalary, socialSecurity: plan.gabriel.socialSecurity,
    startDate: plan.gabriel.startDate, endDate: plan.gabriel.endDate,
    sourceLabel: 'Gabriel', metadata: { continuityCorrection: true }
  };
  if (gabrielContract) await tx.payrollContract.update({ where: { id: gabrielContract.id }, data: contractData });
  else await tx.payrollContract.create({ data: contractData });
  await tx.financialAuditEvent.create({ data: {
    entityType: 'PayrollContinuity', entityId: legacyContract.id, action: 'UPDATE',
    actorId: actor.id || actor.userId || null,
    before: { collaborator: legacy.displayName, startDate: legacyContract.startDate },
    after: { gabriel: { startDate: plan.gabriel.startDate, endDate: plan.gabriel.endDate }, kamila: { startDate: plan.kamila.startDate } }
  } });
  return { gabrielId: gabriel.id, kamilaId: legacy.id };
});
