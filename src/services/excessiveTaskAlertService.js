import prisma from '../lib/prisma.js';
import { getTaskElapsedMs } from '../lib/taskTiming.js';
import { EXCESSIVE_TASK_THRESHOLD_HOURS, EXCESSIVE_TASK_THRESHOLD_MS } from '../lib/taskWorkAlerts.js';

// El umbral vive en src/lib/taskWorkAlerts.js (10 h desde el 9 de octubre de 2026; antes 15 h).
export { EXCESSIVE_TASK_THRESHOLD_HOURS, EXCESSIVE_TASK_THRESHOLD_MS };
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

const sessionElapsedMs = (session, now) => (session.endedAt
  ? Number(session.durationMs || 0)
  : Math.max(0, now.getTime() - new Date(session.startedAt).getTime()));

/**
 * Colaboradores (Rodny, 5 de octubre de 2026): sus horas cuentan en su carga, así que reciben la
 * alerta de 15 horas con **su** tiempo en la tarea —sus propias sesiones— y solo mientras su reloj
 * corre, igual que el responsable solo la recibe con la tarea en proceso.
 * `rows` son filas de `TaskCollaborator` con la tarea y las sesiones de esa persona.
 */
export function buildCollaboratorTaskAlerts(rows, {
  now = new Date(),
  thresholdMs = EXCESSIVE_TASK_THRESHOLD_MS,
  confirmedTaskIds = new Set(),
} = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.task)
    .filter((task) => task && !confirmedTaskIds.has(task.id)
      && (task.workSessions || []).some((session) => !session.endedAt))
    .map((task) => ({
      id: task.id,
      title: task.title,
      clientName: task.client?.name || 'Sin cliente',
      startedAt: (task.workSessions || []).find((session) => !session.endedAt)?.startedAt || null,
      elapsedMs: (task.workSessions || []).reduce((total, session) => total + sessionElapsedMs(session, now), 0),
      isCollaboration: true,
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

  const [tasks, collaborations] = await Promise.all([
    prisma.task.findMany({
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
    }),
    prisma.taskCollaborator.findMany({
      where: { memberId: member.id, task: { status: { in: ['PENDIENTE', 'EN_CURSO'] } } },
      select: {
        task: {
          select: {
            id: true,
            title: true,
            client: { select: { name: true } },
            workSessions: {
              where: { workerId: member.id, isCollaborator: true },
              select: { durationMs: true, startedAt: true, endedAt: true },
            },
          },
        },
      },
    }),
  ]);

  const taskIds = [...tasks.map((task) => task.id), ...collaborations.map((row) => row.task.id)];
  const recentConfirmations = taskIds.length === 0 ? [] : await prisma.operationalTraceEvent.findMany({
    where: {
      eventType: 'TASK_EXCESSIVE_WORK_CONFIRMED',
      subjectUserId: userId,
      taskId: { in: taskIds },
      occurredAt: { gte: new Date(now.getTime() - WORK_CONFIRMATION_WINDOW_MS) },
    },
    select: { taskId: true },
  });
  const confirmedTaskIds = new Set(recentConfirmations.map((event) => event.taskId));

  return [
    ...buildExcessiveTaskAlerts(tasks, { assigneeId: member.id, now, confirmedTaskIds }),
    ...buildCollaboratorTaskAlerts(collaborations, { now, confirmedTaskIds }),
  ].sort((a, b) => b.elapsedMs - a.elapsedMs);
}

/** El tiempo propio de un colaborador en una tarea y si su reloj corre ahora. */
export async function collaboratorWorkOnTask(db, { taskId, memberId, at = new Date() }) {
  const sessions = await db.taskWorkSession.findMany({
    where: { taskId, workerId: memberId, isCollaborator: true },
    select: { durationMs: true, startedAt: true, endedAt: true },
  });
  return {
    elapsedMs: sessions.reduce((total, session) => total + sessionElapsedMs(session, at), 0),
    working: sessions.some((session) => !session.endedAt),
  };
}

export async function confirmExcessiveTaskWork(userId, taskId, at = new Date(), db = prisma) {
  // El responsable con la tarea en proceso, o un colaborador de la tarea mientras sigue abierta.
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { status: 'EN_CURSO', assignee: { userId } },
        { status: { in: ['PENDIENTE', 'EN_CURSO'] }, collaborators: { some: { member: { userId } } } },
      ],
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
      metadata: { source: 'EXCESSIVE_TIME_POPUP', taskTitle: task.title, thresholdHours: EXCESSIVE_TASK_THRESHOLD_HOURS },
    },
  });

  return { taskId, confirmedAt: at };
}
