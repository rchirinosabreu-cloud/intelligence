// El cierre del día en el servidor (Rodny, 14 de octubre de 2026): a las 5 de la tarde de cada día hábil (Bogotá),
// para cada persona con Bria, un chat nuevo con su cierre y un aviso en la campana. Una vez por día y persona aunque
// el servidor se reinicie (`daily_close_deliveries`). Lo escribe la plataforma; no pasa por el modelo. Cuenta además
// cómo terminaron los avisos del pulso de ese día (`pulse_messages`: desenlace, recordatorio u ocultado).

import prisma from '../lib/prisma.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { buildDailyClose, nextWorkday } from '../lib/dailyClose.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { createNotification } from './notificationService.js';
import { listBriaPeople } from './weeklyFocusService.js';
import { alertByWhatsApp } from './whatsappAlertSender.js';
import { dailyAlert } from '../lib/whatsappAlerts.js';

export const DAILY_CLOSE_NOTIFICATION = 'BRIA_CIERRE_DEL_DIA';
export const DAILY_CLOSE_HOUR = 17;
export const DAILY_CLOSE_CHECK_MS = 10 * 60 * 1000;
const OPEN = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const TASK_SELECT = { id: true, title: true, status: true, dueDate: true, assigneeId: true, completedAt: true, client: { select: { name: true } }, collaborators: { select: { memberId: true } } };

