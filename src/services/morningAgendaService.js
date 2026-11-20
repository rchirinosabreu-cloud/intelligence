// Lo que la lectura de la mañana dice del día de la persona (Rodny, 20 de noviembre de 2026): sus reuniones de hoy
// en Actividad (las propias y las que llegan de Google Calendar, con la misma regla del tablero personal) y lo
// importante del correo de la agencia que Bria ya leyó. Solo lee lo guardado: no abre buzones ni llama a Google.
// Una fuente que falla se anota y no esconde a la otra.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { agendaSince } from '../lib/morningAgenda.js';
import { getVisibleOperationalEventWhere } from './operationalEventVisibility.js';

const H = 3600000;
const lower = (value) => String(value || '').trim().toLowerCase();

export const createMorningAgendaService = ({ db = prisma, mailbox, expand, meetingsOf, now = () => new Date(), logger = console } = {}) => {
  const mail = async () => mailbox || (await import('./mailboxService.js')).getMailboxService();
  const expandWith = async () => expand || (await import('./operationalEventService.js')).expandOperationalEventOccurrences;
  const shape = async () => meetingsOf || (await import('./personalDashboardService.js')).buildDashboardMeetings;
  return {
    async meetings(user, at = now()) {
      const account = await db.user.findUnique({ where: { id: user.id }, select: { email: true, teamMember: { select: { id: true, email: true } } } });
      const memberId = account?.teamMember?.id || user.teamMember?.id;
      if (!memberId) return [];
      const emails = [...new Set([account?.email, account?.teamMember?.email].filter(Boolean).flatMap((email) => [email, lower(email)]))];
      const dayStart = new Date(`${bogotaDate(at)}T05:00:00.000Z`), dayEnd = new Date(dayStart.getTime() + 24 * H);
      const events = await db.operationalEvent.findMany({
        where: { AND: [
          getVisibleOperationalEventWhere(),
          { OR: [{ memberIds: { has: memberId } }, ...(emails.length ? [{ attendeeEmails: { hasSome: emails } }, { organizerEmail: { in: emails } }] : [])] },
          { startAt: { lt: dayEnd } },
          { OR: [{ endAt: { gte: dayStart } }, { AND: [{ recurrence: { in: ['WEEKLY', 'GOOGLE'] } }, { OR: [{ recurrenceEnd: null }, { recurrenceEnd: { gte: dayStart } }] }] }] }
        ] },
        orderBy: { startAt: 'asc' }
      });
      const occurrences = (await expandWith())(events, dayStart, dayEnd);
      const email = lower(account?.email || account?.teamMember?.email);
      return (await shape())({ events: occurrences, member: { id: memberId, email }, now: dayStart, horizonDays: 1, limit: 40 })
        .filter((item) => new Date(item.startAt) < dayEnd && item.type !== 'ABSENCE' && lower(item.responseStatus) !== 'declined');
    },

    /** { meetings, mail } de hoy para esa persona. `mail` es null si no se pudo leer; las reuniones, lista vacía. */
    async forUser(user, at = now()) {
      const agenda = { meetings: [], mail: null };
      try { agenda.meetings = await this.meetings(user, at); }
      catch (error) { logger.error('[MorningAgenda] Sin las reuniones esta vez:', error?.message || error); }
      try { agenda.mail = await (await mail()).morningDigest({ since: agendaSince(at), at }); }
      catch (error) { logger.error('[MorningAgenda] Sin el correo esta vez:', error?.message || error); }
      return agenda;
    }
  };
};

let instance = null;
export const getMorningAgendaService = () => instance ||= createMorningAgendaService();
