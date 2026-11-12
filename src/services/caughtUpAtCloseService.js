// La insignia «Al día» al cierre de la jornada (Rodny, 12 de noviembre de 2026: «Dar "Al día" al cierre de la jornada a
// quien terminó el día sin nada vencido»). Cada diez minutos, desde las 18:00 de Bogotá de un día hábil y hasta la
// medianoche, mira cómo terminó la jornada cada persona con Gestión y entrega la insignia a quien la ganó. La regla vive
// en `caughtUpAtClose` (`recognitionRules.js`); la clave de la insignia hace que pasar varias veces no la repita.
// No completa días anteriores: un día que se perdió por un reinicio se pierde, nunca se juzga con lo de otro día.
import prisma from '../lib/prisma.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { hasModulePermission } from '../config/security.js';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { hasTaskParticipations, taskParticipations } from '../lib/taskParticipation.js';
import { completedTaskParticipationWhere, taskForMember, taskParticipationSelect } from '../lib/taskParticipationMetrics.js';
import { CAUGHT_UP_POLICY, caughtUpAtClose, dayCloseCutoff } from './recognitionRules.js';
import { insertRecognitionAward, recognitionTransaction } from './recognitionService.js';

export const CAUGHT_UP_CHECK_MS = 10 * 60 * 1000;

/**
 * Por persona, sus tareas de ese día vistas desde su propia participación: lo cerrado desde el inicio del día y lo que
 * vencía ese día o antes y seguía abierto o se cerró después de las 18:00. Solo tareas vigentes.
 */
export async function closeViewsFor(tx, { day, memberIds }) {
  const dayStart = new Date(`${day}T05:00:00.000Z`), cutoff = dayCloseCutoff(day);
  const nextUtcDay = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000);
  const tasks = await tx.task.findMany({
    where: { AND: [activeTaskSourceWhere, { OR: [
      completedTaskParticipationWhere({ gte: dayStart }),
      { status: { not: 'REALIZADA' }, OR: [{ dueDate: { lt: nextUtcDay } }, { focusDeadlineAt: { lt: cutoff } }] }
    ] }] },
    select: { id: true, title: true, status: true, assigneeId: true, completedAt: true, dueDate: true, focusDeadlineAt: true, ...taskParticipationSelect }
  });
  const viewsOf = new Map(memberIds.map((memberId) => [memberId, []]));
  for (const task of tasks) {
    const participants = hasTaskParticipations(task) ? taskParticipations(task).map((participant) => participant.memberId) : [task.assigneeId];
    for (const memberId of participants) {
      if (!viewsOf.has(memberId)) continue;
      const view = taskForMember(task, memberId);
      if (view) viewsOf.get(memberId).push(view);
    }
  }
  return viewsOf;
}

/** Una pasada: entrega «Al día» a quien terminó la jornada de hoy sin nada vencido. Devuelve cuántas se entregaron. */
export async function awardCaughtUpAtClose(db = prisma, { now = new Date() } = {}) {
  const day = bogotaDate(now);
  if (!isBusinessDay(day)) return { day, skipped: 'DIA_NO_HABIL' };
  const cutoff = dayCloseCutoff(day);
  if (now < cutoff) return { day, skipped: 'ANTES_DEL_CIERRE' };

  return recognitionTransaction(db, async (tx) => {
    const members = (await tx.teamMember.findMany({
      where: { isActive: true, user: { is: { isActive: true } } },
      select: { id: true, name: true, user: { select: { id: true, role: true, isActive: true, modulePermissions: true } } }
    })).filter((member) => member.user?.id && hasModulePermission(member.user, 'gestion'));
    const viewsOf = await closeViewsFor(tx, { day, memberIds: members.map((member) => member.id) });
    let granted = 0;
    for (const member of members) {
      const result = caughtUpAtClose({ day, views: viewsOf.get(member.id) });
      if (!result.eligible) continue;
      const id = await insertRecognitionAward(tx, { kind: 'CAUGHT_UP', recipientId: member.user.id, at: now, ruleVersion: 2,
        evidence: { policy: CAUGHT_UP_POLICY, closedToday: result.closed, cutoff: cutoff.toISOString() } });
      if (id) granted += 1;
    }
    return { day, granted };
  });
}

export const initCaughtUpScheduler = ({ db = prisma, setIntervalFn = setInterval, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await awardCaughtUpAtClose(db);
      if (result.granted) logger.log(`[Reconocimientos] «Al día» del ${result.day}: ${result.granted} entregadas.`);
    } catch (error) { logger.error('[Reconocimientos] No se pudo entregar «Al día»:', error?.message || error); }
    finally { running = false; }
  };
  setIntervalFn(tick, CAUGHT_UP_CHECK_MS)?.unref?.();
  logger.log('[Reconocimientos] «Al día» programado al cierre de la jornada (días hábiles desde las 18:00, Bogotá).');
  return tick;
};
