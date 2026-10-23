// Corregir el tiempo de una sesión de trabajo (23 de octubre de 2026). Sesión, total de la tarea y novedad se escriben
// en una sola transacción: o queda todo, o nada. La regla vive en `src/lib/taskWorkCorrection.js`.

import prisma from '../lib/prisma.js';
import { recognitionTransaction } from './recognitionService.js';
import { correctionProblem, correctionPlan, formatTimeCorrectionContent, timeCorrectionPresentation, TIME_CORRECTION_EVENT_TYPE } from '../lib/taskWorkCorrection.js';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

export const createTaskWorkCorrectionService = ({ db = prisma, transaction = (work) => recognitionTransaction(db, work), now = () => new Date() } = {}) => ({
  async correct({ user, taskId, sessionId, durationMinutes, reason }) {
    if (String(user?.role || '').toUpperCase() !== 'ADMIN') throw httpError(403, 'Corregir el tiempo de una tarea es de administradores.', 'TIME_CORRECTION_FORBIDDEN');
    const durationMs = Math.round(Number(durationMinutes) * 60_000);
    const at = now();
    return transaction(async (tx) => {
      const session = await tx.taskWorkSession.findFirst({ where: { id: sessionId, taskId } });
      if (!session) throw httpError(404, 'Esa sesión ya no existe en esta tarea.', 'TIME_CORRECTION_NOT_FOUND');
      const task = await tx.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, status: true, startedAt: true, accumulatedWorkMs: true, _count: { select: { collaborators: true } } } });
      if (!task) throw httpError(404, 'La tarea ya no existe.', 'TASK_NOT_FOUND');
      const problem = correctionProblem({ user, session, durationMs, reason, now: at });
      if (problem) throw httpError(400, problem, 'TIME_CORRECTION_INVALID');
      const actorId = user.userId || user.id;
      const plan = correctionPlan({ task, session, durationMs, reason, actorId, now: at });
      await tx.taskWorkSession.update({ where: { id: session.id }, data: plan.session });
      if (plan.task) await tx.task.update({ where: { id: task.id }, data: plan.task });
      const content = formatTimeCorrectionContent({ fromMs: plan.fromMs, toMs: plan.toMs, reason, wasRunning: plan.wasRunning });
      await tx.taskComment.create({ data: { taskId: task.id, authorId: actorId, type: TIME_CORRECTION_EVENT_TYPE, content } });
      const { badgeLabel } = timeCorrectionPresentation(content);
      return {
        message: `Tiempo corregido en «${task.title}»: ${badgeLabel.charAt(0).toLowerCase()}${badgeLabel.slice(1)}${plan.task?.status === 'PENDIENTE' ? '. La tarea volvió a Pendiente' : ''}.`,
        label: `Tiempo corregido: ${badgeLabel.charAt(0).toLowerCase()}${badgeLabel.slice(1)}`,
        sessionId: session.id, durationMs, originalDurationMs: plan.session.originalDurationMs,
        task: { status: plan.task?.status || task.status, startedAt: plan.task && 'startedAt' in plan.task ? plan.task.startedAt : task.startedAt, accumulatedWorkMs: plan.task?.accumulatedWorkMs ?? task.accumulatedWorkMs }
      };
    });
  }
});

let instance;
export const taskWorkCorrectionService = () => instance ||= createTaskWorkCorrectionService();
