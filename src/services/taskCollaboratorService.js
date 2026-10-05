import prisma from '../lib/prisma.js';
import { assertActiveTeamMembers } from './teamRosterService.js';
import { recognitionTransaction } from './recognitionService.js';
import { createNotification } from './notificationService.js';
import { normalizeCollaboratorIds } from '../lib/taskCollaborators.js';
import { getTaskElapsedMs } from '../lib/taskTiming.js';
import { closeActiveTaskWorkSession, ensureTaskWorkCycle, openTaskWorkSession } from './taskWorkSessionService.js';

/**
 * Colaboradores de una tarea (Rodny, 5 de octubre de 2026): opción A. La tarea tiene un solo
 * responsable, que es quien la cierra y cuyo reloj sigue atado al estado. Cada colaborador
 * registra su tiempo por separado con su propio «Empezar / Pausar», que **no** cambia el estado de
 * la tarea: la columna del tablero es del responsable. Cerrar o devolver la tarea para todos los
 * relojes (eso vive en `nativeTaskService.updateTask`). Las horas de cada quien cuentan en su carga.
 */

export const COLLABORATOR_ADDED_NOTIFICATION = 'TASK_COLLABORATOR_ADDED';

/** Lo que una tarea trae de sus colaboradores en la lista y en el panel. */
export const taskCollaboratorsSelect = {
  select: {
    memberId: true,
    member: { select: { id: true, name: true, avatarUrl: true, role: true, userId: true } }
  }
};

/** Los relojes abiertos de la tarea, para saber en el tablero quién está trabajando ahora. */
export const taskOpenSessionsSelect = {
  where: { endedAt: null },
  select: { workerId: true, isCollaborator: true, startedAt: true }
};

const httpError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

/**
 * Deja la lista de colaboradores de una tarea como la pide `collaboratorIds`. Nunca guarda al
 * responsable; sin responsable no admite a nadie. A quien sale se le para el reloj.
 */
export const replaceTaskCollaborators = async (tx, { taskId, assigneeId, collaboratorIds, actorUserId = null, at = new Date() }) => {
  const ids = normalizeCollaboratorIds(collaboratorIds, assigneeId);
  if (ids.length && !assigneeId) {
    throw httpError(400, 'Elige primero el responsable: es quien cierra la tarea.', 'TASK_COLLABORATORS_NEED_ASSIGNEE');
  }
  const previous = (await tx.taskCollaborator.findMany({ where: { taskId }, select: { memberId: true } })).map((row) => row.memberId);
  await assertActiveTeamMembers(tx, ids, previous);

  const added = ids.filter((id) => !previous.includes(id));
  const removed = previous.filter((id) => !ids.includes(id));
  if (removed.length) {
    await tx.taskCollaborator.deleteMany({ where: { taskId, memberId: { in: removed } } });
    for (const memberId of removed) {
      await closeActiveTaskWorkSession(tx, { taskId, actorId: actorUserId, at, closeReason: 'REMOVED', workerId: memberId, isCollaborator: true });
    }
  }
  if (added.length) {
    await tx.taskCollaborator.createMany({
      data: added.map((memberId) => ({ taskId, memberId, addedById: actorUserId })),
      skipDuplicates: true
    });
  }
  return { ids, added, removed };
};

/** Un aviso a cada colaborador nuevo, nunca a quien lo añadió. Un fallo aquí no deshace la tarea. */
export const notifyCollaboratorsAdded = async ({ task, memberIds, actorUserId = null, db = prisma, notify = createNotification }) => {
  if (!task?.id || !Array.isArray(memberIds) || !memberIds.length) return;
  const members = await db.teamMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, userId: true } });
  for (const member of members) {
    if (!member.userId || member.userId === actorUserId) continue;
    try {
      await notify({
        userId: member.userId,
        type: COLLABORATOR_ADDED_NOTIFICATION,
        message: `Te sumaron como colaborador en «${task.title}». Tu tiempo se registra por separado.`,
        relatedId: task.id,
        url: `/gestion?taskId=${task.id}`,
        actorId: actorUserId
      });
    } catch (error) {
      console.error('[TaskCollaborators] No se pudo avisar al colaborador:', error?.message || error);
    }
  }
};

