import { hasTaskParticipations, taskParticipations } from './taskParticipation.js';

// Campos adicionales a id/status/assigneeId/assignee que necesitan las lecturas por persona.
// No incluye comentarios ni motivos: las proyecciones de carga siguen siendo cabeceras.
export const taskParticipationSelect = Object.freeze({
  sharedProgress: true,
  assigneeStatus: true,
  assigneeCompletedAt: true,
  assigneeReturnedAt: true,
  assigneeReturnCount: true,
  assigneeRevision: true,
  assigneeBaselineWorkMs: true,
  rosterVersion: true,
  collaborators: { select: {
    memberId: true, status: true, completedAt: true, returnedAt: true, returnCount: true, revision: true, baselineWorkMs: true,
    member: { select: { id: true, userId: true, name: true, avatarUrl: true, isActive: true } }
  } },
  participationArchives: { select: {
    id: true, memberId: true, userId: true, memberName: true, role: true, status: true,
    completedAt: true, returnedAt: true, returnCount: true, revision: true, baselineWorkMs: true, removedAt: true
  } },
  workSessions: { where: { endedAt: null }, select: { workerId: true, startedAt: true, endedAt: true } }
});

export const projectTaskParticipation = (task, participant) => {
  const isCollaboration = participant.memberId !== task.assigneeId;
  const member = participant.member || (isCollaboration ? null : task.assignee);
  return {
    ...task,
    participantMemberId: participant.memberId,
    participationKey: `${task.id}:${participant.memberId}`,
    globalStatus: task.globalStatus || task.status,
    globalCompletedAt: task.globalCompletedAt || task.completedAt || null,
    status: participant.status,
    completedAt: participant.completedAt,
    returnedAt: participant.returnedAt,
    returnCount: participant.returnCount,
    isReturned: participant.isReturned,
    participantRevision: participant.revision,
    startedAt: participant.startedAt || null,
    accumulatedWorkMs: Number(participant.accumulatedWorkMs ?? participant.baselineWorkMs ?? 0),
    isCollaboration,
    assigneeId: participant.memberId,
    assignee: member,
    // La hora comprometida corresponde al responsable; participar no crea otro compromiso.
    focusDeadlineAt: isCollaboration ? null : task.focusDeadlineAt,
    recognitions: (task.recognitions || []).filter(award => award.recipient?.id === member?.userId)
  };
};

export const completedTaskParticipationWhere = (dateFilter = { not: null }) => ({
  OR: [
    { status: 'REALIZADA', completedAt: dateFilter },
    { assigneeStatus: 'REALIZADA', assigneeCompletedAt: dateFilter },
    { collaborators: { some: { status: 'REALIZADA', completedAt: dateFilter } } },
    { participationArchives: { some: { status: 'REALIZADA', completedAt: dateFilter } } }
  ]
});

export const archivedParticipationWorkMs = (task, memberId) => (task.participationArchives || [])
  .filter(archive => archive.memberId === memberId).reduce((sum, archive) => sum + Number(archive.baselineWorkMs || 0), 0);

export const projectArchivedTaskParticipation = (task, archive) => ({
  ...projectTaskParticipation(task, { ...archive, member: { id: archive.memberId, userId: archive.userId, name: archive.memberName } }),
  participantArchiveId: archive.id,
  isArchivedParticipation: true,
  participationKey: `${task.id}:archive:${archive.id}`,
  participantRevision: null,
  startedAt: null,
  focusDeadlineAt: null,
  recognitions: []
});

// El historial previo sigue mostrando su cierre global, una vez y con su responsable original.
// Una finalización heredada sin fecha personal jamás crea logros adicionales.
export const completedTaskParticipationViews = (task) => {
  if (task.participantMemberId) {
    return task.status === 'REALIZADA' && task.completedAt ? [task] : [];
  }
  const archived = (task.participationArchives || []).filter(archive => archive.status === 'REALIZADA' && archive.completedAt)
    .map(archive => projectArchivedTaskParticipation(task, archive));
  if (!hasTaskParticipations(task)) return [...(task.status === 'REALIZADA' && task.completedAt ? [task] : []), ...archived];
  const participants = taskParticipations(task);
  const recorded = participants.filter(person => !person.legacy && person.status === 'REALIZADA' && person.completedAt);
  if (recorded.length) return [...recorded.map(person => projectTaskParticipation(task, person)), ...archived];
  const entirelyLegacy = participants.every(person => person.legacy);
  return [...(entirelyLegacy && task.status === 'REALIZADA' && task.completedAt ? [task] : []), ...archived];
};

export const taskForMember = (task, memberId) => {
  if (!hasTaskParticipations(task)) return task;
  const participant = taskParticipations(task).find(person => person.memberId === memberId);
  return participant ? projectTaskParticipation(task, participant) : null;
};
