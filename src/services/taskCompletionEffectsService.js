import { nextTaskOrder } from './taskOrderService.js';
import { ACTIVE_PUBLICATION_STATUSES } from '../lib/socialPublishing.js';
import { contentItemStatusFromTask } from '../lib/contentTaskMirror.js';

// Solo recibe un cambio del estado conjunto, nunca el cierre parcial de una persona.
export async function applyTaskAggregateEffects(tx, task, status, actorId) {
  if (!task.contentItemId || task.status === status) return;
  const publication = (task.title || '').startsWith('[Publicar]');
  if (status === 'REALIZADA' && !publication) {
    const item = await tx.contentItem.findUnique({ where: { id: task.contentItemId }, include: { plan: true } });
    if (item?.plan?.ownerId) {
      const title = `[Publicar] ${item.format}: ${item.objective}`;
      const existing = await tx.task.findFirst({ where: { contentItemId: item.id, title }, select: { id: true } });
      if (!existing) await tx.task.create({ data: {
        title, dueDate: item.publishDate, assigneeId: item.plan.ownerId,
        creatorId: actorId || task.creatorId, status: 'PENDIENTE', sortOrder: await nextTaskOrder(tx, 'PENDIENTE'),
        clientId: item.plan.clientId, contentItemId: item.id,
        comments: `Pieza lista para publicar. Referencia: ${Array.isArray(item.mediaUrl) ? item.mediaUrl.join(', ') : (item.mediaUrl || 'N/A')}`,
      } });
    }
  }
  const piece = publication ? await tx.contentItem.findUnique({ where: { id: task.contentItemId }, select: { status: true } }) : null;
  const next = contentItemStatusFromTask({ newStatus: status, isPublication: publication, itemStatus: piece?.status });
  if (!next) return;
  const armed = await tx.socialPublication.count({ where: { contentItemId: task.contentItemId, status: { in: [...ACTIVE_PUBLICATION_STATUSES] } } });
  if (!armed) await tx.contentItem.update({ where: { id: task.contentItemId }, data: { status: next } });
}
