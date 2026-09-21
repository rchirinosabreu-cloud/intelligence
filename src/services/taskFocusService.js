import { FOCUS_ACTIVE_STATUSES, focusLockMessage, isManagerUser } from '../lib/taskFocus.js';

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
    select: { id: true, title: true, focusDeadlineAt: true, status: true }
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
