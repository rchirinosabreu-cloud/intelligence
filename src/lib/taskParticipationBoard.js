// La tarea se guarda una vez; sus tarjetas representan la parte de cada persona.
export const taskCardKey = task => task?.boardKey || String(task?.id || '');

// El mecanismo personal conserva el historial; la presentación refleja solo el equipo vigente.
export function hasActiveTaskTeam(task) {
  const source = task?.canonicalTask || task;
  if (Array.isArray(source?.participants)) return source.participants.length > 1;
  return Boolean(source?.collaborators?.length);
}

export function projectTaskParticipations(tasks) {
  return (tasks || []).flatMap(task => {
    if (!task.sharedProgress || !Array.isArray(task.participants) || !task.participants.length) return [task];
    return task.participants.map(participation => ({
      ...task,
      canonicalTask: task,
      boardKey: JSON.stringify([String(task.id), String(participation.memberId)]),
      participation,
      globalStatus: task.status,
      focusDeadlineAt: participation.role === 'ASSIGNEE' ? task.focusDeadlineAt : null,
      status: participation.status,
      startedAt: participation.startedAt,
      completedAt: participation.completedAt,
      accumulatedWorkMs: participation.accumulatedWorkMs || 0,
      isReturned: Boolean(participation.isReturned || participation.status === 'DEVUELTA'),
      assigneeId: participation.memberId,
      assigneeUserId: participation.member?.userId || null,
      assigneeName: participation.member?.name || 'Participante',
      assigneeAvatar: participation.member?.avatarUrl || null,
      collaborators: [],
    }));
  });
}

export const individualPriorityCards = cards => (cards || []).filter(card => !card.sharedProgress && !card.participation);
export const individualPriorityAnchor = (cards, index) => individualPriorityCards((cards || []).slice(index))[0]?.id ?? null;

export function taskCardForDeepLink(cards, taskId, memberId, userId) {
  const matches = (cards || []).filter(card => String(card.id) === String(taskId));
  return matches.find(card => memberId && card.participation?.memberId === memberId)
    || matches.find(card => userId && card.assigneeUserId === userId)
    || matches[0];
}

const CHANGE_FIELDS = ['status', 'returnReason', 'returnNote', 'reopenReason', 'reopenNote', 'reintegrateReason'];
export function participationRequest(card, changes) {
  if (!card.participation) return { path: `/api/tasks/${encodeURIComponent(card.id)}`, body: changes };
  return {
    path: `/api/tasks/${encodeURIComponent(card.id)}/participants/${encodeURIComponent(card.participation.memberId)}`,
    body: {
      ...Object.fromEntries(CHANGE_FIELDS.filter(key => changes[key] !== undefined).map(key => [key, changes[key]])),
      expectedRevision: card.participation.revision,
      expectedRosterVersion: (card.canonicalTask || card).rosterVersion,
    },
  };
}

export function applyParticipationReceipt(tasks, saved) {
  return (tasks || []).map(task => {
    if (String(task.id) !== String(saved.id)) return task;
    const confirmed = {};
    for (const key of ['status', 'sortOrder', 'completedAt', 'startedAt', 'accumulatedWorkMs', 'isReturned', 'sharedProgress', 'rosterVersion', 'participants']) {
      if (Object.hasOwn(saved, key)) confirmed[key] = saved[key];
    }
    if (Array.isArray(saved.workSessions)) confirmed.openSessions = saved.workSessions;
    return { ...task, ...confirmed };
  });
}

export const didCompleteParticipation = (saved, memberId) => Boolean(
  saved?.participationTransition?.changed && saved.participationTransition.completed
  && String(saved.participationTransition.memberId) === String(memberId)
);
