// El foco de la semana en el servidor (10 de octubre de 2026): los lunes desde las 7 (Bogotá), para cada persona con
// Bria, un chat nuevo con su resumen y un aviso en la campana. Una vez por semana y persona aunque el servidor se
// reinicie (`weekly_focus_deliveries`). Lo escribe la plataforma; no pasa por el modelo.

import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { weekKeyOf } from '../lib/weeklyReading.js';
import { buildWeeklyFocus } from '../lib/weeklyFocus.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { teamLoadService } from './teamLoadService.js';
import { createNotification } from './notificationService.js';

export const WEEKLY_FOCUS_NOTIFICATION = 'BRIA_FOCO_SEMANAL';
export const WEEKLY_FOCUS_CHECK_MS = 30 * 60 * 1000;
const OPEN = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const bogotaClock = (value) => { const d = new Date(new Date(value).getTime() - 5 * 3600000); return { weekday: d.getUTCDay(), hour: d.getUTCHours() }; };

/** A quién se le deja el foco: cuentas activas de administradores y project managers con Bria y ficha activa en Equipo. */
export const listBriaPeople = async (db = prisma) => (await db.user.findMany({
  where: { isActive: true, role: { in: ['ADMIN', 'PROJECT_MANAGER'] }, teamMember: { is: { isActive: true } } },
  select: { id: true, name: true, role: true, modulePermissions: true, teamMember: { select: { id: true, name: true } } }
})).filter((user) => canUseBria(user) && user.teamMember);

export const createWeeklyFocusService = ({
  db = prisma, conversations, repository, load = teamLoadService, now = () => new Date(),
  notify = createNotification, listPeople = listBriaPeople, logger = console
} = {}) => {
  const chats = conversations || createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const actorOf = (user) => ({ ref: user.id, name: user.name, role: user.role, permissions: user.modulePermissions || {} });

  return {
    /** Las tareas abiertas de la persona, como responsable o colaborando, con el día de Bogotá. */
    async readTasks(memberId) {
      const rows = await db.task.findMany({
        where: { status: { in: OPEN }, OR: [{ assigneeId: memberId }, { collaborators: { some: { memberId } } }] },
        select: { id: true, title: true, status: true, dueDate: true, assigneeId: true, client: { select: { name: true } } },
        orderBy: { dueDate: 'asc' }, take: 300
      });
      return rows.map((task) => ({ id: task.id, title: task.title, status: task.status, dueDay: task.dueDate ? bogotaDate(task.dueDate) : null, clientName: task.client?.name || null, role: task.assigneeId === memberId ? 'responsable' : 'colabora' }));
    },

    async composeFor(user, { signals = [] } = {}) {
      const tasks = await this.readTasks(user.teamMember.id);
      return buildWeeklyFocus({ personName: user.teamMember.name || user.name, today: bogotaDate(now()), tasks, teamSignals: signals });
    },

    /** Deja el foco en un chat nuevo de la persona y la avisa. Devuelve lo entregado o lo que ya existía. */
    async deliver(user, { signals = [], weekKey = weekKeyOf(now()) } = {}) {
      const existing = await repo.focusDelivery(weekKey, user.id);
      if (existing) return { ...existing, already: true };
      const { title, text } = await this.composeFor(user, { signals });
      const chat = await chats.postAssistantNote(actorOf(user), { title, text, metadata: { note: 'FOCO_SEMANAL', weekKey } });
      const delivery = await repo.recordFocusDelivery(weekKey, user.id, chat.id);
      try { await notify({ userId: user.id, type: WEEKLY_FOCUS_NOTIFICATION, message: 'Bria dejó tu foco de la semana en el chat.', relatedId: chat.id }); }
      catch (error) { logger.error('[WeeklyFocus] No se pudo avisar a una persona:', error?.message || error); }
      return { ...delivery, already: false };
    },

    /** Los lunes desde las 7 (Bogotá): a cada persona con Bria, una sola vez por semana. */
    async runAutomatic() {
      const { weekday, hour } = bogotaClock(now());
      if (weekday !== 1 || hour < 7) return { skipped: 'fuera de horario' };
      const weekKey = weekKeyOf(now());
      const people = await listPeople(db);
      let signals = [];
      try { signals = (await load.get()).signals || []; } catch (error) { logger.error('[WeeklyFocus] Sin mapa de carga esta vez:', error?.message || error); }
      let delivered = 0, already = 0, failed = 0;
      for (const user of people) {
        try { const result = await this.deliver(user, { signals, weekKey }); if (result.already) already += 1; else delivered += 1; }
        catch (error) { failed += 1; logger.error('[WeeklyFocus] No se pudo dejar el foco a una persona:', error?.message || error); }
      }
      return { weekKey, delivered, already, failed };
    }
  };
};

let instance;
export const getWeeklyFocusService = () => instance ||= createWeeklyFocusService();

export const initWeeklyFocusScheduler = ({ service = getWeeklyFocusService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[WeeklyFocus] El foco de la semana falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 2 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, WEEKLY_FOCUS_CHECK_MS)?.unref?.();
  logger.log('[WeeklyFocus] Foco de la semana programado (lunes 7:00, Bogotá).');
  return tick;
};
