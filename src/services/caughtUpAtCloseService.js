// La insignia «Al día» al cierre de la jornada (Rodny, 12 de noviembre de 2026: «Dar "Al día" al cierre de la jornada a
// quien terminó el día sin nada vencido»). Cada diez minutos, desde el cierre de la jornada (17:00 de Bogotá desde el 23 de noviembre de 2026; antes, 18:00) de un día hábil y hasta la
// medianoche, mira cómo terminó la jornada cada persona con Gestión y entrega la insignia a quien la ganó. La regla vive
// en `caughtUpAtClose` (`recognitionRules.js`); la clave de la insignia hace que pasar varias veces no la repita.
// No completa días anteriores: un día que se perdió por un reinicio se pierde, nunca se juzga con lo de otro día.
import prisma from '../lib/prisma.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { hasModulePermission } from '../config/security.js';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { hasTaskParticipations, taskParticipations } from '../lib/taskParticipation.js';
import { completedTaskParticipationWhere, taskForMember, taskParticipationSelect } from '../lib/taskParticipationMetrics.js';
import { areaEquityActive } from '../lib/leagueAreaChecks.js';
import { memberHasArea } from '../lib/teamAreas.js';
import { CAUGHT_UP_AWARD_WINDOW_MS, CAUGHT_UP_POLICY, caughtUpAtClose, dayCloseCutoff } from './recognitionRules.js';
import { insertRecognitionAward, recognitionTransaction } from './recognitionService.js';

export const CAUGHT_UP_CHECK_MS = 10 * 60 * 1000;

/**
 * Por persona, sus tareas de ese día vistas desde su propia participación: lo cerrado desde el inicio del día y lo que
 * vencía ese día o antes y seguía abierto o se cerró después de las 18:00. Solo tareas vigentes.
 */
export async function closeViewsFor(tx, { day, memberIds }) {
  const dayStart = new Date(`${day}T05:00:00.000Z`), cutoff = dayCloseCutoff(day);
  const nextUtcDay = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000);
  // «Sin tener que mover fechas» (Rodny, 21 de noviembre de 2026): lo que vencía ese día o antes y se reprogramó durante
  // la jornada sigue contando con la fecha que tenía. Vale la primera fecha del día si se movió varias veces.
  // Excepción (Rodny, 23 de noviembre de 2026: «si quien le mueve las tareas a esta persona … es alguien con rol de
  // admin o project manager, entonces sí aplicaría poder obtener el logro»): la reprogramación que decide un
  // administrador o un project manager sobre la tarea de OTRA persona no le cuenta a esa persona. Mover las propias
  // sigue contando, también para ellos.
  const movesOf = new Map();
  if (areaEquityActive(day) && typeof tx.taskChangeEvent?.findMany === 'function') {
    const moves = await tx.taskChangeEvent.findMany({ where: { kind: 'DUE_DATE', occurredAt: { gte: dayStart, lt: cutoff } }, orderBy: { occurredAt: 'asc' },
      select: { taskId: true, fromValue: true, actor: { select: { role: true, teamMember: { select: { id: true, areas: true, role: true } } } } } });
    for (const move of moves) {
      const from = /^\d{4}-\d{2}-\d{2}/.test(String(move.fromValue || '')) ? String(move.fromValue).slice(0, 10) : null;
      if (!from || from > day) continue;
      const manager = move.actor?.role === 'ADMIN' || memberHasArea(move.actor?.teamMember, 'PROJECT_MANAGEMENT');
      if (!movesOf.has(move.taskId)) movesOf.set(move.taskId, []);
      movesOf.get(move.taskId).push({ from, manager, actorMemberId: move.actor?.teamMember?.id || null });
    }
  }
  const movedFromFor = (taskId, memberId) => (movesOf.get(taskId) || []).find((move) => !(move.manager && move.actorMemberId !== memberId))?.from || null;
  const tasks = await tx.task.findMany({
    where: { AND: [activeTaskSourceWhere, { OR: [
      completedTaskParticipationWhere({ gte: dayStart }),
      { status: { not: 'REALIZADA' }, OR: [{ dueDate: { lt: nextUtcDay } }, { focusDeadlineAt: { lt: cutoff } }] },
      ...(movesOf.size ? [{ id: { in: [...movesOf.keys()] }, status: { not: 'REALIZADA' } }] : [])
    ] }] },
    select: { id: true, title: true, status: true, assigneeId: true, completedAt: true, dueDate: true, focusDeadlineAt: true, ...taskParticipationSelect }
  });
  const viewsOf = new Map(memberIds.map((memberId) => [memberId, []]));
  for (const task of tasks) {
    const participants = hasTaskParticipations(task) ? taskParticipations(task).map((participant) => participant.memberId) : [task.assigneeId];
    for (const memberId of participants) {
      if (!viewsOf.has(memberId)) continue;
      const view = taskForMember(task, memberId);
      const movedFrom = view ? movedFromFor(task.id, memberId) : null;
      if (view) viewsOf.get(memberId).push(movedFrom ? { ...view, movedFrom } : view);
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
  if (now.getTime() >= cutoff.getTime() + CAUGHT_UP_AWARD_WINDOW_MS) return { day, skipped: 'CIERRE_PASADO' };

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
      const id = await insertRecognitionAward(tx, { kind: 'CAUGHT_UP', recipientId: member.user.id, at: now, ruleVersion: 4,
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
  logger.log('[Reconocimientos] «Al día» programado al cierre de la jornada (días hábiles desde las 17:00, Bogotá).');
  return tick;
};
