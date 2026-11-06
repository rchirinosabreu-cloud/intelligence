import { assertNotSuspended } from './clientSuspensionGate.js';
import { nativePlanProblem } from '../lib/externalPlan.js';
import { markContentPlanReviewPending } from './briaContentPlanReviewState.js';
import { itemStatusForQueue, isPublishInstantTooSoon, publishAtIso } from '../lib/socialPublishing.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status, statusCode: status });

// Publication dates are calendar days stored in UTC, not instants converted to Bogotá.
export function publicationDate(value) {
  const parsed = value instanceof Date ? new Date(value) : new Date(typeof value === 'string' ? value : NaN);
  const calendar = typeof value === 'string' ? value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1] : null;
  if (!Number.isFinite(parsed.getTime()) || (calendar && parsed.toISOString().slice(0, 10) !== calendar)
    || parsed.getUTCFullYear() < 1900 || parsed.getUTCFullYear() > 9999) throw fail('La fecha de publicación no es válida.', 400);
  return parsed;
}

// Called inside the native serializable transaction. Locks the queue before changing the date;
// a publication already claimed by the worker cannot be moved underneath its external request.
export async function lockPublicationSchedule(tx, itemId) {
  await tx.$queryRaw`SELECT "id" FROM "SocialPublication" WHERE "contentItemId" = ${itemId} ORDER BY "id" FOR UPDATE`;
  if (await tx.socialPublication.count({ where: { contentItemId: itemId, status: 'PUBLISHING' } })) {
    throw fail('La pieza se está publicando ahora mismo. Espera a que termine antes de cambiar su fecha.');
  }
}

export async function syncPublicationSchedule(tx, itemId, now = new Date()) {
  const item = await tx.contentItem.findUnique({ where: { id: itemId }, include: { publications: true } });
  const scheduled = item.publications.filter(row => row.status === 'SCHEDULED');
  if (!scheduled.length) return;
  const instant = publishAtIso(item.publishDate, item.publishTime);
  const reason = !instant ? 'La pieza se quedó sin fecha u hora de publicación.'
    : isPublishInstantTooSoon(instant, now) ? 'La nueva hora de publicación ya pasó; vuelve a programar la pieza con una hora por delante.' : null;
  await tx.socialPublication.updateMany({ where: { contentItemId: itemId, status: 'SCHEDULED' }, data: reason
    ? { status: 'CANCELLED', cancelledAt: now, error: reason, nextAttemptAt: null, leaseToken: null, leaseAt: null }
    : { scheduledAt: new Date(instant), nextAttemptAt: null } });
  const publications = item.publications.map(row => row.status === 'SCHEDULED' && reason ? { ...row, status: 'CANCELLED' } : row);
  const status = itemStatusForQueue({ status: item.status, publications });
  if (status && status !== item.status) await tx.contentItem.update({ where: { id: itemId }, data: { status } });
}

/** Identity and every child stay on the same ContentItem. Drive derives its folder from this relation. */
export async function transferContentPeriod(tx, { itemId, date, actorId = null }) {
  const item = await tx.contentItem.findUnique({ where: { id: itemId }, include: { plan: { include: { client: true } } } });
  if (!item || item.deletedAt || item.plan.deletedAt) throw fail('La pieza o su parrilla ya no está disponible.', 404);
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, source = item.plan;
  if (year === source.year && month === source.month) return null;
  const problem = nativePlanProblem(source.client);
  if (problem) throw fail(problem);
  for (const period of [source, { year, month }]) await assertNotSuspended(tx, {
    clientId: source.clientId, year: period.year, month: period.month, clientName: source.client.name
  });
  const candidates = await tx.contentPlan.findMany({ where: { clientId: source.clientId, year, month, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (candidates.length > 1) throw fail('Hay más de una parrilla activa para ese mes. Unifica el período antes de trasladar la pieza.');
  let target = candidates[0], created = false;
  if (!target) {
    // Only revive an empty container retired by this workflow, never user-deleted content.
    target = await tx.contentPlan.findFirst({ where: { clientId: source.clientId, year, month,
      deletedAt: { not: null }, autoCreatedForTransfer: true, contentItems: { none: { deletedAt: null } } }, orderBy: { createdAt: 'desc' } });
    if (target) target = await tx.contentPlan.update({ where: { id: target.id }, data: { deletedAt: null, status: 'PLANIFICACION' } });
    else {
      target = await tx.contentPlan.create({ data: { clientId: source.clientId, year, month, ownerId: source.ownerId, autoCreatedForTransfer: true } });
      created = true;
    }
  }
  await tx.contentItem.update({ where: { id: itemId }, data: { planId: target.id,
    ...(item.manualPublish?.previousStatus ? { manualPublish: { ...item.manualPublish, previousPlanId: item.manualPublish.previousPlanId || source.id } } : {}) } });
  await tx.contentItemPeriodChange.create({ data: { itemId, actorId, fromPlanId: source.id, toPlanId: target.id,
    previousDate: item.publishDate, nextDate: date, fromYear: source.year, fromMonth: source.month, toYear: year, toMonth: month } });
  // Soft retirement preserves review history and historical links. Existing/manual plans are never retired.
  const remaining = await tx.contentItem.count({ where: { planId: source.id, deletedAt: null } });
  const sourceRemoved = source.autoCreatedForTransfer && remaining === 0 && !source.shareToken && !source.internalNotes && !source.strategicObjectives;
  if (sourceRemoved) await tx.contentPlan.update({ where: { id: source.id }, data: { deletedAt: new Date() } });
  if (target.status === 'FINALIZADO' && item.status !== 'PUBLICADO') {
    await tx.contentPlan.update({ where: { id: target.id }, data: { status: 'ACTIVO' } });
  }
  const targetItems = await tx.contentItem.findMany({ where: { planId: target.id, deletedAt: null }, select: { status: true } });
  if (targetItems.length && targetItems.every(row => row.status === 'PUBLICADO') && target.status !== 'FINALIZADO') {
    await tx.contentPlan.update({ where: { id: target.id }, data: { status: 'FINALIZADO' } });
  }
  const sourceItems = await tx.contentItem.findMany({ where: { planId: source.id, deletedAt: null }, select: { status: true } });
  if (sourceItems.length && sourceItems.every(row => row.status === 'PUBLICADO') && source.status !== 'FINALIZADO') {
    await tx.contentPlan.update({ where: { id: source.id }, data: { status: 'FINALIZADO' } });
  }
  await markContentPlanReviewPending(source.id, { db: tx });
  await markContentPlanReviewPending(target.id, { db: tx });
  return { fromPlan: { id: source.id, year: source.year, month: source.month },
    toPlan: { id: target.id, year, month }, destinationCreated: created, sourceRemoved };
}
