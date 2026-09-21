import prisma from '../lib/prisma.js';
import {
  FOCUS_ACTIVE_STATUSES, FOCUS_EXTENSION_EVENT_TYPE, FOCUS_OVERDUE_EVENT_TYPE, bogotaTimeOf, extendedFocusDeadline, focusExtensionRequestMessage,
  focusLockMessage, focusOverdueMessages, formatFocusExtensionEventContent, formatFocusOverdueEventContent, isManagerUser, parseFocusExtensionRequest
} from '../lib/taskFocus.js';
import { createNotification } from './notificationService.js';

/** La tarea con hora comprometida, activa, asignada a la persona (por su usuario). */
export const findActiveFocusTaskForUser = async (db, userId) => {
  if (!userId) return null;
  return db.task.findFirst({
    where: {
      focusDeadlineAt: { not: null },
      status: { in: [...FOCUS_ACTIVE_STATUSES] },
      assignee: { userId }
    },
    orderBy: { focusDeadlineAt: 'asc' },
    select: { id: true, title: true, focusDeadlineAt: true, status: true, focusSetById: true, creatorId: true }
  });
};

/**
 * Regla del servidor: mientras una persona (no manager) tenga una tarea con hora sin realizar, no puede
 * cambiar sus demás pendientes. Lanza un error 423 con la tarea que la enfoca.
 */
export const assertTaskNotLocked = async (db, { user, taskId }) => {
  const userId = user?.userId || user?.id || null;
  if (!userId || isManagerUser(user)) return null;
  const focusTask = await findActiveFocusTaskForUser(db, userId);
  if (!focusTask || focusTask.id === taskId) return null;
  const target = await db.task.findUnique({ where: { id: taskId }, select: { status: true, assignee: { select: { userId: true } } } });
  if (!target || target.assignee?.userId !== userId) return null;
  // What was already in progress can still be finished (Rodny, 21 September 2026); everything else waits.
  if (String(target.status || '').toUpperCase() === 'EN_CURSO') return null;
  const inProgressTask = await db.task.findFirst({
    where: { status: 'EN_CURSO', assignee: { userId }, id: { not: focusTask.id } },
    select: { id: true, title: true }
  });
  const error = new Error(focusLockMessage(focusTask, inProgressTask));
  error.statusCode = 423;
  error.focusTask = focusTask;
  error.inProgressTask = inProgressTask;
  throw error;
};

/** Quien puso la hora; si no consta (compromisos antiguos), quien creó la tarea. */
const focusManagerIdOf = (task) => task?.focusSetById || task?.creatorId || null;

/**
 * Vencimientos (Rodny, 21 de septiembre de 2026): pasada la hora sin realizar la tarea, un aviso a quien puso
 * el compromiso (decide: más tiempo, quitar la hora o reasignar) y otro a la persona. Una sola vez por hora
 * fijada: `focusOverdueNotifiedAt` se limpia cuando el manager cambia la hora.
 */
export const notifyFocusOverdue = async ({ db = prisma, now = new Date(), notify = createNotification } = {}) => {
  const overdue = await db.task.findMany({
    where: {
      focusDeadlineAt: { not: null, lt: now },
      focusOverdueNotifiedAt: null,
      status: { in: [...FOCUS_ACTIVE_STATUSES] }
    },
    select: {
      id: true, title: true, focusDeadlineAt: true, focusSetById: true, creatorId: true,
      assignee: { select: { userId: true, name: true } }
    },
    take: 100
  });
  let notified = 0;
  for (const task of overdue) {
    const messages = focusOverdueMessages(task, task.assignee?.name || 'La persona');
    const managerId = focusManagerIdOf(task);
    const personId = task.assignee?.userId || null;
    try {
      // The overdue itself is a novedad in the task conversation, like a return or a reopen.
      await db.taskComment.create({
        data: { taskId: task.id, authorId: null, type: FOCUS_OVERDUE_EVENT_TYPE, content: formatFocusOverdueEventContent(task) }
      });
      if (managerId) {
        await notify({ userId: managerId, message: messages.manager, type: 'TASK_FOCUS_OVERDUE', relatedId: task.id, taskId: task.id });
      }
      if (personId && personId !== managerId) {
        await notify({ userId: personId, message: messages.person, type: 'TASK_FOCUS_OVERDUE', relatedId: task.id, taskId: task.id });
      }
      await db.task.update({ where: { id: task.id }, data: { focusOverdueNotifiedAt: now } });
      notified += 1;
    } catch (error) {
      console.error('[TaskFocus] Overdue notice failed:', task.id, error?.message || error);
    }
  }
  return notified;
};

const FOCUS_OVERDUE_CHECK_MS = 60 * 1000;

export const initFocusOverdueCron = () => {
  const run = () => notifyFocusOverdue().catch((error) => {
    console.error('[TaskFocus] Overdue check failed:', error?.message || error);
  });
  const startup = setTimeout(run, 5000);
  startup.unref?.();
  const interval = setInterval(run, FOCUS_OVERDUE_CHECK_MS);
  interval.unref?.();
  console.log('[TaskFocus] Overdue commitment check initialized (every minute).');
  return interval;
};

/**
 * La persona pide más tiempo para su compromiso: elige cuánto y por qué. Queda en la conversación de la tarea
 * (comentario del sistema) y le llega como notificación a quien puso la hora, que la ajusta con el reloj.
 */
export const requestFocusExtension = async (db, { user, taskId, minutes, reason, notify = createNotification }) => {
  const userId = user?.userId || user?.id || null;
  const request = parseFocusExtensionRequest({ minutes, reason });
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, title: true, status: true, focusDeadlineAt: true, focusSetById: true, creatorId: true,
      assignee: { select: { userId: true, name: true } }
    }
  });
  if (!task || !task.focusDeadlineAt || !FOCUS_ACTIVE_STATUSES.includes(String(task.status || '').toUpperCase())) {
    const error = new Error('Esta tarea no tiene un compromiso con hora activo.');
    error.statusCode = 404;
    throw error;
  }
  if (!userId || task.assignee?.userId !== userId) {
    const error = new Error('Solo la persona responsable puede pedir más tiempo para su compromiso.');
    error.statusCode = 403;
    throw error;
  }
  const managerId = focusManagerIdOf(task);
  // The time is granted on the spot: nobody approves it (Rodny, 21 September 2026). Counted from now when the
  // commitment already expired, so the new hour is never in the past.
  const newDeadline = extendedFocusDeadline(task.focusDeadlineAt, request.minutes);
  const newTime = bogotaTimeOf(newDeadline);
  await db.taskComment.create({
    data: {
      taskId: task.id,
      authorId: userId,
      type: FOCUS_EXTENSION_EVENT_TYPE,
      content: formatFocusExtensionEventContent({ ...request, newTime })
    }
  });
  // A new hour: the overdue notice re-arms, so if this one passes too everybody is told again.
  await db.task.update({ where: { id: task.id }, data: { focusDeadlineAt: newDeadline, focusOverdueNotifiedAt: null } });
  let notifiedUserId = null;
  if (managerId && managerId !== userId) {
    await notify({
      userId: managerId,
      message: focusExtensionRequestMessage({ task, assigneeName: task.assignee?.name || 'La persona', label: request.label, reason: request.reason, newTime }),
      type: 'TASK_FOCUS_EXTENSION',
      relatedId: task.id,
      taskId: task.id,
      actorId: userId
    });
    notifiedUserId = managerId;
  }
  return { ok: true, minutes: request.minutes, label: request.label, newTime, notifiedUserId };
};
