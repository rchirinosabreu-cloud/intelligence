import prisma from '../lib/prisma.js';

export const RETURNED_TASK_THRESHOLD_MS = 60 * 60 * 1000;
export const RETURNED_TASK_SNOOZE_MS = 60 * 60 * 1000;
export const RETURNED_TASK_SNOOZE_EVENT = 'TASK_RETURNED_REMINDER_SNOOZED';

export function buildReturnedTaskAlerts(tasks, {
  creatorId,
  now = new Date(),
  thresholdMs = RETURNED_TASK_THRESHOLD_MS,
  snoozedTaskIds = new Set(),
} = {}) {
  if (!creatorId || !Array.isArray(tasks)) return [];

  const nowMs = now.getTime();

  return tasks
    .filter((task) => task?.creatorId === creatorId
      && String(task?.status || '').toUpperCase() === 'DEVUELTA'
      && task.returnedAt
      && !snoozedTaskIds.has(task.id))
    .map((task) => {
      const returnedAtMs = new Date(task.returnedAt).getTime();
      return {
        id: task.id,
        title: task.title,
        clientName: task.client?.name || task.clientName || 'Sin cliente',
        returnedAt: task.returnedAt,
        elapsedMs: Number.isFinite(returnedAtMs) ? Math.max(0, nowMs - returnedAtMs) : 0,
      };
    })
    .filter((task) => task.elapsedMs >= thresholdMs)
    .sort((a, b) => b.elapsedMs - a.elapsedMs);
}

export async function getMyReturnedTaskAlerts(userId, now = new Date(), db = prisma) {
  if (!userId) return [];

  const thresholdDate = new Date(now.getTime() - RETURNED_TASK_THRESHOLD_MS);
  const tasks = await db.task.findMany({
    where: {
      creatorId: userId,
      status: 'DEVUELTA',
      returnedAt: { lte: thresholdDate },
    },
    select: {
      id: true,
      title: true,
      status: true,
      creatorId: true,
      returnedAt: true,
      client: { select: { name: true } },
    },
    orderBy: { returnedAt: 'asc' },
  });

  const recentSnoozes = tasks.length === 0 ? [] : await db.operationalTraceEvent.findMany({
    where: {
      eventType: RETURNED_TASK_SNOOZE_EVENT,
      subjectUserId: userId,
      taskId: { in: tasks.map((task) => task.id) },
      occurredAt: { gte: new Date(now.getTime() - RETURNED_TASK_SNOOZE_MS) },
    },
    select: { taskId: true },
  });

  return buildReturnedTaskAlerts(tasks, {
    creatorId: userId,
    now,
    snoozedTaskIds: new Set(recentSnoozes.map((event) => event.taskId)),
  });
}

export async function snoozeReturnedTaskReminder(userId, taskId, at = new Date(), db = prisma) {
  const task = await db.task.findFirst({
    where: { id: taskId, status: 'DEVUELTA', creatorId: userId },
    select: { id: true, title: true },
  });

  if (!task) {
    const error = new Error('Returned task does not belong to this creator');
    error.code = 'RETURNED_TASK_NOT_OWNED';
    throw error;
  }

  const snoozedUntil = new Date(at.getTime() + RETURNED_TASK_SNOOZE_MS);
  await db.operationalTraceEvent.create({
    data: {
      eventType: RETURNED_TASK_SNOOZE_EVENT,
      actorId: userId,
      subjectUserId: userId,
      taskId,
      occurredAt: at,
      metadata: {
        source: 'RETURNED_TASK_POPUP',
        taskTitle: task.title,
        snoozedUntil: snoozedUntil.toISOString(),
      },
    },
  });

  return { taskId, snoozedUntil };
}
