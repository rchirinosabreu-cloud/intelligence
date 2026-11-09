import prisma from '../lib/prisma.js';
import { clearTaskCardOrder } from './taskCardOrderService.js';
import { assertTaskSourceActive, taskSourceSelect } from '../lib/taskRetirement.js';
import { assertActiveTeamMembers } from './teamRosterService.js';
import { recognitionTransaction } from './recognitionService.js';
import { createNotification } from './notificationService.js';
import { normalizeCollaboratorIds } from '../lib/taskCollaborators.js';
import { closeTaskWorkSession, getTaskElapsedMs } from '../lib/taskTiming.js';
import { closeActiveTaskWorkSession, ensureTaskWorkCycle, openTaskWorkSession } from './taskWorkSessionService.js';
import { participantCollaboratorsSelect, participantData, participationInclude, materializeLegacyOwnerSession } from './taskParticipationStore.js';
import { hasTaskParticipations, taskParticipations, aggregateParticipationStatus } from '../lib/taskParticipation.js';
import { updateOrderedTask } from './taskOrderService.js';

/**
 * Una sola tarea con participaciones independientes. Esta capa conserva el equipo y sus
 * historias al reasignar; taskParticipationService mueve cada parte con su reloj. Las rutas
 * anteriores de reloj manual se rechazan para que no puedan desincronizar estado y sesión.
 */

export const COLLABORATOR_ADDED_NOTIFICATION = 'TASK_COLLABORATOR_ADDED';

/** Lo que una tarea trae de sus colaboradores en la lista y en el panel. */
export const taskCollaboratorsSelect = participantCollaboratorsSelect;

/** Los relojes abiertos de la tarea, para saber en el tablero quién está trabajando ahora. */
export const taskOpenSessionsSelect = {
  where: { endedAt: null },
  select: { workerId: true, isCollaborator: true, startedAt: true }
};

const httpError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

/**
 * Deja la lista de colaboradores de una tarea como la pide `collaboratorIds`. Nunca guarda al
 * responsable; sin responsable no admite a nadie. Quien sale conserva un archivo de su
 * participación y sus sesiones, pierde el acceso por colaboración y deja de contar en el agregado.
 */