const loadWorkContext = async (tx, { taskId, userId }) => {
  const [task, member] = await Promise.all([
    tx.task.findUnique({ where: { id: taskId }, select: { id: true, status: true, assigneeId: true, collaborators: { select: { memberId: true } } } }),
    tx.teamMember.findFirst({ where: { userId, isActive: true }, select: { id: true } })
  ]);
  if (!task) throw httpError(404, 'La tarea ya no existe.', 'TASK_NOT_FOUND');
  if (!member || !task.collaborators.some((row) => row.memberId === member.id)) {
    throw httpError(403, 'Solo los colaboradores de la tarea registran tiempo aquí. El responsable lo hace moviendo la tarea.', 'TASK_NOT_COLLABORATOR');
  }
  return { task, member };
};

const WORKABLE_STATUSES = new Set(['PENDIENTE', 'EN_CURSO']);

export const startCollaboratorWork = async ({ taskId, userId, at = new Date(), db = prisma, transaction = null }) => {
  const execute = transaction || ((work) => recognitionTransaction(db, work));
  return execute(async (tx) => {
    const { task, member } = await loadWorkContext(tx, { taskId, userId });
    if (!WORKABLE_STATUSES.has(String(task.status))) {
      throw httpError(409, 'Esta tarea ya está cerrada o devuelta: su tiempo no se puede seguir registrando.', 'TASK_NOT_WORKABLE');
    }
    const cycle = await ensureTaskWorkCycle(tx, { taskId, actorId: userId, at });
    return openTaskWorkSession(tx, { task, cycleId: cycle.id, actorId: userId, at, workerId: member.id, isCollaborator: true });
  });
};

export const pauseCollaboratorWork = async ({ taskId, userId, at = new Date(), db = prisma, transaction = null }) => {
  const execute = transaction || ((work) => recognitionTransaction(db, work));
  return execute(async (tx) => {
    const { member } = await loadWorkContext(tx, { taskId, userId });
    return closeActiveTaskWorkSession(tx, { taskId, actorId: userId, at, closeReason: 'PAUSED', workerId: member.id, isCollaborator: true });
  });
};

const sessionElapsed = (session, now) => (session.endedAt
  ? Number(session.durationMs || 0)
  : Math.max(0, now.getTime() - new Date(session.startedAt).getTime()));

/**
 * El tiempo del equipo de una tarea: el responsable con el reloj de la tarea y cada colaborador
 * con la suma de sus propios tramos. Puro, para que la ruta y las pruebas lo calculen igual.
 */
export const buildTaskTeamTime = ({ task, sessions = [], now = new Date() }) => {
  const rows = [];
  if (task.assignee) {
    rows.push({
      memberId: task.assignee.id,
      userId: task.assignee.userId || null,
      name: task.assignee.name,
      avatarUrl: task.assignee.avatarUrl || null,
      role: 'ASSIGNEE',
      elapsedMs: getTaskElapsedMs(task, now),
      working: String(task.status) === 'EN_CURSO' && Boolean(task.startedAt)
    });
  }
  for (const { memberId, member } of task.collaborators || []) {
    const own = sessions.filter((session) => session.isCollaborator && session.workerId === memberId);
    rows.push({
      memberId,
      userId: member?.userId || null,
      name: member?.name || 'Colaborador',
      avatarUrl: member?.avatarUrl || null,
      role: 'COLLABORATOR',
      elapsedMs: own.reduce((total, session) => total + sessionElapsed(session, now), 0),
      working: own.some((session) => !session.endedAt)
    });
  }
  return rows;
};

export const getTaskTeamTime = async ({ taskId, db = prisma, now = new Date() }) => {
  const [task, sessions] = await Promise.all([
    db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, status: true, startedAt: true, accumulatedWorkMs: true,
        assignee: { select: { id: true, name: true, avatarUrl: true, userId: true } },
        collaborators: taskCollaboratorsSelect
      }
    }),
    db.taskWorkSession.findMany({
      where: { taskId, isCollaborator: true },
      select: { workerId: true, isCollaborator: true, durationMs: true, startedAt: true, endedAt: true }
    })
  ]);
  if (!task) throw httpError(404, 'La tarea ya no existe.', 'TASK_NOT_FOUND');
  return buildTaskTeamTime({ task, sessions, now });
};
