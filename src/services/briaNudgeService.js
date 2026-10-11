// «Bria se adelanta» en el servidor (10 de octubre de 2026): arma lo que la regla pura necesita leyendo tareas y
// relojes de la plataforma. Solo lee. Lo ven administradores y project managers con Bria; nunca se avisa sobre
// quien mira ni sobre otro administrador.

import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { isManagerRole } from '../config/security.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { buildNudges, dismissUntil, isValidNudgeKey, workdayStart } from '../lib/briaNudges.js';
import { weekKeyOf } from '../lib/weeklyReading.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';

const OPEN = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
export const canSeeNudges = (user) => canUseBria(user) && isManagerRole(user?.role);

export const createBriaNudgeService = ({ db = prisma, repository, now = () => new Date() } = {}) => {
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const userIdOf = (user) => user?.userId || user?.id;
  return {
    /** Lee a las personas del equipo como las ve la regla: qué tienen en proceso, cuántos pendientes, última actividad de hoy y lo que vence hoy. */
    async readPeople(at) {
      const today = bogotaDate(at);
      const dayStart = workdayStart(at);
      const since = new Date(Math.min(dayStart.getTime(), new Date(`${today}T05:00:00.000Z`).getTime()));
      const members = await db.teamMember.findMany({
        where: { isActive: true },
        select: { id: true, name: true, userId: true, user: { select: { role: true } }, nativeTasks: { where: { status: { in: OPEN } }, select: { id: true, title: true, status: true, dueDate: true } } }
      });
      const ids = members.map((member) => member.id);
      const [sessions, closed] = await Promise.all([
        db.taskWorkSession.findMany({ where: { workerId: { in: ids }, OR: [{ endedAt: null }, { endedAt: { gte: since } }] }, select: { workerId: true, endedAt: true } }),
        db.task.findMany({ where: { assigneeId: { in: ids }, completedAt: { gte: since } }, select: { assigneeId: true, completedAt: true } })
      ]);
      const lastBy = new Map(), openBy = new Set();
      const bump = (id, when) => { if (!id || !when) return; const t = new Date(when).getTime(); if (!lastBy.has(id) || lastBy.get(id) < t) lastBy.set(id, t); };
      for (const row of sessions) { if (row.endedAt) bump(row.workerId, row.endedAt); else openBy.add(row.workerId); }
      for (const row of closed) bump(row.assigneeId, row.completedAt);
      return members
        .filter((member) => String(member.user?.role || '').toUpperCase() !== 'ADMIN')
        .map((member) => ({
          personId: member.id, personName: member.name, userId: member.userId || null,
          inProgress: [...member.nativeTasks.filter((task) => task.status === 'EN_CURSO').map(({ id, title }) => ({ id, title })), ...(openBy.has(member.id) ? [{ id: 'reloj', title: 'Reloj propio en marcha' }] : [])],
          pendingCount: member.nativeTasks.filter((task) => task.status !== 'EN_CURSO').length,
          lastActivityAt: lastBy.has(member.id) ? new Date(lastBy.get(member.id)) : null,
          dueToday: member.nativeTasks.filter((task) => task.dueDate && bogotaDate(task.dueDate) === today).map(({ id, title, status }) => ({ id, title, status }))
        }));
    },

    async list(user) {
      if (!canSeeNudges(user)) return { nudges: [] };
      const at = now(), userRef = userIdOf(user);
      const [people, dismissed, focus] = await Promise.all([this.readPeople(at), repo.dismissedKeys(userRef, at), repo.focusDelivery(weekKeyOf(at), userRef)]);
      const viewer = people.find((person) => person.userId === userRef) || (await db.teamMember.findFirst({ where: { userId: userRef }, select: { id: true } }).then((row) => row ? { personId: row.id } : null));
      return { nudges: buildNudges({ people, now: at, dismissedKeys: dismissed, viewerPersonId: viewer?.personId || null, weeklyFocus: focus ? { conversationId: focus.conversationId, weekKey: focus.weekKey } : null }) };
    },

    async dismiss(user, key) {
      if (!canSeeNudges(user)) throw knowledgeError('Bria no está activada para tu cuenta.', 403, 'BRIA_DISABLED');
      if (!isValidNudgeKey(key)) throw knowledgeError('Ese aviso no existe.', 400, 'BRIA_NUDGE_KEY');
      const at = now();
      return repo.dismiss(userIdOf(user), key, dismissUntil(key, at));
    }
  };
};

let instance;
export const getBriaNudgeService = () => instance ||= createBriaNudgeService();
