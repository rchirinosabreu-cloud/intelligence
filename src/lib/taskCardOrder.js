export const taskOrderKey = card => JSON.stringify([card.id, card.memberId ?? card.participation?.memberId ?? '']);
export const taskOrderDescriptor = card => ({
  id: card.id, memberId: card.participation?.memberId || '', status: card.status,
  revision: card.boardOrder?.revision || 0,
  participantRevision: card.participation?.revision ?? null,
  rosterVersion: card.sharedProgress ? card.rosterVersion || 0 : null,
  taskRevision: card.updatedAt ? new Date(card.updatedAt).toISOString() : null,
});

export function applyTaskCardOrder(tasks, order) {
  const byTask = new Map();
  for (const row of order || []) {
    if (!byTask.has(row.id)) byTask.set(row.id, []);
    byTask.get(row.id).push(row);
  }
  return (tasks || []).map(task => {
    const changed = byTask.get(task.id);
    if (!changed) return task;
    const members = new Set(changed.map(row => row.memberId));
    return { ...task, cardOrders: [...(task.cardOrders || []).filter(row => !members.has(row.memberId)), ...changed] };
  });
}
