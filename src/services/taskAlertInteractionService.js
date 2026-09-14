import { createHash } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { hasModulePermission } from '../config/security.js';
import { getTaskElapsedMs } from '../lib/taskTiming.js';
import { EXCESSIVE_TASK_THRESHOLD_MS } from './excessiveTaskAlertService.js';
import { RETURNED_TASK_THRESHOLD_MS } from './returnedTaskAlertService.js';

const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const eventTypes = { SHOWN: 'TASK_ALERT_SHOWN', REVIEW: 'TASK_ALERT_REVIEWED', DISMISS: 'TASK_ALERT_DISMISSED' };

// Browser-reported visibility is not evidence that somebody read the notice. The server
// validates the recipient and eligibility; subsequent actions refer to that specific notice.
export async function recordTaskAlertInteraction({ userId, taskId, noticeId, kind, action, at = new Date(), db = prisma }) {
  if (!userId) throw failure('Debes iniciar sesión.', 401);
  if (!uuid(taskId) || !uuid(noticeId) || !['EXCESSIVE', 'RETURNED'].includes(kind) || !Object.hasOwn(eventTypes, action)) {
    throw failure('El aviso no es válido.', 400);
  }
  return db.$transaction(async tx => {
    const lockKey = createHash('sha256').update(noticeId).digest().readInt32BE(0);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260914, ${lockKey}::integer)`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw failure('La sesión no está disponible.', 401);
    if (!hasModulePermission(user, 'gestion')) throw failure('No tienes acceso a Gestión.', 403);
    const shown = await tx.operationalTraceEvent.findUnique({ where: { id: noticeId } });
    if (shown && (shown.eventType !== 'TASK_ALERT_SHOWN' || shown.subjectUserId !== userId || shown.taskId !== taskId || shown.metadata?.kind !== kind)) {
      throw failure('El aviso no corresponde a esta tarea o persona.', 403);
    }
    if (shown && action === 'SHOWN') return { success: true, noticeId };
    if (action !== 'SHOWN' && (!shown || at.getTime() - new Date(shown.occurredAt).getTime() > 86400000)) {
      throw failure('No encontramos un aviso reciente para esta acción.', 409);
    }
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { assignee: { select: { userId: true, isActive: true } } } });
    const owned = kind === 'RETURNED' ? task?.creatorId === userId : task?.assignee?.isActive && task?.assignee?.userId === userId;
    if (!task || !owned) throw failure('La tarea no te corresponde.', 403);
    if (action === 'SHOWN') {
      const eligible = kind === 'RETURNED'
        ? task.status === 'DEVUELTA' && task.returnedAt && at.getTime() - new Date(task.returnedAt).getTime() >= RETURNED_TASK_THRESHOLD_MS
        : task.status === 'EN_CURSO' && getTaskElapsedMs(task, at) >= EXCESSIVE_TASK_THRESHOLD_MS;
      if (!eligible) throw failure('La tarea ya no requiere este aviso.', 409);
    }
    const id = action === 'SHOWN' ? noticeId : createHash('sha256').update(`${noticeId}:${action}`).digest('hex');
    const stored = await tx.operationalTraceEvent.upsert({ where: { id }, update: {}, create: {
      id, eventType: eventTypes[action], actorId: action === 'SHOWN' ? null : userId,
      subjectUserId: userId, taskId, occurredAt: at,
      metadata: { kind, noticeId, taskTitle: task.title, source: 'TASK_ALERT' },
    } });
    if (stored.subjectUserId !== userId || stored.taskId !== taskId || stored.metadata?.kind !== kind) {
      throw failure('El aviso no corresponde a esta tarea o persona.', 403);
    }
    return { success: true, noticeId };
  });
}
