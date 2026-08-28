import prisma from '../lib/prisma.js';
import { getTaskElapsedMs } from '../lib/taskTiming.js';

export const EXCESSIVE_TASK_THRESHOLD_MS = 15 * 60 * 60 * 1000;
export const WORK_CONFIRMATION_WINDOW_MS = 4 * 60 * 60 * 1000;

export function buildExcessiveTaskAlerts(tasks, {
  assigneeId,
  now = new Date(),
  thresholdMs = EXCESSIVE_TASK_THRESHOLD_MS,
  confirmedTaskIds = new Set(),
} = {}) {
  if (!assigneeId || !Array.isArray(tasks)) return [];

  return tasks
    .filter((task) => task?.assigneeId === assigneeId
      && String(task?.status || '').toUpperCase() === 'EN_CURSO'
      && !confirmedTaskIds.has(task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      clientName: task.client?.name || task.clientName || 'Sin cliente',
      startedAt: task.startedAt,
      elapsedMs: getTaskElapsedMs(task, now),
    }))
    .filter((task) => task.elapsedMs >= thresholdMs)
    .sort((a, b) => b.elapsedMs - a.elapsedMs);
}

export async function getMyExcessiveTaskAlerts(userId, now = new Date()) {
  if (!userId) return [];

  const member = await prisma.teamMember.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!member) return [];

  const tasks = await prisma.task.findMany({
    where: { assigneeId: member.id, status: 'EN_CURSO' },
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      startedAt: true,
      accumulatedWorkMs: true,
      client: { select: { name: true } },
    },
  });

  const recentConfirmations = tasks.length === 0 ? [] : await prisma.operationalTraceEvent.findMany({
    where: {
      eventType: 'TASK_EXCESSIVE_WORK_CONFIRMED',
      subjectUserId: userId,
      taskId: { in: tasks.map((task) => task.id) },
      occurredAt: { gte: new Date(now.getTime() - WORK_CONFIRMATION_WINDOW_MS) },
    },
    select: { taskId: true },
  });

  return buildExcessiveTaskAlerts(tasks, {
    assigneeId: member.id,
    now,
    confirmedTaskIds: new Set(recentConfirmations.map((event) => event.taskId)),
  });
}

export async function confirmExcessiveTaskWork(userId, taskId, at = new Date(), db = prisma) {
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      status: 'EN_CURSO',
      assignee: { userId },
    },
    select: { id: true, title: true },
  });

  if (!task) {
    const error = new Error('Task is not active or assigned to this user');
    error.code = 'TASK_NOT_ASSIGNED';
    throw error;
  }

  await db.operationalTraceEvent.create({
    data: {
      eventType: 'TASK_EXCESSIVE_WORK_CONFIRMED',
      actorId: userId,
      subjectUserId: userId,
      taskId,
      occurredAt: at,
      metadata: { source: 'EXCESSIVE_TIME_POPUP', taskTitle: task.title },
    },
  });

  return { taskId, confirmedAt: at };
}
