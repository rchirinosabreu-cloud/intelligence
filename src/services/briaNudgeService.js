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
import { getVaultService } from './vaultService.js';

const OPEN = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
export const PULSE_LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const canSeeNudges = (user) => canUseBria(user) && isManagerRole(user?.role);

export const createBriaNudgeService = ({ db = prisma, repository, now = () => new Date(), vault = null, logger = console } = {}) => {
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const userIdOf = (user) => user?.userId || user?.id;
  // Con un repositorio inyectado (pruebas y muestras) la bóveda real nunca se toca: solo la que se inyecte.
  const vaultOf = () => vault || (repository ? null : getVaultService());
  // Pedidos de acceso de la bóveda (15 de octubre de 2026): esperan una decisión, así que van primero. Si la bóveda
  // no responde, los demás avisos siguen saliendo; y quien no usa la bóveda no tiene nada que ver aquí.
  const accessNudges = async (user, dismissed) => {
    if (!vaultOf()) return [];
    try { return (await vaultOf().accessNudges(user)).filter((nudge) => !dismissed.has(nudge.key)); }
    catch (failure) { if (!failure?.status || failure.status >= 500) logger.error('[BriaNudges] No se pudieron leer los pedidos de acceso:', failure?.message || failure); return []; }
  };
  return {
    /** Lee a las personas del equipo como las ve la regla: qué tienen en proceso, cuántos pendientes, última actividad de hoy y lo que vence hoy. */
    async readPeople(at) {
      const today = bogotaDate(at);
      const dayStart = workdayStart(at);
      const since = new Date(Math.min(dayStart.getTime(), new Date(`${today}T05:00:00.000Z`).getTime()));
      const members = await db.teamMember.findMany({
        where: { isActive: true },
        select: { id: true, name: true, userId: true, user: { select: { role: true } }, nativeTasks: { where: { status: { in: OPEN } }, select: { id: true, title: true, status: true, dueDate: true, startedAt: true } } }
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
          // `since` es la hora en que arrancó lo que está en proceso: el seguimiento la dice («arrancó a las 10:40»).
          inProgress: [...member.nativeTasks.filter((task) => task.status === 'EN_CURSO').map(({ id, title, startedAt }) => ({ id, title, ...(startedAt ? { since: startedAt } : {}) })), ...(openBy.has(member.id) ? [{ id: 'reloj', title: 'Reloj propio en marcha' }] : [])],
          pendingCount: member.nativeTasks.filter((task) => task.status !== 'EN_CURSO').length,
          lastActivityAt: lastBy.has(member.id) ? new Date(lastBy.get(member.id)) : null,
          dueToday: member.nativeTasks.filter((task) => task.dueDate && bogotaDate(task.dueDate) === today).map(({ id, title, status }) => ({ id, title, status }))
        }));
    },

    /**
     * Lo que ve la persona encima de la mascota. Con el pulso vivo (corrió en las últimas dos horas), manda lo que
     * Bria decidió (`pulse_messages`); si el pulso no ha corrido —recién desplegado, proveedor caído—, las reglas de
     * siempre, para que la tarjeta nunca dependa de una sola pieza. El foco de la semana va primero en los dos casos.
     */
    async list(user) {
      if (!canSeeNudges(user)) return { nudges: [] };
      const at = now(), userRef = userIdOf(user);
      const [dismissed, focus, close, pulseLive] = await Promise.all([
        repo.dismissedKeys(userRef, at), repo.focusDelivery(weekKeyOf(at), userRef),
        // El cierre del día (14 de octubre de 2026): si Bria ya lo dejó hoy, va primero en la tarjeta.
        typeof repo.dailyCloseDelivery === 'function' ? repo.dailyCloseDelivery(bogotaDate(at), userRef).catch(() => null) : null,
        typeof repo.hasRecentRun === 'function' ? repo.hasRecentRun(at, PULSE_LIVE_WINDOW_MS).catch(() => false) : false
      ]);
      const weeklyFocus = focus ? { conversationId: focus.conversationId, weekKey: focus.weekKey } : null;
      const dailyClose = close ? { conversationId: close.conversationId, dayKey: close.dayKey } : null;
      const access = await accessNudges(user, dismissed);
      if (pulseLive) {
        const messages = await repo.activeMessages(userRef, at);
        const fixed = buildNudges({ people: [], now: at, dismissedKeys: dismissed, weeklyFocus, dailyClose });
        // `resolution` y `followUp` son el seguimiento: el desenlace del aviso o «sigue igual», escritos por el pulso.
        return { nudges: [...access, ...fixed, ...messages.map((row) => ({ key: `PULSO:${row.id}`, kind: row.kinds?.[0] || 'PULSO', kinds: row.kinds, title: row.title, body: row.body, url: row.url, taskIds: row.taskIds || [], urgency: row.urgency, actions: row.actions || [], createdAt: row.createdAt, resolution: row.resolution || null, followUp: row.followUp || null }))], source: 'pulso' };
      }
      const people = await this.readPeople(at);
      const viewer = people.find((person) => person.userId === userRef) || (await db.teamMember.findFirst({ where: { userId: userRef }, select: { id: true } }).then((row) => row ? { personId: row.id } : null));
      return { nudges: [...access, ...buildNudges({ people, now: at, dismissedKeys: dismissed, viewerPersonId: viewer?.personId || null, weeklyFocus, dailyClose })], source: 'reglas' };
    },

    async dismiss(user, key) {
      if (!canSeeNudges(user)) throw knowledgeError('Bria no está activada para tu cuenta.', 403, 'BRIA_DISABLED');
      if (!isValidNudgeKey(key)) throw knowledgeError('Ese aviso no existe.', 400, 'BRIA_NUDGE_KEY');
      const at = now();
      // La respuesta a un pedido de acceso se da por vista; un pedido por decidir, en cambio, se oculta solo por hoy.
      if (String(key).startsWith('ACCESO:') && vaultOf() && await vaultOf().dismissAnswer(user, key.slice('ACCESO:'.length)).catch(() => false)) return { key, untilAt: null };
      if (String(key).startsWith('PULSO:')) {
        if (!await repo.dismissMessage(userIdOf(user), key.slice('PULSO:'.length), at)) throw knowledgeError('Ese aviso ya no está.', 404, 'BRIA_NUDGE_KEY');
        return { key, untilAt: null };
      }
      return repo.dismiss(userIdOf(user), key, dismissUntil(key, at));
    }
  };
};

let instance;
export const getBriaNudgeService = () => instance ||= createBriaNudgeService();