export const createDailyCloseService = ({
  db = prisma, conversations, repository, now = () => new Date(), notify = createNotification, listPeople = listBriaPeople, logger = console,
  whatsapp = alertByWhatsApp
} = {}) => {
  const chats = conversations || createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const actorOf = (user) => ({ ref: user.id, name: user.name, role: user.role, permissions: user.modulePermissions || {} });

  return {
    /** Lo que hace falta para todos los cierres de hoy, leído una sola vez: el equipo, lo cerrado hoy y lo abierto. */
    async readDay(at = now()) {
      const today = bogotaDate(at), nextDay = nextWorkday(today);
      const dayStart = new Date(`${today}T05:00:00.000Z`);
      const [members, closed, open] = await Promise.all([
        db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, user: { select: { role: true } } } }),
        db.task.findMany({ where: { status: 'REALIZADA', completedAt: { gte: dayStart } }, select: TASK_SELECT, orderBy: { completedAt: 'asc' }, take: 500 }),
        db.task.findMany({ where: { status: { in: OPEN } }, select: TASK_SELECT, orderBy: { dueDate: 'asc' }, take: 3000 })
      ]);
      return { today, nextDay, dayStart, members, closed, open };
    },

    composeFor(user, day, notices = []) {
      const memberId = user.teamMember.id;
      const dayOf = (task) => (task.dueDate ? bogotaDate(task.dueDate) : null);
      const mineOf = (task) => task.assigneeId === memberId || (task.collaborators || []).some((row) => row.memberId === memberId);
      const shape = (task) => ({ id: task.id, title: task.title, clientName: task.client?.name || null, role: task.assigneeId === memberId ? 'responsable' : 'colabora' });
      const openNotStarted = day.open.filter((task) => task.status !== 'EN_CURSO');
      const mine = {
        closed: day.closed.filter(mineOf).map(shape),
        inProgress: day.open.filter((task) => task.status === 'EN_CURSO' && mineOf(task)).map(shape),
        dueNext: openNotStarted.filter((task) => dayOf(task) === day.nextDay && mineOf(task)).map(shape),
        overdue: openNotStarted.filter((task) => { const due = dayOf(task); return due && due < day.today && mineOf(task); }).map(shape)
      };
      // El equipo son las personas activas de Equipo que no administran; quien dirige también cuenta en él.
      const squad = day.members.filter((member) => String(member.user?.role || '').toUpperCase() !== 'ADMIN');
      const nameOf = new Map(squad.map((member) => [member.id, member.name]));
      const counts = new Map();
      for (const task of day.closed) if (nameOf.has(task.assigneeId)) counts.set(task.assigneeId, (counts.get(task.assigneeId) || 0) + 1);
      const groups = new Map();
      for (const task of openNotStarted) if (nameOf.has(task.assigneeId) && dayOf(task) === day.nextDay) groups.set(task.assigneeId, [...(groups.get(task.assigneeId) || []), { id: task.id, title: task.title }]);
      const team = {
        closedCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
        closedBy: [...counts].map(([id, count]) => ({ personName: nameOf.get(id), count })),
        inProgressCount: day.open.filter((task) => task.status === 'EN_CURSO' && nameOf.has(task.assigneeId)).length,
        dueNext: [...groups].map(([id, tasks]) => ({ personName: nameOf.get(id), tasks })).sort((a, b) => b.tasks.length - a.tasks.length || a.personName.localeCompare(b.personName, 'es')),
        overdueCount: openNotStarted.filter((task) => { const due = dayOf(task); return due && due < day.today && nameOf.has(task.assigneeId); }).length
      };
      return buildDailyClose({ personName: user.teamMember.name || user.name, today: day.today, nextDay: day.nextDay, mine, team, notices });
    },

    /** Deja el cierre en un chat nuevo de la persona y la avisa. Devuelve lo entregado o lo que ya existía. */
    async deliver(user, day, { dayKey = day.today } = {}) {
      const existing = await repo.dailyCloseDelivery(dayKey, user.id);
      if (existing) return { ...existing, already: true };
      let notices = [];
      if (typeof repo.messagesOfDay === 'function') {
        try { notices = await repo.messagesOfDay(user.id, day.dayStart); }
        catch (error) { logger.error('[DailyClose] Sin los avisos del día esta vez:', error?.message || error); }
      }
      const { title, text } = this.composeFor(user, day, notices);
      const chat = await chats.postAssistantNote(actorOf(user), { title, text, metadata: { note: 'CIERRE_DIA', dayKey } });
      const delivery = await repo.recordDailyCloseDelivery(dayKey, user.id, chat.id);
      try { await notify({ userId: user.id, type: DAILY_CLOSE_NOTIFICATION, message: 'Bria dejó tu cierre del día en el chat.', relatedId: chat.id }); }
      catch (error) { logger.error('[DailyClose] No se pudo avisar a una persona:', error?.message || error); }
      // El mismo cierre por WhatsApp, a quien vinculó su número y no lo apagó (22 de octubre de 2026).
      whatsapp({ userId: user.id, ...dailyAlert({ note: 'CIERRE_DIA', dayKey, text }) });
      return { ...delivery, already: false };
    },

    /** Desde las 17:00 de Bogotá en días hábiles: a cada persona con Bria, una sola vez por día. */
    async runAutomatic() {
      const at = now();
      const today = bogotaDate(at);
      if (!isBusinessDay(today) || bogotaClock(at).minutes < DAILY_CLOSE_HOUR * 60) return { skipped: 'fuera de horario' };
      const people = await listPeople(db);
      const day = await this.readDay(at);
      let delivered = 0, already = 0, failed = 0;
      for (const user of people) {
        try { const result = await this.deliver(user, day, { dayKey: today }); if (result.already) already += 1; else delivered += 1; }
        catch (error) { failed += 1; logger.error('[DailyClose] No se pudo dejar el cierre a una persona:', error?.message || error); }
      }
      return { dayKey: today, delivered, already, failed };
    }
  };
};

let instance;
export const getDailyCloseService = () => instance ||= createDailyCloseService();

export const initDailyCloseScheduler = ({ service = getDailyCloseService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[DailyClose] El cierre del día falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 2 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, DAILY_CLOSE_CHECK_MS)?.unref?.();
  logger.log('[DailyClose] Cierre del día programado (días hábiles desde las 17:00, Bogotá).');
  return tick;
};
