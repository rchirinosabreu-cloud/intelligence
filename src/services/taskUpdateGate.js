// Quién puede cambiar qué de una tarea: la misma puerta para la pantalla de Gestión y para Bria (9 de octubre
// de 2026). Antes vivía dentro del controlador; se sacó aquí para que Bria pase exactamente por las mismas
// reglas, sin copiarlas. El orden importa y es el de siempre:
//   1. reordenar es de managers; fijar o quitar un compromiso con hora, también;
//   2. el compromiso con hora bloquea las demás tareas de la persona (423);
//   3. reabrir una tarea cerrada es de cualquiera, y solo eso (isTaskReopenRequest);
//   4. lo demás es de managers, quien la creó o quien la ejecuta; un colaborador solo la mueve entre
//      Pendiente y En proceso;
//   5. la privacidad solo la cambia quien la creó, y solo si dirige;
//   6. un pendiente «Publicar» cuya pieza está programada en Meta no se cierra a mano: se cierra solo
//      cuando Meta publica (15 de octubre de 2026).
// La reserva de un pendiente privado (poder abrirlo) se comprueba antes, con requireTaskAccess o canOpenTask.

import prisma from '../lib/prisma.js';
import { canUpdateTask, isManagerRole } from '../config/security.js';
import { canChangeTaskPrivacy } from '../lib/taskPrivacy.js';
import { collaboratorMoveProblem } from '../lib/taskCollaborators.js';
import { isTaskReopenRequest } from '../lib/taskTiming.js';
import { isPublicationTask } from '../lib/contentTaskReciprocity.js';
import { publicationTaskCloseProblem } from '../lib/socialPublishing.js';
import { assertTaskNotLocked } from './taskFocusService.js';
import { assertTaskClientChange } from './taskClientChange.js';
import { suspensionBlock } from './clientSuspensionGate.js';

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
    select: {
      creatorId: true, status: true, title: true, clientId: true, contentItemId: true,
      assignee: { select: { userId: true } },
      collaborators: { select: { member: { select: { userId: true } } } },
      contentItem: {
        select: {
          publishDate: true, publishTime: true, publications: { select: { status: true } },
          plan: { select: { clientId: true, year: true, month: true, client: { select: { name: true } } } }
        }
      }
    }
  });
  if (!task) throw gateError(404, 'Task not found');
  // Un cliente suspendido por cartera congela el mes entero, «no importa incluso si llega a estar realizada»: el
  // pendiente que salió de esa parrilla tampoco se mueve. Solo el que nació de una pieza; los demás siguen su curso.
  const suspendedPlan = task.contentItem?.plan;
  if (suspendedPlan) {
    const block = await suspensionBlock(db, {
      clientId: suspendedPlan.clientId, year: suspendedPlan.year, month: suspendedPlan.month,
      clientName: suspendedPlan.client?.name, forTask: true
    });
    if (block) throw gateError(409, block.reason);
  }
  // Mientras la publicación esté armada, el estado de la pieza es de la cola: cerrar este pendiente a
  // mano la dejaba en PUBLICADO y el publicador cancelaba las dos redes al llegar la hora.
  if (String(payload?.status || '') === 'REALIZADA' && task.status !== 'REALIZADA' && isPublicationTask(task.title || '')) {
    const problem = publicationTaskCloseProblem({ item: task.contentItem, publications: task.contentItem?.publications || [] });
    if (problem) throw gateError(409, problem);
  }
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
  await assertTaskClientChange(db, task, payload);
  return task;
};
