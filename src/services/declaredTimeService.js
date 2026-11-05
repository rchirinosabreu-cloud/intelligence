// Tiempo declarado al cerrar sin cronómetro (Rodny, 9 de octubre de 2026). El 9 de octubre solo el 56 % de lo
// cerrado tenía tiempo medido: la mayoría pasa de Pendiente a Realizada sin pasar por En proceso. En vez de frenar a
// nadie, al cerrar sin reloj la plataforma pregunta «¿cuánto te tomó?» y lo guarda como una sesión `DECLARED`,
// distinta de lo cronometrado, para que Ritmo la lea y diga que es una estimación.
//
// Reglas: solo quien ejecuta la tarea declara su tiempo (no un manager que la cierra por otro); solo una tarea
// realizada que no tiene tiempo medido; una sola vez; entre 1 minuto y 12 horas.

import prisma from '../lib/prisma.js';
import { MIN_MEASURED_MS, MAX_DECLARED_MINUTES, DECLARED_CLOSE_REASON, DECLARED_TIME_OPTIONS } from '../lib/declaredTime.js';
import { hasTaskParticipations, taskParticipations } from '../lib/taskParticipation.js';
import { archivedParticipationWorkMs, taskParticipationSelect } from '../lib/taskParticipationMetrics.js';
import { recognitionTransaction } from './recognitionService.js';

export { MIN_MEASURED_MS, MAX_DECLARED_MINUTES, DECLARED_CLOSE_REASON, DECLARED_TIME_OPTIONS };
const MINUTE = 60_000;

const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const actorOf = (user) => user?.userId || user?.id || null;

const loadState = async (db, taskId, participantMemberId) => {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, completedAt: true, assigneeId: true, accumulatedWorkMs: true,
      assignee: { select: { id: true, userId: true } }, ...taskParticipationSelect }
  });
  if (!task) return { task: null };
  const shared = hasTaskParticipations(task);
  const memberId = participantMemberId || (!shared ? task.assigneeId : null);
  const participant = taskParticipations(task).find(person => person.memberId === memberId);
  if (!participant) return { task, participant: null, shared };
  // La persona, no el rol actual, es dueña de lo que midió. Reasignar no transfiere sesiones.
  const sessions = await db.taskWorkSession.findMany({ where: { taskId, workerId: memberId },
    select: { workerId: true, durationMs: true, closeReason: true } });
  const declared = sessions.some((session) => session.closeReason === DECLARED_CLOSE_REASON);
  const clocked = sessions.filter((session) => session.closeReason !== DECLARED_CLOSE_REASON).reduce((sum, session) => sum + (Number(session.durationMs) || 0), 0);
  return { task, participant, shared, declared, measuredMs: shared
    ? Number(participant.baselineWorkMs || 0) + archivedParticipationWorkMs(task, memberId) + clocked
    : Math.max(Number(task.accumulatedWorkMs) || 0, clocked) };
};

/** ¿Hay que preguntarle a esta persona cuánto le tomó la tarea que acaba de cerrar? */
export const needsDeclaredTime = async ({ db = prisma, user, taskId, participantMemberId }) => {
  const { task, participant, shared, declared, measuredMs } = await loadState(db, taskId, participantMemberId);
  if (!task || !participant || participant.status !== 'REALIZADA' || declared) return false;
  if (shared && (participant.legacy || !participant.completedAt)) return false;
  if (!participant.member?.userId || participant.member.userId !== actorOf(user)) return false;
  return measuredMs < MIN_MEASURED_MS;
};

export const needsDeclaredParticipationTime = needsDeclaredTime;

/** Guarda el tiempo que la persona dice que le tomó, como una sesión declarada que termina al cerrar la tarea. */
export const declareTaskTime = async ({ db = prisma, user, taskId, participantMemberId, expectedRevision, minutes, now = () => new Date() }) => {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 1 || value > MAX_DECLARED_MINUTES) throw failure(400, 'Indica un tiempo entre 1 minuto y 12 horas.');
  return recognitionTransaction(db, async (tx) => {
    const { task, participant, shared, declared, measuredMs } = await loadState(tx, taskId, participantMemberId);
    if (!task) throw failure(404, 'No encontramos esa tarea.');
    if (!participant || !actorOf(user) || participant.member?.userId !== actorOf(user)) throw failure(403, 'Solo quien hizo esta parte puede decir cuánto le tomó.');
    if (shared && (!Number.isInteger(expectedRevision) || expectedRevision !== participant.revision)) throw failure(409, 'Esta parte cambió. Ábrela nuevamente antes de registrar el tiempo.');
    if (participant.status !== 'REALIZADA' || (shared && (participant.legacy || !participant.completedAt))) throw failure(409, 'El tiempo se declara al terminar tu parte.');
    if (declared || measuredMs >= MIN_MEASURED_MS) throw failure(409, 'Esta tarea ya tiene su tiempo registrado.');
    const durationMs = value * MINUTE;
    const endedAt = participant.completedAt ? new Date(participant.completedAt) : now();
    const startedAt = new Date(endedAt.getTime() - durationMs);
    const cycle = await tx.taskWorkCycle.findFirst({ where: { taskId }, orderBy: { sequence: 'desc' }, select: { id: true, sequence: true } })
      || await tx.taskWorkCycle.create({ data: { taskId, sequence: 1, kind: 'INITIAL', openedAt: startedAt, openedById: actorOf(user),
        ...(!shared || task.status === 'REALIZADA' ? { closedAt: endedAt, closedById: actorOf(user), closeReason: 'COMPLETED' } : {}) } });
    await tx.taskWorkSession.create({
      data: { taskId, cycleId: cycle.id, workerId: participant.memberId, isCollaborator: participant.memberId !== task.assigneeId,
        startedById: actorOf(user), endedById: actorOf(user), startedAt, endedAt, durationMs, closeReason: DECLARED_CLOSE_REASON }
    });
    if (participant.memberId === task.assigneeId) {
      await tx.task.update({ where: { id: taskId }, data: { accumulatedWorkMs: shared ? measuredMs + durationMs : durationMs } });
    }
    return { taskId, ...(shared ? { participantMemberId: participant.memberId } : {}), declaredMs: durationMs };
  });
};
