import { hasTaskParticipations } from '../lib/taskParticipation.js';
import { closeTaskWorkSession } from '../lib/taskTiming.js';
import { initializeTaskParticipations, materializeLegacyOwnerSession, participationInclude } from './taskParticipationStore.js';
import { closeAllOpenTaskWorkSessions, closeActiveTaskWorkCycle } from './taskWorkSessionService.js';

// Dentro de la misma recognitionTransaction que elimina el origen. Mantiene la
// identidad, estados y logros; retirar no es terminar ni devolver el trabajo.
export async function retireContentTasks(tx, { itemIds, actorId = null, at = new Date() }) {
  const tasks = await tx.task.findMany({ where: { contentItemId: { in: itemIds } }, include: participationInclude });
  for (let task of tasks) {
    if (hasTaskParticipations(task)) task = await initializeTaskParticipations(tx, task);
    else await materializeLegacyOwnerSession(tx, task);
    await closeAllOpenTaskWorkSessions(tx, { taskId: task.id, actorId, at, closeReason: 'CONTENT_REMOVED' });
    await closeActiveTaskWorkCycle(tx, { taskId: task.id, actorId, at, closeReason: 'CONTENT_REMOVED' });
    let accumulatedWorkMs = task.status === 'REALIZADA' ? task.accumulatedWorkMs : closeTaskWorkSession(task, at);
    if (task.sharedProgress && task.assigneeId) {
      const [sessions, archived] = await Promise.all([
        tx.taskWorkSession.aggregate({ where: { taskId: task.id, workerId: task.assigneeId, endedAt: { not: null } }, _sum: { durationMs: true } }),
        tx.taskParticipationArchive.aggregate({ where: { taskId: task.id, memberId: task.assigneeId }, _sum: { baselineWorkMs: true } }),
      ]);
      accumulatedWorkMs = Number(sessions._sum.durationMs || 0) + Number(task.assigneeBaselineWorkMs || 0) + Number(archived._sum.baselineWorkMs || 0);
    }
    if (task.startedAt || accumulatedWorkMs !== task.accumulatedWorkMs) {
      await tx.task.update({ where: { id: task.id }, data: { startedAt: null, accumulatedWorkMs } });
    }
    await tx.operationalTraceEvent.create({ data: { eventType: 'TASK_RETIRED', taskId: task.id, actorId, occurredAt: at,
      metadata: { reason: 'CONTENT_REMOVED', contentItemId: task.contentItemId, planId: task.contentItem.plan.id, status: task.status } } });
  }
}
