import prisma from '../lib/prisma.js';
import { hasModulePermission } from '../config/security.js';
import { canValidateClientCriterion, validateCriterionProposal, criterionDecision, criterionError } from '../lib/briaClientCriteria.js';
import { buildContentPlanReviewPendingData } from './briaContentPlanReviewState.js';

const planInclude = { owner: { select: { userId: true } }, client: { select: { name: true, isArchived: true } } };
const context = async (db, planId, actorUserId) => {
  const actor = actorUserId ? await db.user.findUnique({ where: { id: actorUserId }, select: { id: true, name: true, role: true, isActive: true, modulePermissions: true } }) : null;
  if (!actor?.isActive || !hasModulePermission(actor, 'parrillas')) throw criterionError(403, 'No tienes acceso a los criterios de parrillas.');
  const plan = await db.contentPlan.findFirst({ where: { id: planId, deletedAt: null }, include: planInclude });
  if (!plan || plan.client.isArchived) throw criterionError(404, 'La parrilla no está disponible.');
  return { actor, plan };
};
const historyEvent = ({ actor, planId, action, reason, version, now }) => ({
  action, reason, version, planId, actorUserId: actor.id, actorName: actor.name, actorRole: actor.role, at: now.toISOString()
});
const present = (criterion, actor) => {
  const { sourcePlan, ...result } = criterion;
  return { ...result, canValidate: canValidateClientCriterion(actor, sourcePlan), canDelete: actor.role === 'ADMIN' };
};
const sourceInclude = { sourcePlan: { select: { deletedAt: true, owner: { select: { userId: true } } } } };
const lockClient = (tx, clientId) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clientId}, 0))::text`;
const invalidateClientReviews = async (tx, clientId, now = new Date()) => {
  const pending = buildContentPlanReviewPendingData(now);
  await tx.contentPlan.updateMany({ where: { clientId, deletedAt: null }, data: { ...pending, briaReviewState: 'STALE' } });
  await tx.contentPlan.updateMany({ where: { clientId, deletedAt: null, OR: [
    { status: { in: ['PLANIFICACION', 'EN_APROBACION', 'ACTIVO'] } },
    { briaReviewFindings: { some: { status: 'VERIFYING' } } }
  ] }, data: pending });
};

export const createClientCriterionService = (db = prisma) => ({
  async list({ planId, actorUserId }) {
    const { plan, actor } = await context(db, planId, actorUserId);
    const criteria = await db.clientEditorialCriterion.findMany({ where: { clientId: plan.clientId }, include: sourceInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return { clientId: plan.clientId, clientName: plan.client.name, canPropose: true, criteria: criteria.map(item => present(item, actor)) };
  },
  async approved(clientId) {
    return db.clientEditorialCriterion.findMany({ where: { clientId, status: 'APPROVED' }, orderBy: { id: 'asc' },
      select: { id: true, version: true, category: true, text: true, sourcePlanId: true } });
  },
  async propose({ planId, actorUserId, requestId, findingId = null, ...input }) {
    const data = validateCriterionProposal(input);
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestId)) throw criterionError(400, 'La solicitud necesita un identificador válido.');
    return db.$transaction(async tx => {
      const { plan, actor } = await context(tx, planId, actorUserId);
      await lockClient(tx, plan.clientId);
      const previous = await tx.clientEditorialCriterion.findUnique({ where: { requestId }, include: sourceInclude });
      if (previous) {
        const first = previous.history[0];
        if (previous.clientId !== plan.clientId || previous.sourcePlanId !== plan.id || first.actorUserId !== actor.id || previous.text !== data.text || previous.category !== data.category || first.reason !== data.reason) {
          throw criterionError(409, 'El identificador ya corresponde a otra propuesta.');
        }
        return present(previous, actor);
      }
      if (findingId && !await tx.contentPlanReviewFinding.findFirst({ where: { id: findingId, planId: plan.id } })) throw criterionError(404, 'El hallazgo no pertenece a esta parrilla.');
      if (await tx.clientEditorialCriterion.count({ where: { clientId: plan.clientId, status: { in: ['PROPOSED', 'APPROVED'] } } }) >= 100) {
        throw criterionError(422, 'Revisa las propuestas existentes antes de añadir más criterios a este cliente.');
      }
      const criterion = await tx.clientEditorialCriterion.create({ data: {
        clientId: plan.clientId, sourcePlanId: plan.id, sourceFindingId: findingId, requestId,
        text: data.text, category: data.category,
        history: [historyEvent({ actor, planId: plan.id, action: 'PROPOSE', reason: data.reason, version: 1, now: new Date() })]
      }, include: sourceInclude });
      return present(criterion, actor);
    });
  },
  async decide({ planId, actorUserId, criterionId, action, reason, version }) {
    return db.$transaction(async tx => {
      const initial = await context(tx, planId, actorUserId);
      await lockClient(tx, initial.plan.clientId);
      // Same order as publication: lock plans before modifying criteria or invalidating leases.
      await tx.$queryRaw`SELECT "id" FROM "ContentPlan" WHERE "clientId" = ${initial.plan.clientId} ORDER BY "id" FOR UPDATE`;
      const { plan, actor } = await context(tx, planId, actorUserId);
      if (plan.clientId !== initial.plan.clientId) throw criterionError(409, 'La parrilla cambió de cliente. Actualiza la lista.');
      const criterion = await tx.clientEditorialCriterion.findFirst({ where: { id: criterionId, clientId: plan.clientId }, include: sourceInclude });
      if (!criterion) throw criterionError(404, 'El criterio no pertenece a este cliente.');
      if (!canValidateClientCriterion(actor, criterion.sourcePlan)) throw criterionError(403, 'Solo el responsable de la parrilla de origen, un PM o un admin pueden validar este criterio.');
      const next = criterionDecision(criterion, { action, reason, version });
      const now = new Date();
      const updated = await tx.clientEditorialCriterion.update({ where: { id: criterion.id }, data: {
        status: next.status, version: next.version,
        history: [...criterion.history, historyEvent({ actor, planId: plan.id, action, reason: next.reason, version: next.version, now })]
      }, include: sourceInclude });
      if (['APPROVE', 'REVOKE'].includes(action)) await invalidateClientReviews(tx, plan.clientId, now);
      return present(updated, actor);
    });
  },
  async remove({ planId, actorUserId, criterionId, version, confirmation }) {
    return db.$transaction(async tx => {
      const initial = await context(tx, planId, actorUserId);
      if (initial.actor.role !== 'ADMIN') throw criterionError(403, 'Solo un admin puede eliminar definitivamente un criterio.');
      if (confirmation !== 'ELIMINAR' || typeof criterionId !== 'string' || !criterionId.trim()) {
        throw criterionError(400, 'Confirma explícitamente el criterio que deseas eliminar.');
      }
      await lockClient(tx, initial.plan.clientId);
      // Same lock order as approval/revocation and review publication.
      await tx.$queryRaw`SELECT "id" FROM "ContentPlan" WHERE "clientId" = ${initial.plan.clientId} ORDER BY "id" FOR UPDATE`;
      const { plan, actor } = await context(tx, planId, actorUserId);
      if (actor.role !== 'ADMIN') throw criterionError(403, 'Solo un admin puede eliminar definitivamente un criterio.');
      if (plan.clientId !== initial.plan.clientId) throw criterionError(409, 'La parrilla cambió de cliente. Actualiza la lista.');
      const criterion = await tx.clientEditorialCriterion.findFirst({ where: { id: criterionId, clientId: plan.clientId } });
      if (!criterion) throw criterionError(404, 'El criterio no pertenece a este cliente o ya fue eliminado.');
      if (!Number.isInteger(version) || version !== criterion.version) throw criterionError(409, 'Este criterio cambió. Actualiza la lista antes de eliminarlo.');
      await tx.clientEditorialCriterion.delete({ where: { id: criterion.id } });
      if (criterion.status === 'APPROVED') await invalidateClientReviews(tx, plan.clientId);
      return { deleted: true, id: criterion.id };
    });
  }
});
