import { canOpenTask } from './taskPrivacy.js';
import { canUpdateTask, isManagerRole } from './taskEditPermissions.js';

export const PARTICIPATION_STATUSES = Object.freeze(['PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA']);
export const hasTaskParticipations = task => Boolean(task?.sharedProgress || task?.collaborators?.length);

// Las filas antiguas no acreditan cierres individuales. Se mantiene su cierre de conjunto,
// sin atribuir fechas/logros que nunca se registraron; un reloj abierto sí acredita trabajo activo.
export function taskParticipations(task) {
  if (Array.isArray(task?.participants)) return task.participants;
  if (!task) return [];
  const shared = hasTaskParticipations(task);
  const active = memberId => (task.workSessions || []).some(s => s.workerId === memberId && !s.endedAt);
  const inherited = (memberId, owner) => {
    if (!shared || task.status === 'REALIZADA') return task.status || 'PENDIENTE';
    if (owner && task.status === 'DEVUELTA') return 'DEVUELTA';
    return active(memberId) || (owner && task.startedAt && task.status === 'EN_CURSO') ? 'EN_CURSO' : 'PENDIENTE';
  };
  const row = (memberId, member, role, fields) => {
    const owner = role === 'ASSIGNEE';
    const legacy = shared && !fields.status;
    const status = (!shared ? task.status : fields.status) || inherited(memberId, owner);
    return {
      memberId, member: member || { id: memberId }, role, status,
      completedAt: shared ? (legacy ? null : fields.completedAt || null) : (task.completedAt || null),
      returnedAt: shared ? (fields.returnedAt || (legacy && owner ? task.returnedAt : null) || null) : (task.returnedAt || null),
      returnCount: shared ? Number(fields.returnCount || 0) : Number(task.returnCount || 0),
      revision: Number(fields.revision || 0), isReturned: status === 'DEVUELTA', legacy,
      baselineWorkMs: Number(fields.baselineWorkMs || 0),
    };
  };
  const rows = [];
  const assigneeId = task.assigneeId || task.assignee?.id;
  if (assigneeId) rows.push(row(assigneeId, task.assignee, 'ASSIGNEE', {
    status: task.assigneeStatus, completedAt: task.assigneeCompletedAt, returnedAt: task.assigneeReturnedAt,
    returnCount: task.assigneeReturnCount, revision: task.assigneeRevision,
    baselineWorkMs: task.assigneeBaselineWorkMs,
  }));
  for (const collaborator of task.collaborators || []) {
    if (collaborator.memberId && collaborator.memberId !== assigneeId) {
      rows.push(row(collaborator.memberId, collaborator.member, 'COLLABORATOR', collaborator));
    }
  }
  return rows;
}

export function aggregateParticipationStatus(participants) {
  if (participants.length && participants.every(p => p.status === 'REALIZADA')) return 'REALIZADA';
  if (participants.some(p => p.status === 'DEVUELTA')) return 'DEVUELTA';
  if (participants.some(p => p.status === 'EN_CURSO')) return 'EN_CURSO';
  return 'PENDIENTE';
}

export function participationPermissions(task, participant, user) {
  const userId = user?.userId || user?.id;
  const accessible = Boolean(userId) && canOpenTask(task, userId);
  const manager = isManagerRole(user?.role);
  const own = participant?.member?.userId === userId;
  return {
    canChangeStatus: accessible && (own || manager),
    canReturn: accessible && (own || canUpdateTask(user, task)),
    // Se conserva la reapertura pública con motivo de las tareas individuales.
    canReopen: accessible,
    canReintegrate: accessible && (manager || task.creatorId === userId),
  };
}

const hasText = value => typeof value === 'string' && Boolean(value.trim());
export function participationTransitionProblem(currentStatus, payload) {
  const next = payload?.status;
  if (!PARTICIPATION_STATUSES.includes(next)) return 'El estado de la participación no es válido.';
  if (next === currentStatus) return null;
  if (next === 'DEVUELTA' && (!hasText(payload.returnReason) || !hasText(payload.returnNote))) {
    return 'Para devolver esta parte indica el motivo y qué debe corregirse.';
  }
  if (currentStatus === 'REALIZADA' && next !== 'DEVUELTA') {
    if (next !== 'PENDIENTE') return 'Reabre primero esta parte en Pendiente.';
    if (!hasText(payload.reopenReason) || !hasText(payload.reopenNote)) return 'Reabrir esta parte requiere motivo y nota.';
  }
  if (currentStatus === 'DEVUELTA') {
    if (!['PENDIENTE', 'EN_CURSO'].includes(next)) return 'Reintegra esta parte antes de darla por realizada.';
    if (!hasText(payload.reintegrateReason)) return 'Explica qué se resolvió para reintegrar esta parte.';
  }
  for (const key of ['returnReason', 'returnNote', 'reopenReason', 'reopenNote', 'reintegrateReason']) {
    if (payload[key] != null && (typeof payload[key] !== 'string' || payload[key].length > 4000)) return 'El motivo o la nota no es válido.';
  }
  return null;
}
