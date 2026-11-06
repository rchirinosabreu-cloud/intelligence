import prisma from '../lib/prisma.js';
import { hasTaskParticipations, taskParticipations, aggregateParticipationStatus, participationPermissions, participationTransitionProblem } from '../lib/taskParticipation.js';
import { canOpenTask } from '../lib/taskPrivacy.js';
import { RETURN_REASONS, REOPEN_REASONS } from '../lib/taskTiming.js';
import { publicationTaskCloseProblem } from '../lib/socialPublishing.js';
import { isPublicationTask } from '../lib/contentTaskReciprocity.js';
import { MIN_MEASURED_MS, DECLARED_CLOSE_REASON } from '../lib/declaredTime.js';
import { recognitionTransaction, prepareTaskRecognition, finishTaskRecognition, recordPlanRecognition } from './recognitionService.js';
import { initializeTaskParticipations, participationInclude, participantData, hydrateTaskParticipations } from './taskParticipationStore.js';
import { ensureTaskWorkCycle, openTaskWorkSession, closeActiveTaskWorkCycle } from './taskWorkSessionService.js';
import { updateOrderedTask } from './taskOrderService.js';
import { applyTaskAggregateEffects } from './taskCompletionEffectsService.js';
import { assertTaskNotLocked } from './taskFocusService.js';
import { suspensionBlock } from './clientSuspensionGate.js';
import { resetSystemStreak, recordQualityStreakTransition } from './qualityStreakService.js';
import { createNotification } from './notificationService.js';
import { notifyTeamCompletion } from './teamCompletionNoticeService.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const keys = new Set(['status', 'expectedRevision', 'expectedRosterVersion', 'returnReason', 'returnNote', 'reopenReason', 'reopenNote', 'reintegrateReason']);

export async function readTaskParticipationDetail({ db = prisma, taskId, user }) {
  return db.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: {
      ...participationInclude, taskAttachments: true,
      taskComments: { include: { author: { select: { id: true, name: true, avatarUrl: true, role: true } }, attachments: true }, orderBy: { createdAt: 'desc' } },
    } });
    if (!task) throw fail(404, 'La tarea ya no existe.');
    if (!canOpenTask(task, user?.userId || user?.id)) throw fail(403, 'No tienes acceso a esta tarea.');
    const [snapshot] = await hydrateTaskParticipations(tx, [task], user);
    const plan = task.contentItem?.plan;
    if (plan) {
      snapshot.contentPlanId = plan.id;
      snapshot.plan = { id: plan.id, slug: task.client?.slug, month: plan.month, year: plan.year, status: plan.status };
    }
    return snapshot;
  }, { isolationLevel: 'RepeatableRead' });
}

export async function closeParticipantSessions(tx, { taskId, memberId, actorId, at, closeReason }) {
  const sessions = await tx.taskWorkSession.findMany({ where: { taskId, workerId: memberId, endedAt: null } });
  for (const session of sessions) await tx.taskWorkSession.update({ where: { id: session.id }, data: {
    endedAt: at, endedById: actorId, closeReason, durationMs: Math.max(0, at.getTime() - new Date(session.startedAt).getTime()),
  } });
}