export const replaceTaskCollaborators = async (tx, { taskId, assigneeId, collaboratorIds, expectedRosterVersion, actorUserId = null, at = new Date() }) => {
  const ids = normalizeCollaboratorIds(collaboratorIds, assigneeId);
  if (ids.length && !assigneeId) {
    throw httpError(400, 'Elige primero un responsable para el equipo.', 'TASK_COLLABORATORS_NEED_ASSIGNEE');
  }
  const previous = (await tx.taskCollaborator.findMany({ where: { taskId }, select: { memberId: true } })).map((row) => row.memberId);
  await assertActiveTeamMembers(tx, ids, previous);

  const added = ids.filter((id) => !previous.includes(id));
  const removed = previous.filter((id) => !ids.includes(id));
  const current = await tx.task.findUnique({ where: { id: taskId }, include: participationInclude });
  const changed = added.length || removed.length || current?.assigneeId !== assigneeId;
  const shared = current && (hasTaskParticipations(current) || ids.length);
  if (shared && changed) {
    if (hasTaskParticipations(current) && expectedRosterVersion !== (current.rosterVersion || 0)) {
      throw httpError(409, 'El equipo cambió. Actualiza la tarea antes de editar sus participantes.', 'TASK_ROSTER_CHANGED');
    }
    if (!assigneeId) throw httpError(400, 'La tarea compartida necesita un responsable.', 'TASK_SHARED_NEEDS_ASSIGNEE');
    if (current.status === 'REALIZADA') throw httpError(409, 'Reabre una participación antes de cambiar el equipo de una tarea terminada.', 'TASK_ROSTER_CLOSED');
    const previousParts = taskParticipations(current);
    await materializeLegacyOwnerSession(tx, current);
    if (!current.assigneeStatus && current.assigneeId) {
      const total = await tx.taskWorkSession.aggregate({ where: { taskId, isCollaborator: false, endedAt: { not: null } }, _sum: { durationMs: true } });
      const previousOwner = previousParts.find(p => p.memberId === current.assigneeId);
      previousOwner.baselineWorkMs = Math.max(0, Number(current.accumulatedWorkMs || 0) - Number(total._sum.durationMs || 0));
    }
    const nextIds = [assigneeId, ...ids];
    const parts = [];
    for (const memberId of nextIds) {
      const existing = previousParts.find(p => p.memberId === memberId);
      if (existing) parts.push(existing);
      else {
        const archived = await tx.taskParticipationArchive.aggregate({ where: { taskId, memberId }, _max: { revision: true } });
        parts.push({ memberId, status: 'PENDIENTE', completedAt: null, returnedAt: null, returnCount: 0,
          revision: archived._max.revision == null ? 0 : archived._max.revision + 1 });
      }
    }
    const aggregate = aggregateParticipationStatus(parts);
    if (aggregate === 'REALIZADA') throw httpError(409, 'No puedes cerrar la tarea retirando a la última persona pendiente. Resuelve su parte primero.', 'TASK_ROSTER_IMPLICIT_CLOSE');
    // Los tramos pertenecen al trabajador incluso después de un cambio de responsable.
    const leaving = previousParts.filter(p => !nextIds.includes(p.memberId));
    for (const part of leaving) {
      await clearTaskCardOrder(tx, taskId, part.memberId);
      await tx.taskParticipationArchive.create({ data: { taskId, currentTaskId: taskId, memberId: part.memberId,
        userId: part.member?.userId || null, memberName: part.member?.name || null, role: part.role,
        status: part.status, completedAt: part.completedAt, returnedAt: part.returnedAt,
        returnCount: part.returnCount, revision: part.revision, baselineWorkMs: part.baselineWorkMs || 0, removedAt: at } });
      const open = await tx.taskWorkSession.findMany({ where: { taskId, workerId: part.memberId, endedAt: null } });
      for (const session of open) await tx.taskWorkSession.update({ where: { id: session.id }, data: {
        endedAt: at, durationMs: Math.max(0, at.getTime() - new Date(session.startedAt).getTime()), closeReason: 'REMOVED', endedById: actorUserId,
      } });
    }
    await tx.taskCollaborator.deleteMany({ where: { taskId, memberId: { notIn: ids } } });
    for (const memberId of ids) await tx.taskCollaborator.upsert({ where: { taskId_memberId: { taskId, memberId } },
      create: { taskId, memberId, addedById: actorUserId, ...participantData(parts.find(p => p.memberId === memberId)) },
      update: participantData(parts.find(p => p.memberId === memberId)),
    });
    const owner = parts[0];
    const ownSessions = await tx.taskWorkSession.findMany({ where: { taskId, workerId: assigneeId } });
    const archive = await tx.taskParticipationArchive.aggregate({ where: { taskId, memberId: assigneeId }, _sum: { baselineWorkMs: true } });
    await updateOrderedTask(tx, { where: { id: taskId }, data: {
      assigneeId, sharedProgress: true, ...participantData(owner, true), rosterVersion: { increment: 1 },
      status: aggregate, isReturned: aggregate === 'DEVUELTA',
      startedAt: ownSessions.find(s => !s.endedAt)?.startedAt || null,
      accumulatedWorkMs: ownSessions.reduce((sum, s) => sum + Number(s.durationMs || 0), 0) + (owner.baselineWorkMs || 0) + Number(archive._sum.baselineWorkMs || 0),
    } }, current);
    return { ids, added, removed, shared: true, changed: true };
  }
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

/**
 * Quién pide el reloj y en qué tarea. En una tarea con colaboradores **todos** usan su botón,
 * también el responsable (Rodny, 5 de octubre de 2026: «una regla para todos»). En una tarea de
 * una sola persona el reloj sigue corriendo con la columna, como siempre, y aquí no hay nada que hacer.
 */
const loadWorkContext = async (tx, { taskId, userId }) => {
  const [task, member] = await Promise.all([
    tx.task.findUnique({
      where: { id: taskId },
      select: { id: true, ...taskSourceSelect, status: true, sharedProgress: true, assigneeId: true, startedAt: true, accumulatedWorkMs: true, collaborators: { select: { memberId: true } } }
    }),
    tx.teamMember.findFirst({ where: { userId, isActive: true }, select: { id: true } })
  ]);
  if (!task) throw httpError(404, 'La tarea ya no existe.', 'TASK_NOT_FOUND');
  assertTaskSourceActive(task);
  if (hasTaskParticipations(task)) throw httpError(409, 'El reloj acompaña el estado de tu participación. Actualiza el tablero y mueve tu parte.', 'TASK_PARTICIPATION_REQUIRED');
  const isAssignee = Boolean(member) && task.assigneeId === member.id;
  const isCollaborator = Boolean(member) && task.collaborators.some((row) => row.memberId === member.id);
  if (!isAssignee && !isCollaborator) {
    throw httpError(403, 'Solo el equipo de la tarea registra tiempo aquí.', 'TASK_NOT_COLLABORATOR');
  }
  if (isAssignee && !task.collaborators.length) {
    throw httpError(409, 'En una tarea de una sola persona el tiempo corre al pasarla a «En proceso».', 'TASK_NOT_TEAM');
  }
  return { task, member, isAssignee };
};

export const startCollaboratorWork = async ({ taskId, userId, at = new Date(), db = prisma, transaction = null }) => {
  const execute = transaction || ((work) => recognitionTransaction(db, work));
  return execute(async (tx) => {
    const { task, member, isAssignee } = await loadWorkContext(tx, { taskId, userId });
    // Los relojes solo corren con la tarea en proceso: así sacarla de ahí los para a todos.
    if (String(task.status) !== 'EN_CURSO') {
      throw httpError(409, 'Pasa la tarea a «En proceso» para registrar tu tiempo.', 'TASK_NOT_IN_PROGRESS');
    }
    const cycle = await ensureTaskWorkCycle(tx, { taskId, actorId: userId, at });
    if (isAssignee) {
      // El reloj del responsable es el de la tarea: lo mueve su botón, no la columna.
      if (!task.startedAt) await tx.task.update({ where: { id: taskId }, data: { startedAt: at } });
      return openTaskWorkSession(tx, { task, cycleId: cycle.id, actorId: userId, at, workerId: member.id, isCollaborator: false });
    }
    return openTaskWorkSession(tx, { task, cycleId: cycle.id, actorId: userId, at, workerId: member.id, isCollaborator: true });
  });
};

export const pauseCollaboratorWork = async ({ taskId, userId, at = new Date(), db = prisma, transaction = null }) => {
  const execute = transaction || ((work) => recognitionTransaction(db, work));
  return execute(async (tx) => {
    const { task, member, isAssignee } = await loadWorkContext(tx, { taskId, userId });
    if (isAssignee) {
      if (task.startedAt) {
        await tx.task.update({ where: { id: taskId }, data: { startedAt: null, accumulatedWorkMs: closeTaskWorkSession(task, at) } });
      }
      return closeActiveTaskWorkSession(tx, { taskId, actorId: userId, at, closeReason: 'PAUSED' });
    }
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
  if (hasTaskParticipations(task)) return taskParticipations(task).map(person => {
    const own = sessions.filter(session => session.workerId === person.memberId);
    const baseline = person.legacy && person.role === 'ASSIGNEE'
      ? Math.max(0, Number(task.accumulatedWorkMs || 0) - sessions.filter(s => !s.isCollaborator && s.endedAt).reduce((sum, s) => sum + Number(s.durationMs || 0), 0))
      : person.baselineWorkMs || 0;
    const legacyRunning = person.legacy && person.role === 'ASSIGNEE' && person.status === 'EN_CURSO' && task.startedAt && !own.some(s => !s.endedAt);
    return { memberId: person.memberId, userId: person.member?.userId || null, name: person.member?.name || 'Participante',
      avatarUrl: person.member?.avatarUrl || null, role: person.role, status: person.status,
      elapsedMs: own.reduce((sum, session) => sum + sessionElapsed(session, now), 0) + baseline
        + (task.participationArchives || []).filter(p => p.memberId === person.memberId).reduce((sum, p) => sum + Number(p.baselineWorkMs || 0), 0)
        + (legacyRunning ? Math.max(0, now.getTime() - new Date(task.startedAt).getTime()) : 0), working: Boolean(legacyRunning) || own.some(session => !session.endedAt) };
  });
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
        id: true, status: true, sharedProgress: true, assigneeId: true, assigneeStatus: true,
        assigneeCompletedAt: true, assigneeReturnedAt: true, assigneeRevision: true, assigneeReturnCount: true,
        assigneeBaselineWorkMs: true,
        participationArchives: { select: { memberId: true, baselineWorkMs: true } },
        startedAt: true, accumulatedWorkMs: true,
        assignee: { select: { id: true, name: true, avatarUrl: true, userId: true } },
        collaborators: taskCollaboratorsSelect
      }
    }),
    db.taskWorkSession.findMany({
      where: { taskId },
      select: { workerId: true, isCollaborator: true, durationMs: true, startedAt: true, endedAt: true }
    })
  ]);
  if (!task) throw httpError(404, 'La tarea ya no existe.', 'TASK_NOT_FOUND');
  return buildTaskTeamTime({ task, sessions, now });
};
