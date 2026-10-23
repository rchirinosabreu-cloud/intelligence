// La revisión de las cuentas al cerrar el mes (Rodny, 23 de octubre de 2026): desde las 8 de la mañana del primer día
// hábil de cada mes (Bogotá), a cada administrador con Bria, un chat nuevo con la rentabilidad del mes que cerró frente
// al anterior y lo que conviene mirar; un aviso en la campana y, si lo vinculó, por WhatsApp. Una vez por mes y persona
// aunque el servidor se reinicie (`monthly_review_deliveries`). Solo administradores, como la rentabilidad: dice
// cuánto deja cada cuenta y cuánto cuesta operar la agencia. Lo escribe la plataforma; no pasa por el modelo.

import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { buildMonthlyReview, firstBusinessDayOf, previousMonthOf } from '../lib/monthlyReview.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { createNotification } from './notificationService.js';
import { listBriaPeople } from './weeklyFocusService.js';
import { alertByWhatsApp } from './whatsappAlertSender.js';
import { dailyAlert } from '../lib/whatsappAlerts.js';
import { clientProfitabilityService } from './clientProfitabilityService.js';
import prisma from '../lib/prisma.js';

export const MONTHLY_REVIEW_NOTIFICATION = 'BRIA_REVISION_MES';
export const MONTHLY_REVIEW_HOUR = 8;
export const MONTHLY_REVIEW_CHECK_MS = 10 * 60 * 1000;
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const monthKeyOf = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

export const createMonthlyReviewService = ({
  db = prisma, profitability = null, conversations, repository, now = () => new Date(), notify = createNotification,
  listPeople = listBriaPeople, logger = console, whatsapp = alertByWhatsApp
} = {}) => {
  const chats = conversations || createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const readProfit = (period) => (profitability || clientProfitabilityService()).read(period);
  const actorOf = (user) => ({ ref: user.id, name: user.name, role: user.role, permissions: user.modulePermissions || {} });

  return {
    /** La rentabilidad del mes que se revisa y la del anterior, leídas una vez para todos. */
    async readMonths(period) {
      const prior = previousMonthOf(`${monthKeyOf(period)}-01`);
      const [current, previous] = await Promise.all([readProfit(period), readProfit(prior).catch((error) => { logger.error('[MonthlyReview] Sin el mes anterior esta vez:', error?.message || error); return null; })]);
      return { current, previous };
    },

    /** Deja la revisión en un chat nuevo del administrador y lo avisa. Devuelve lo entregado o lo que ya existía. */
    async deliver(user, months, monthKey) {
      if (!isAdmin(user)) return { skipped: 'solo administradores' };
      const existing = await repo.monthlyReviewDelivery(monthKey, user.id);
      if (existing) return { ...existing, already: true };
      const { title, text } = buildMonthlyReview({ personName: user.teamMember?.name || user.name, current: months.current, previous: months.previous });
      const chat = await chats.postAssistantNote(actorOf(user), { title, text, metadata: { note: 'REVISION_MES', monthKey } });
      const delivery = await repo.recordMonthlyReviewDelivery(monthKey, user.id, chat.id);
      try { await notify({ userId: user.id, type: MONTHLY_REVIEW_NOTIFICATION, message: `Bria dejó la revisión de las cuentas de ${months.current.period.label} en el chat.`, relatedId: chat.id }); }
      catch (error) { logger.error('[MonthlyReview] No se pudo avisar a una persona:', error?.message || error); }
      whatsapp({ userId: user.id, ...dailyAlert({ note: 'REVISION_MES', dayKey: monthKey, text }) });
      return { ...delivery, already: false };
    },

    /** Desde las 8:00 del primer día hábil del mes: a cada administrador con Bria, una vez por mes. */
    async runAutomatic() {
      const at = now();
      const today = bogotaDate(at);
      if (today < firstBusinessDayOf(today.slice(0, 7)) || (today === firstBusinessDayOf(today.slice(0, 7)) && bogotaClock(at).minutes < MONTHLY_REVIEW_HOUR * 60)) return { skipped: 'fuera de horario' };
      const period = previousMonthOf(today);
      const monthKey = monthKeyOf(period);
      const admins = (await listPeople(db)).filter(isAdmin);
      if (!admins.length) return { monthKey, delivered: 0, already: 0, failed: 0 };
      // Si ya la tienen todos, no se vuelve a calcular la rentabilidad del mes.
      const pending = [];
      for (const user of admins) if (!(await repo.monthlyReviewDelivery(monthKey, user.id))) pending.push(user);
      if (!pending.length) return { monthKey, delivered: 0, already: admins.length, failed: 0 };
      const months = await this.readMonths(period);
      let delivered = 0, already = admins.length - pending.length, failed = 0;
      for (const user of pending) {
        try { const result = await this.deliver(user, months, monthKey); if (result.already) already += 1; else delivered += 1; }
        catch (error) { failed += 1; logger.error('[MonthlyReview] No se pudo dejar la revisión a una persona:', error?.message || error); }
      }
      return { monthKey, delivered, already, failed };
    }
  };
};

let instance;
export const getMonthlyReviewService = () => instance ||= createMonthlyReviewService();

export const initMonthlyReviewScheduler = ({ service = getMonthlyReviewService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[MonthlyReview] La revisión del mes falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 3 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, MONTHLY_REVIEW_CHECK_MS)?.unref?.();
  logger.log('[MonthlyReview] Revisión de cierre de mes programada (primer día hábil, desde las 8:00, Bogotá).');
  return tick;
};