export async function changeTaskParticipation({ db = prisma, transaction, taskId, memberId, user, payload = {}, at = new Date() }) {
  if (Object.keys(payload).some(k => !keys.has(k))) throw fail(400, 'Este movimiento solo admite el estado y los motivos de la participación.');
  if (!Number.isSafeInteger(payload.expectedRevision) || !Number.isSafeInteger(payload.expectedRosterVersion)) {
    throw fail(409, 'Actualiza la tarea antes de mover tu participación.');
  }
  const actorId = user?.userId || user?.id;
  const execute = transaction || (work => recognitionTransaction(db, work));
  const result = await execute(async tx => {
    let task = await tx.task.findUnique({ where: { id: taskId }, include: participationInclude });
    if (!task) throw fail(404, 'La tarea ya no existe.');
    if (!hasTaskParticipations(task)) throw fail(409, 'Esta tarea no tiene participaciones compartidas.');
    if (!canOpenTask(task, actorId)) throw fail(403, 'No tienes acceso a esta tarea.');
    let parts = taskParticipations(task);
    const own = parts.find(p => p.memberId === memberId);
    if (!own) throw fail(409, 'Esta persona ya no participa en la tarea. Actualiza el tablero.');
    if (own.revision !== payload.expectedRevision || (task.rosterVersion || 0) !== payload.expectedRosterVersion) {
      throw fail(409, 'La participación o el equipo cambió. Actualiza el tablero y revisa el movimiento.');
    }
    const permissions = participationPermissions(task, own, user);
    const next = payload.status;
    const allowed = next === 'DEVUELTA' ? permissions.canReturn
      : own.status === 'REALIZADA' && next !== own.status ? permissions.canReopen
        : own.status === 'DEVUELTA' && next !== own.status ? permissions.canReintegrate : permissions.canChangeStatus;
    if (!allowed) throw fail(403, 'No puedes realizar este movimiento para esta persona.');
    const problem = participationTransitionProblem(own.status, payload);
    if (problem) throw fail(400, problem);
    if (next === 'DEVUELTA' && next !== own.status && !RETURN_REASONS.some(r => r.value === payload.returnReason)) throw fail(400, 'Selecciona un motivo de devolución válido.');
    if (own.status === 'REALIZADA' && next === 'PENDIENTE' && !REOPEN_REASONS.some(r => r.value === payload.reopenReason)) throw fail(400, 'Selecciona un motivo de reapertura válido.');
    if (next === own.status) {
      const [snapshot] = await hydrateTaskParticipations(tx, [task], user);
      snapshot.participationTransition = { memberId, fromStatus: own.status, toStatus: next, changed: false, completed: false, globalCompleted: false };
      return { snapshot, changed: false };
    }
    if (next === 'EN_CURSO' && own.member?.isActive === false) throw fail(409, 'Esta persona está inactiva. Cambia el equipo antes de iniciar su parte.');
    await assertTaskNotLocked(tx, { user, taskId });
    const plan = task.contentItem?.plan;
    if (plan) {
      const block = await suspensionBlock(tx, { clientId: plan.clientId, year: plan.year, month: plan.month, clientName: task.client?.name, forTask: true });
      if (block) throw fail(409, block.reason);
    }
    const changedPart = { ...own, status: next, completedAt: next === 'REALIZADA' ? at : null,
      returnedAt: next === 'DEVUELTA' ? at : own.returnedAt,
      returnCount: own.returnCount + (next === 'DEVUELTA' ? 1 : 0), revision: own.revision + 1 };
    parts = parts.map(p => p.memberId === memberId ? changedPart : p);
    const status = aggregateParticipationStatus(parts);
    if (status === 'REALIZADA' && task.status !== status && isPublicationTask(task.title)) {
      const blocked = publicationTaskCloseProblem({ item: task.contentItem, publications: task.contentItem?.publications || [] });
      if (blocked) throw fail(409, blocked);
    }
    const before = await prepareTaskRecognition(tx, taskId, at);
    task = await initializeTaskParticipations(tx, task);
    const reopening = own.status === 'REALIZADA';
    const cycle = await ensureTaskWorkCycle(tx, { taskId, actorId, at,
      kind: reopening || own.status === 'DEVUELTA' ? 'REWORK' : 'INITIAL',
      reason: payload.reopenReason || (own.status === 'DEVUELTA' ? 'RETURNED' : null), note: payload.reopenNote || payload.reintegrateReason || null });
    if (next !== 'EN_CURSO') await closeParticipantSessions(tx, { taskId, memberId, actorId, at,
      closeReason: next === 'REALIZADA' ? 'COMPLETED' : next === 'DEVUELTA' ? 'RETURNED' : 'PAUSED' });
    else {
      const running = await tx.taskWorkSession.findFirst({ where: { taskId, workerId: memberId, endedAt: null } });
      if (!running) {
        const archivedRevision = await tx.taskParticipationArchive.aggregate({ where: { taskId, memberId }, _max: { revision: true } });
        const rework = await tx.operationalTraceEvent.findFirst({ where: { taskId, eventType: 'TASK_PARTICIPATION_CHANGED', AND: [
          { metadata: { path: ['memberId'], equals: memberId } },
          { metadata: { path: ['revision'], gt: archivedRevision._max.revision ?? -1 } },
          { OR: [{ metadata: { path: ['fromStatus'], equals: 'REALIZADA' } }, { metadata: { path: ['fromStatus'], equals: 'DEVUELTA' } }] },
        ] }, select: { id: true } });
        await openTaskWorkSession(tx, { task, cycleId: cycle.id, actorId, at, workerId: memberId,
          isCollaborator: own.role !== 'ASSIGNEE', isRework: cycle.kind === 'REWORK' || own.status === 'DEVUELTA' || Boolean(rework) });
      }
    }
    const owner = own.role === 'ASSIGNEE';
    if (owner) changedPart.baselineWorkMs = task.assigneeBaselineWorkMs || 0;
    if (!owner) await tx.taskCollaborator.update({ where: { taskId_memberId: { taskId, memberId } }, data: participantData(changedPart) });
    if (next === 'DEVUELTA') await resetSystemStreak(tx);
    // Los cambios cotidianos quedan en la auditoría; solo las incidencias van a la conversación.
    const commentType = next === 'DEVUELTA' ? 'system_return' : reopening ? 'system_reopen'
      : own.status === 'DEVUELTA' ? 'system_reintegrate' : null;
    if (commentType) {
      const note = next === 'DEVUELTA' ? `[${payload.returnReason}]\n${own.member?.name}: ${payload.returnNote.trim()}`
        : reopening ? `[${payload.reopenReason || 'OTHER'}]\n${own.member?.name}: ${payload.reopenNote?.trim() || payload.returnNote?.trim()}`
          : `${own.member?.name}: ${payload.reintegrateReason.trim()}`;
      await tx.taskComment.create({ data: { taskId, authorId: actorId, content: note, type: commentType } });
    }
    const personalSessions = await tx.taskWorkSession.findMany({ where: { taskId, workerId: memberId } });
    const archived = await tx.taskParticipationArchive.aggregate({ where: { taskId, memberId }, _sum: { baselineWorkMs: true } });
    const personalMs = personalSessions.reduce((sum, s) => sum + Number(s.durationMs || 0), 0) + (changedPart.baselineWorkMs || 0) + Number(archived._sum.baselineWorkMs || 0);
    const data = { status, sharedProgress: true,
      completedAt: status === 'REALIZADA' ? (task.completedAt || at) : null,
      isReturned: status === 'DEVUELTA',
      ...(next === 'DEVUELTA' ? { returnCount: { increment: 1 }, returnedAt: at } : {}),
      ...(owner ? { ...participantData(changedPart, true), startedAt: next === 'EN_CURSO' ? at : null, accumulatedWorkMs: personalMs } : {}),
    };
    // Los estados personales ya persistidos más el cambio del dueño justifican el agregado.
    const updated = await updateOrderedTask(tx, { where: { id: taskId }, data, include: participationInclude }, task);
    if (status === 'REALIZADA') await closeActiveTaskWorkCycle(tx, { taskId, actorId, at, closeReason: 'COMPLETED' });
    await applyTaskAggregateEffects(tx, task, status, actorId);
    if (task.status === 'DEVUELTA' && status !== 'DEVUELTA') await recordQualityStreakTransition(tx, task, updated);
    await finishTaskRecognition(tx, before, updated, at);
    if (plan) await recordPlanRecognition(tx, plan.id, at, { allowAward: false });
    await tx.operationalTraceEvent.create({ data: { eventType: 'TASK_PARTICIPATION_CHANGED', taskId,
      actorId, subjectUserId: own.member?.userId || null, occurredAt: at,
      metadata: { memberId, fromStatus: own.status, toStatus: next, revision: changedPart.revision, fromGlobalStatus: task.status, toGlobalStatus: status } } });
    const fresh = plan ? await tx.task.findUnique({ where: { id: taskId }, include: participationInclude }) : updated;
    const [snapshot] = await hydrateTaskParticipations(tx, [fresh], user);
    if (plan) {
      snapshot.contentPlanId = plan.id;
      snapshot.plan = { id: plan.id, slug: snapshot.client?.slug, month: plan.month, year: plan.year, status: plan.status };
    }
    snapshot.participationTransition = { memberId, fromStatus: own.status, toStatus: next, changed: true,
      completed: next === 'REALIZADA', globalCompleted: task.status !== 'REALIZADA' && status === 'REALIZADA' };
    if (next === 'REALIZADA' && own.member?.userId === actorId && personalMs < MIN_MEASURED_MS && !personalSessions.some(s => s.closeReason === DECLARED_CLOSE_REASON)) {
      snapshot.needsDeclaredTime = true;
      snapshot.declaredTimeParticipant = { memberId, revision: changedPart.revision, completedAt: at };
    }
    return { snapshot, changed: true, creatorId: task.creatorId };
  });
  const receipt = result.snapshot.participationTransition;
  if (receipt?.globalCompleted) {
    try {
      const followers = await db.taskFollower.findMany({ where: { taskId }, select: { userId: true } });
      for (const follower of followers) if (follower.userId !== actorId) await createNotification({ userId: follower.userId,
        message: `Todos terminaron la tarea: ${result.snapshot.title}`, type: 'TASK_COMPLETED', relatedId: taskId });
      await notifyTeamCompletion({ taskId, completedById: actorId, followerIds: followers.map(f => f.userId) });
    } catch (error) { console.error('[Participaciones] Aviso de cierre:', error.message); }
  }
  if (receipt?.toStatus === 'DEVUELTA' && result.creatorId && result.creatorId !== actorId) {
    const person = result.snapshot.participants.find(p => p.memberId === memberId);
    try { await createNotification({ userId: result.creatorId, type: 'TASK_RETURNED', relatedId: taskId,
      message: `Se devolvió la parte de ${person?.member?.name || 'una persona'} en «${result.snapshot.title}». Revisa el motivo para reintegrarla.` });
    } catch (error) { console.error('[Participaciones] Aviso de devolución:', error.message); }
  }
  if (receipt?.changed && receipt.fromStatus === 'DEVUELTA' && receipt.toStatus !== 'DEVUELTA') {
    const person = result.snapshot.participants.find(p => p.memberId === memberId);
    if (person?.member?.userId && person.member.userId !== actorId) {
      try { await createNotification({ userId: person.member.userId, type: 'TASK_CORRECTED', relatedId: taskId,
        message: `Tu participación en «${result.snapshot.title}» fue reintegrada. Ya puedes retomarla.` });
      } catch (error) { console.error('[Participaciones] Aviso de reintegración:', error.message); }
    }
  }
  return result.snapshot;
}
