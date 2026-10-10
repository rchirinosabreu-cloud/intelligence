// Quién puede cambiar qué de una tarea: la misma puerta para la pantalla de Gestión y para Bria (9 de octubre
// de 2026). Antes vivía dentro del controlador; se sacó aquí para que Bria pase exactamente por las mismas
// reglas, sin copiarlas. El orden importa y es el de siempre:
//   1. reordenar es de managers; fijar o quitar un compromiso con hora, también;
//   2. el compromiso con hora bloquea las demás tareas de la persona (423);
//   3. reabrir una tarea cerrada es de cualquiera, y solo eso (isTaskReopenRequest);
//   4. lo demás es de managers, quien la creó o quien la ejecuta; un colaborador solo la mueve entre
//      Pendiente y En proceso;
//   5. la privacidad solo la cambia quien la creó, y solo si dirige.
// La reserva de un pendiente privado (poder abrirlo) se comprueba antes, con requireTaskAccess o canOpenTask.

import prisma from '../lib/prisma.js';
import { canUpdateTask, isManagerRole } from '../config/security.js';
import { canChangeTaskPrivacy } from '../lib/taskPrivacy.js';
import { collaboratorMoveProblem } from '../lib/taskCollaborators.js';
import { isTaskReopenRequest } from '../lib/taskTiming.js';
import { assertTaskNotLocked } from './taskFocusService.js';

const gateError = (status, message, extra = {}) => Object.assign(new Error(message), { gateStatus: status, ...extra });

export const checkTaskUpdate = async ({ db = prisma, user, taskId, payload = {} }) => {
  if ('sortOrder' in payload && !['ADMIN', 'PROJECT_MANAGER', 'PM'].includes(user?.role)) {
    throw gateError(403, 'No tienes permisos de Project Manager o Administrador para reordenar tareas');
  }
  if ('focusDeadlineAt' in payload && !isManagerRole(user?.role)) {
    throw gateError(403, 'Solo administradores y project managers pueden fijar o quitar un compromiso con hora.');
  }
  try {
    await assertTaskNotLocked(db, { user, taskId });
  } catch (lockError) {
    if (lockError.statusCode === 423) throw gateError(423, lockError.message, { focusTask: lockError.focusTask });
    throw lockError;
  }
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { creatorId: true, status: true, assignee: { select: { userId: true } }, collaborators: { select: { member: { select: { userId: true } } } } }
  });
  if (!task) throw gateError(404, 'Task not found');
  if (!isTaskReopenRequest({ currentStatus: task.status, payload }) && !canUpdateTask(user, task)) {
    const actorUserId = user?.userId || user?.id;
    const isCollaborator = Boolean(actorUserId) && (task.collaborators || []).some((row) => row.member?.userId === actorUserId);
    if (!isCollaborator) throw gateError(403, 'No tienes permisos para actualizar esta tarea');
    const problem = collaboratorMoveProblem({ currentStatus: task.status, payload });
    if (problem) throw gateError(403, problem);
  }
  if (('isPrivate' in payload || 'viewerIds' in payload) && !canChangeTaskPrivacy(task, user)) {
    throw gateError(403, 'Solo quien creó este pendiente puede cambiar con quién se comparte.');
  }
  return task;
};
