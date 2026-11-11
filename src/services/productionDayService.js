import prisma from '../lib/prisma.js';
import { isManagerRole } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { createNotification } from './notificationService.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import { evidenceProblem, evidenceReminderDue, productionDayState, suggestedClientIds } from '../lib/productionDays.js';

// Jornadas de producción con evidencia (reunión de Rodny con su jefe, 10 de noviembre de 2026). La jornada nace del
// evento de Producción del calendario de Actividad: ligarla a un cliente es de administradores y project managers; subir
// la evidencia, además, de quien estuvo en la jornada o la agendó. Nada de esto toca el evento ni su copia en Google.

export const PRODUCTION_EVIDENCE_TYPE = 'PRODUCTION_EVIDENCE_MISSING';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const EVENT_SELECT = { id: true, title: true, type: true, startAt: true, memberIds: true, createdById: true, googleCancelled: true, googleSyncStatus: true };
const DAY_SELECT = {
  id: true, eventId: true, clientId: true, date: true, title: true, evidenceUrl: true, evidenceNote: true, evidenceAt: true,
  evidenceByName: true, linkedByName: true, remindedAt: true, reminders: true, client: { select: { id: true, name: true, slug: true } },
};

export const calendarLinkFor = (eventId, date) => `/actividad?vista=calendario&evento=${encodeURIComponent(eventId)}${date ? `&fecha=${date}` : ''}`;

export const publicProductionDay = (day, today) => (day ? {
  id: day.id, eventId: day.eventId ?? null, date: day.date, title: day.title,
  client: day.client ? { id: day.client.id, name: day.client.name, slug: day.client.slug } : null,
  state: productionDayState(day, today),
  evidenceUrl: day.evidenceUrl ?? null, evidenceNote: day.evidenceNote ?? null,
  evidenceAt: day.evidenceAt ? bogotaDate(day.evidenceAt) : null, evidenceBy: day.evidenceByName ?? null,
  linkedBy: day.linkedByName ?? null,
} : null);

