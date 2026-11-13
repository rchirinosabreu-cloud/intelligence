// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026). Lee las minutas que Fireflies ya analizó,
// arma cada compromiso como pendiente con la regla pura de `src/lib/meetingTaskInbox.js`, y escribe solo dos cosas:
// despachar —el `POST /api/tasks` de siempre con la marca `source` del compromiso— le deja al compromiso su
// `taskId`, releyéndolo justo antes de crear para que nunca se cree dos veces; descartar le deja quién, cuándo y por
// qué. Nada se borra. El pendiente en sí lo crea el mismo `createTask` y las mismas puertas que el botón de Gestión.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { rankByName } from '../lib/fuzzyMatch.js';
import { buildMeetingInbox, discardProblem, markCreated, markDiscarded, sourceProblem } from '../lib/meetingTaskInbox.js';

const MINUTE_SELECT = { id: true, title: true, meetingAt: true, status: true, actionItems: true, updatedAt: true };
const INBOX_DAYS = 90;
const fail = (message, status, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const tidy = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const createMeetingTaskInboxService = ({ db = prisma, notify, now = () => new Date(), logger = console } = {}) => {
  const rank = (rows, term) => rankByName(rows, term, (row) => row.name);
  const actorId = (user) => user.userId || user.id;
  const actorName = (user) => user.teamMember?.name || user.name || null;

  const loadTeam = () => db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, userId: true, role: true, avatarUrl: true }, orderBy: { name: 'asc' } });
  const loadClients = () => db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const loadMinute = (minuteId) => db.meetingMinute.findFirst({ where: { id: minuteId, deletedAt: null }, select: MINUTE_SELECT });

  const list = async () => {
    const at = now();
    const since = new Date(at.getTime() - INBOX_DAYS * 86_400_000);
    const [minutes, team, clients] = await Promise.all([
      db.meetingMinute.findMany({ where: { deletedAt: null, status: 'READY', meetingAt: { gte: since } }, select: MINUTE_SELECT, orderBy: { meetingAt: 'desc' }, take: 200 }),
      loadTeam(), loadClients()
    ]);
    const rows = buildMeetingInbox({ minutes, clients, members: team, today: bogotaDate(at), rank });
    return { minutes: rows, team, clients, pending: rows.reduce((sum, row) => sum + row.pending, 0), generatedAt: at.toISOString() };
  };

  // El compromiso al que apunta una marca de origen, releído ahora mismo; se niega con palabras si ya no espera decisión.
  const pendingSlot = async (source) => {
    const problem = sourceProblem(source);
    if (problem) throw fail(problem, 400);
    const minute = await loadMinute(source.minuteId);
    if (!minute) throw fail('Esa reunión ya no está.', 404);
    const n = Number(source.n);
    const slot = Array.isArray(minute.actionItems) ? minute.actionItems[n - 1] : null;
    if (!slot) throw fail('Ese compromiso ya no está en la minuta.', 404);
    if (slot.taskId) throw fail('Ese compromiso ya es un pendiente.', 409, 'MEETING_TASK_ALREADY_CREATED');
    if (slot.discarded) throw fail('Ese compromiso ya se descartó.', 409, 'MEETING_TASK_DISCARDED');
    return { minute, n, slot };
  };

  /**
   * Despachar: `create` es el `createTask` de siempre, ya con las puertas de quien pide. Antes de crear se relee el
   * compromiso (lo que otra persona ya despachó o descartó no se repite) y después el compromiso recuerda su `taskId`.
   * Si enlazar falla, el pendiente ya existe: se dice (`linked: false`) y no se deshace.
   */
  const dispatch = async (user, source, create) => {
    const { minute, n } = await pendingSlot(source);
    const task = await create();
    let linked = true;
    try {
      const fresh = await loadMinute(minute.id);
      await db.meetingMinute.update({ where: { id: minute.id }, data: { actionItems: markCreated(fresh.actionItems, n, task.id) } });
    } catch (failure) {
      linked = false;
      logger.error?.(`[MeetingTaskInbox] El pendiente ${task.id} se creó pero la minuta ${minute.id}#${n} no quedó enlazada:`, failure?.response?.data || failure?.message || failure);
    }
    // Un pendiente prioritario o especial ya lo avisa el creador de siempre; uno normal se avisa aquí, porque la persona no lo pidió en Gestión.
    const assigneeUserId = task.assignee?.userId || null;
    if (notify && linked && assigneeUserId && assigneeUserId !== actorId(user) && !task.isPriority && !task.isSpecial) {
      try { await notify({ userId: assigneeUserId, type: 'TASK_ASSIGNED', relatedId: task.id, message: `Se te asignó un pendiente: ${tidy(task.title)}` }); }
      catch (failure) { logger.error?.('[MeetingTaskInbox] No se pudo avisar al responsable:', failure?.response?.data || failure?.message || failure); }
    }
    logger.info?.(`[MeetingTaskInbox] Despachado ${minute.id}#${n} → ${task.id} por ${actorId(user)}${linked ? '' : ' (sin enlazar)'}`);
    return { task, linked };
  };

  const discard = async (user, body = {}) => {
    const problem = discardProblem(body);
    if (problem) throw fail(problem, 400);
    const minute = await loadMinute(body.minuteId);
    if (!minute) throw fail('Esa reunión ya no está.', 404);
    const n = Number(body.n);
    const slot = Array.isArray(minute.actionItems) ? minute.actionItems[n - 1] : null;
    if (!slot) throw fail('Ese compromiso ya no está en la minuta.', 404);
    if (slot.taskId) throw fail('Ese compromiso ya es un pendiente: si sobra, elimínalo desde Gestión.', 409);
    if (slot.discarded) throw fail('Ese compromiso ya se descartó.', 409);
    const at = now().toISOString();
    await db.meetingMinute.update({ where: { id: minute.id }, data: { actionItems: markDiscarded(minute.actionItems, n, { reason: body.motivo, note: body.nota, by: actorId(user), byName: actorName(user), at }) } });
    logger.info?.(`[MeetingTaskInbox] Descartado ${minute.id}#${n} (${body.motivo}) por ${actorId(user)}`);
    return { inbox: await list(user) };
  };

  return {
    list,
    dispatch,
    discard,
    /** Lo que el punto del menú de Manager necesita: las huellas de lo que espera decisión, sin contenido. */
    async pulse(user) {
      const inbox = await list(user);
      return { keys: inbox.minutes.flatMap((row) => row.items.map((item) => item.key)) };
    }
  };
};

let instance;
export const getMeetingTaskInboxService = async () => {
  if (instance) return instance;
  const { createNotification } = await import('./notificationService.js');
  instance = createMeetingTaskInboxService({ notify: createNotification });
  return instance;
};
