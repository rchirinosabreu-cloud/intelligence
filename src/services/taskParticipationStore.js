import { hasTaskParticipations, taskParticipations, participationPermissions } from '../lib/taskParticipation.js';
import { ensureTaskWorkCycle, openTaskWorkSession } from './taskWorkSessionService.js';

export const participantMemberSelect = { id: true, userId: true, name: true, avatarUrl: true, isActive: true, role: true };
export const participantCollaboratorsSelect = { select: {
  memberId: true, status: true, completedAt: true, returnedAt: true, returnCount: true, revision: true, baselineWorkMs: true,
  member: { select: participantMemberSelect },
} };
export const participationInclude = {
  assignee: { select: participantMemberSelect }, collaborators: participantCollaboratorsSelect,
  viewers: { select: { userId: true } }, workSessions: { where: { endedAt: null },
    select: { workerId: true, isCollaborator: true, startedAt: true, endedAt: true, isRework: true } },
  client: { select: { name: true, slug: true, logoUrl: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
  contentItem: { include: { plan: { select: { id: true, clientId: true, month: true, year: true, status: true, ownerId: true } },
    publications: { select: { status: true } } } },
};

export function participantData(participant, owner = false) {
  return owner ? {
    assigneeStatus: participant.status, assigneeCompletedAt: participant.completedAt,
    assigneeReturnedAt: participant.returnedAt, assigneeReturnCount: participant.returnCount,
    assigneeRevision: participant.revision,
    assigneeBaselineWorkMs: participant.baselineWorkMs || 0,
  } : {
    status: participant.status, completedAt: participant.completedAt, returnedAt: participant.returnedAt,
    returnCount: participant.returnCount, revision: participant.revision,
    baselineWorkMs: participant.baselineWorkMs || 0,
  };
}

// El inicio sí existe en el registro legado: se conserva, nunca se estima una fecha.
export async function materializeLegacyOwnerSession(tx, task) {
  if (task.assigneeStatus || !task.assigneeId || task.status !== 'EN_CURSO' || !task.startedAt) return;
  const existing = await tx.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: task.assigneeId, endedAt: null } });
  if (existing) return;
  const cycle = await ensureTaskWorkCycle(tx, { taskId: task.id, at: task.startedAt });
  await openTaskWorkSession(tx, { task, cycleId: cycle.id, at: task.startedAt, workerId: task.assigneeId });
}

// Inicialización perezosa: nunca inventa fechas de logro para cierres anteriores.
export async function initializeTaskParticipations(tx, task) {
  if (!hasTaskParticipations(task)) return task;
  await materializeLegacyOwnerSession(tx, task);
  const participants = taskParticipations(task);
  const owner = participants.find(p => p.role === 'ASSIGNEE');
  if (owner && !task.assigneeStatus) {
    const total = await tx.taskWorkSession.aggregate({ where: { taskId: task.id, isCollaborator: false, endedAt: { not: null } }, _sum: { durationMs: true } });
    owner.baselineWorkMs = Math.max(0, Number(task.accumulatedWorkMs || 0) - Number(total._sum.durationMs || 0));
  }
  if (!task.sharedProgress || !task.assigneeStatus) {
    await tx.task.update({ where: { id: task.id }, data: { sharedProgress: true, ...(owner ? participantData(owner, true) : {}) } });
  }
  for (const row of participants.filter(p => p.role === 'COLLABORATOR' && p.legacy)) {
    await tx.taskCollaborator.update({ where: { taskId_memberId: { taskId: task.id, memberId: row.memberId } }, data: participantData(row) });
  }
  return { ...task, sharedProgress: true, ...(owner ? participantData(owner, true) : {}),
    collaborators: (task.collaborators || []).map(c => ({ ...c, ...participantData(participants.find(p => p.memberId === c.memberId)) })) };
}

export async function hydrateTaskParticipations(db, tasks, user) {
  const shared = tasks.filter(hasTaskParticipations);
  if (!shared.length) return tasks;
  const totals = await db.taskWorkSession.groupBy({ by: ['taskId', 'workerId', 'isCollaborator'],
    where: { taskId: { in: shared.map(t => t.id) }, endedAt: { not: null } }, _sum: { durationMs: true } });
  const archived = await db.taskParticipationArchive.groupBy({ by: ['taskId', 'memberId'],
    where: { taskId: { in: shared.map(t => t.id) } }, _sum: { baselineWorkMs: true } });
  const sums = new Map(), ownerRecorded = new Map();
  for (const t of totals) {
    const key = `${t.taskId}:${t.workerId}`;
    sums.set(key, (sums.get(key) || 0) + Number(t._sum.durationMs || 0));
    if (!t.isCollaborator) ownerRecorded.set(t.taskId, (ownerRecorded.get(t.taskId) || 0) + Number(t._sum.durationMs || 0));
  }
  const archivedSums = new Map(archived.map(t => [`${t.taskId}:${t.memberId}`, Number(t._sum.baselineWorkMs || 0)]));
  return tasks.map(task => {
    if (!hasTaskParticipations(task)) return task;
    return { ...task, sharedProgress: true, rosterVersion: task.rosterVersion || 0,
      participants: taskParticipations(task).map(p => ({ ...p,
        startedAt: (task.workSessions || []).find(s => s.workerId === p.memberId && !s.endedAt)?.startedAt
          || (p.legacy && p.role === 'ASSIGNEE' && p.status === 'EN_CURSO' ? task.startedAt : null) || null,
        accumulatedWorkMs: (sums.get(`${task.id}:${p.memberId}`) || 0) + (p.legacy && p.role === 'ASSIGNEE'
          ? Math.max(0, Number(task.accumulatedWorkMs || 0) - (ownerRecorded.get(task.id) || 0)) : p.baselineWorkMs || 0)
          + (archivedSums.get(`${task.id}:${p.memberId}`) || 0),
        permissions: participationPermissions(task, p, user),
      })) };
  });
}

// Un logro retirado muestra el tiempo que existía al retirarlo, no tramos de un reingreso posterior.
export async function hydrateArchivedTaskParticipations(db, tasks) {
  return Promise.all(tasks.map(async task => ({ ...task,
    participationArchives: await Promise.all((task.participationArchives || []).map(async archive => {
      const total = await db.taskWorkSession.aggregate({ where: { taskId: task.id, workerId: archive.memberId,
        endedAt: { lte: archive.removedAt } }, _sum: { durationMs: true } });
      const baseline = (task.participationArchives || []).filter(p => p.memberId === archive.memberId && new Date(p.removedAt) <= new Date(archive.removedAt))
        .reduce((sum, p) => sum + Number(p.baselineWorkMs || 0), 0);
      return { ...archive, startedAt: null, accumulatedWorkMs: Number(total._sum.durationMs || 0) + baseline };
    })) } )));
}