export const createProductionDayService = ({ db = prisma, now = () => new Date(), notify = createNotification } = {}) => {
  const today = () => bogotaDate(now());

  const actorOf = async (user) => {
    const userId = user?.userId || user?.id;
    if (!userId) throw httpError(401, 'Usuario no autenticado');
    const [account, member] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, isActive: true } }),
      db.teamMember.findFirst({ where: { userId, isActive: true }, select: { id: true } }),
    ]);
    if (!account || account.isActive === false) throw httpError(403, 'Tu cuenta no está activa.');
    return { userId, name: account.name || null, manager: isManagerRole(account.role), memberId: member?.id || null };
  };

  const productionEvent = async (eventId) => {
    const event = await db.operationalEvent.findUnique({ where: { id: String(eventId) }, select: EVENT_SELECT });
    if (!event || event.googleCancelled || ['DELETED', 'MERGED'].includes(event.googleSyncStatus)) throw httpError(404, 'El evento ya no existe.');
    if (event.type !== 'PRODUCTION') throw httpError(409, 'Solo un evento de Producción es una jornada.', 'NOT_PRODUCTION');
    return event;
  };

  const canEvidence = (actor, event) => actor.manager || event.createdById === actor.userId
    || Boolean(actor.memberId && (event.memberIds || []).includes(actor.memberId));

  /** La jornada de un evento, con los clientes para ligarla (los sugeridos por el título primero). */
  const getByEvent = async (eventId, user) => {
    const actor = await actorOf(user);
    const event = await productionEvent(eventId);
    const day = await db.productionDay.findUnique({ where: { eventId: event.id }, select: DAY_SELECT });
    let clients = [];
    if (actor.manager) {
      const rows = await db.client.findMany({ where: { isArchived: false }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      const suggested = suggestedClientIds(event.title, rows);
      clients = [...suggested.map((id) => rows.find((row) => row.id === id)), ...rows.filter((row) => !suggested.includes(row.id))]
        .map((row) => ({ id: row.id, name: row.name, suggested: suggested.includes(row.id) }));
    }
    return {
      eventId: event.id, date: bogotaDate(event.startAt), title: event.title,
      productionDay: publicProductionDay(day, today()),
      canLink: actor.manager, canEvidence: canEvidence(actor, event), clients,
    };
  };

  /** Liga (o cambia) el cliente de la jornada; `clientId` vacío la desliga si todavía no tiene evidencia. */
  const linkClient = async (eventId, clientId, user) => {
    const actor = await actorOf(user);
    if (!actor.manager) throw httpError(403, 'Ligar una jornada a un cliente es de administradores y project managers.');
    const event = await productionEvent(eventId);
    const existing = await db.productionDay.findUnique({ where: { eventId: event.id }, select: { id: true, evidenceUrl: true } });
    if (!clientId) {
      if (!existing) return getByEvent(eventId, user);
      if (existing.evidenceUrl) throw httpError(409, 'Esta jornada ya tiene evidencia: cámbiala de cliente en lugar de quitarlo.', 'HAS_EVIDENCE');
      await db.productionDay.delete({ where: { id: existing.id } });
      return getByEvent(eventId, user);
    }
    const target = await db.client.findUnique({ where: { id: String(clientId) }, select: { id: true, isArchived: true } });
    if (!target || target.isArchived) throw httpError(404, 'Ese cliente no está en operación.');
    const data = { clientId: target.id, date: bogotaDate(event.startAt), title: event.title, linkedById: actor.userId, linkedByName: actor.name };
    if (existing) await db.productionDay.update({ where: { id: existing.id }, data });
    else await db.productionDay.create({ data: { ...data, eventId: event.id } });
    return getByEvent(eventId, user);
  };

  /** Sube (o corrige) el enlace de las evidencias: es lo que da la jornada por realizada. */
  const setEvidence = async (eventId, { url, note } = {}, user) => {
    const actor = await actorOf(user);
    const event = await productionEvent(eventId);
    if (!canEvidence(actor, event)) throw httpError(403, 'La evidencia la sube quien estuvo en la jornada, quien la agendó o un project manager.');
    const day = await db.productionDay.findUnique({ where: { eventId: event.id }, select: { id: true } });
    if (!day) throw httpError(409, 'Primero hay que ligar esta jornada a un cliente.', 'NOT_LINKED');
    if (bogotaDate(event.startAt) > today()) throw httpError(409, 'La evidencia se sube desde el día de la jornada.', 'NOT_YET');
    const problem = evidenceProblem({ url, note });
    if (problem) throw httpError(400, problem, 'INVALID_EVIDENCE');
    await db.productionDay.update({
      where: { id: day.id },
      data: {
        evidenceUrl: String(url).trim(), evidenceNote: String(note ?? '').trim() || null,
        evidenceAt: now(), evidenceById: actor.userId, evidenceByName: actor.name,
      },
    });
    return getByEvent(eventId, user);
  };

  /**
   * Recuerda subir la evidencia de las jornadas que ya pasaron sin ella: a quien estuvo en la jornada y al
   * project manager del cliente. Al día siguiente y otra vez tres días después; nunca más de dos veces.
   */
  const runReminders = async ({ log = console.error } = {}) => {
    const current = now();
    if (!isWorkingTime(current)) return { sent: 0 };
    const day = today();
    const pending = await db.productionDay.findMany({
      where: { evidenceUrl: null, date: { lt: day }, client: { isArchived: false } },
      select: { ...DAY_SELECT, event: { select: { id: true, memberIds: true } }, client: { select: { id: true, name: true, slug: true, projectManager: { select: { userId: true, isActive: true } } } } },
    });
    let sent = 0;
    for (const row of pending) {
      if (!evidenceReminderDue(row, day)) continue;
      // La fila es la cerradura: solo avisa quien logra contar el recordatorio.
      const claimed = await db.productionDay.updateMany({ where: { id: row.id, reminders: row.reminders, evidenceUrl: null }, data: { reminders: row.reminders + 1, remindedAt: current } });
      if (!claimed.count) continue;
      const memberIds = row.event?.memberIds || [];
      const members = memberIds.length ? await db.teamMember.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { userId: true } }) : [];
      const recipients = new Set(members.map((m) => m.userId).filter(Boolean));
      const pm = row.client?.projectManager;
      if (pm?.userId && pm.isActive !== false) recipients.add(pm.userId);
      const url = row.eventId ? calendarLinkFor(row.eventId, row.date) : `/clientes/operacion/${row.client?.slug || ''}`;
      const [, month, date] = row.date.split('-').map(Number);
      const message = `La jornada de ${row.client?.name || 'un cliente'} del ${date}/${month} no tiene evidencia: sube el enlace del Drive para darla por hecha.`;
      for (const userId of recipients) {
        try { if (await notify({ userId, type: PRODUCTION_EVIDENCE_TYPE, message, url, relatedId: row.clientId, resourceId: row.id })) sent += 1; }
        catch (error) { log('[ProductionDays] No se pudo avisar de la evidencia:', error?.message || error); }
      }
    }
    return { sent };
  };

  return { getByEvent, linkClient, setEvidence, runReminders };
};

export const productionDayService = createProductionDayService();

export function initProductionDayReminderScheduler({ intervalMs = 30 * 60 * 1000, service = productionDayService, log = console.error } = {}) {
  const tick = () => service.runReminders().catch((error) => log('[ProductionDays] Falló el pase de recordatorios:', error?.message || error));
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
