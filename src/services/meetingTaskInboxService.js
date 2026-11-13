// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026). Lee las minutas que Fireflies ya analizó,
// arma cada compromiso como pendiente con la regla pura de `src/lib/meetingTaskInbox.js`, y escribe solo dos cosas:
// aprobar crea el pendiente por el `createTask` de siempre —mismas puertas que el botón de Gestión— y le deja al
// compromiso su `taskId`; descartar le deja quién, cuándo y por qué. Nada se borra y nada se crea dos veces.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { rankByName } from '../lib/fuzzyMatch.js';
import { minuteItems, minuteTaskContext } from '../lib/minuteTasks.js';
import { buildMeetingInbox, approvalProblem, discardProblem, markCreated, markDiscarded } from '../lib/meetingTaskInbox.js';

const MINUTE_SELECT = { id: true, title: true, meetingAt: true, status: true, actionItems: true, updatedAt: true };
const INBOX_DAYS = 90;
const fail = (message, status, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const tidy = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const createMeetingTaskInboxService = ({ db = prisma, createTask, notify, now = () => new Date(), logger = console } = {}) => {
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

  const approve = async (user, body = {}) => {
    if (!createTask) throw fail('Crear pendientes no está disponible aquí.', 403);
    const [team, clients] = await Promise.all([loadTeam(), loadClients()]);
    const problem = approvalProblem(body, { members: team, clients });
    if (problem) throw fail(problem, 400);
    const minute = await loadMinute(body.minuteId);
    if (!minute) throw fail('Esa reunión ya no está.', 404);
    const today = bogotaDate(now());
    const byId = new Map(team.map((member) => [String(member.id), member]));
    const created = [], already = [], failed = [];
    for (const item of body.items) {
      // Se vuelve a leer el compromiso justo antes de crear: lo ya creado o descartado por otra persona no se repite.
      const fresh = await loadMinute(minute.id);
      const slot = Array.isArray(fresh?.actionItems) ? fresh.actionItems[item.n - 1] : null;
      if (!slot) { failed.push({ n: item.n, reason: 'Ese compromiso ya no está en la minuta.' }); continue; }
      if (slot.taskId) { already.push({ n: item.n, taskId: slot.taskId, title: tidy(slot.task) }); continue; }
      if (slot.discarded) { failed.push({ n: item.n, reason: 'Ese compromiso ya se descartó.' }); continue; }
      const original = minuteItems(fresh, today).find((row) => row.n === item.n);
      const context = [minuteTaskContext(fresh, original || { title: tidy(slot.task), owner: tidy(slot.owner) || null }), tidy(item.comment)].filter(Boolean).join('\n\n');
      try {
        const task = await createTask({
          title: tidy(item.title), clientId: item.clientId || null, assigneeId: String(item.assigneeId), creatorId: actorId(user),
          collaboratorIds: Array.isArray(item.collaboratorIds) ? item.collaboratorIds.map(String) : [],
          dueDate: item.dueDay ? `${item.dueDay}T12:00:00.000Z` : null, status: 'PENDIENTE',
          priority: item.priority, isPriority: item.priority !== 'NORMAL', comments: '', initial_comments: [{ content: context }]
        }, { requireActiveClient: true });
        await db.meetingMinute.update({ where: { id: minute.id }, data: { actionItems: markCreated(fresh.actionItems, item.n, task.id) } });
        created.push({ n: item.n, taskId: task.id, title: task.title || tidy(item.title) });
        const assignee = byId.get(String(item.assigneeId));
        if (notify && assignee?.userId && assignee.userId !== actorId(user)) {
          try { await notify({ userId: assignee.userId, type: 'TASK_ASSIGNED', relatedId: task.id, message: `Se te asignó un pendiente: ${tidy(item.title)}` }); }
          catch (failure) { logger.error?.('[MeetingTaskInbox] No se pudo avisar al responsable:', failure?.response?.data || failure?.message || failure); }
        }
      } catch (failure) {
        logger.error?.('[MeetingTaskInbox] No se pudo crear un pendiente de la reunión:', failure?.response?.data || failure?.message || failure);
        failed.push({ n: item.n, reason: failure?.message || 'No se pudo crear.' });
      }
    }
    logger.info?.(`[MeetingTaskInbox] ${created.length} creados, ${already.length} ya estaban, ${failed.length} fallaron en ${minute.id} por ${actorId(user)}`);
    return { created, already, failed, inbox: await list(user) };
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
    approve,
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
  const [{ createTask }, { createNotification }] = await Promise.all([import('./nativeTaskService.js'), import('./notificationService.js')]);
  instance = createMeetingTaskInboxService({ createTask, notify: createNotification });
  return instance;
};
