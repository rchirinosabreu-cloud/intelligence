import prisma from '../lib/prisma.js';
import { isManagerRole } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { isAgencyClient } from '../lib/clientProfitability.js';
import { taskParticipations } from '../lib/taskParticipation.js';
import { createNotification } from './notificationService.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
  evidenceProblem, evidenceReminderDue, hasProductionEvidence, jornadaClockAction, productionDayState, suggestedClientIds,
} from '../lib/productionDays.js';

// Jornadas de producción (reunión de Rodny con su jefe, 10 de noviembre de 2026). La jornada nace del evento de
// Producción del calendario de Actividad y, desde el 11 de noviembre, crea su pendiente en Gestión: pasa a «En proceso»
// durante las horas del evento y se cierra con su entrega (archivos o el enlace de Drive con las evidencias). Ligarla a
// un cliente es de administradores y project managers. Nada de esto toca el evento ni su copia en Google.

export const PRODUCTION_EVIDENCE_TYPE = 'PRODUCTION_EVIDENCE_MISSING';
// Solo las jornadas agendadas desde este día crean pendiente: las 54 anteriores no se llenan de tarjetas viejas.
export const JORNADA_TASKS_SINCE = new Date('2026-11-11T05:00:00.000Z');

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const EVENT_SELECT = {
  id: true, title: true, type: true, startAt: true, endAt: true, isAllDay: true, recurrence: true, memberIds: true,
  createdById: true, createdAt: true, googleCancelled: true, googleSyncStatus: true,
};
const TASK_SELECT = { id: true, title: true, status: true, dueDate: true, clientId: true, _count: { select: { deliverables: true } } };
const DAY_SELECT = {
  id: true, eventId: true, taskId: true, clientId: true, date: true, title: true, evidenceUrl: true, evidenceNote: true, evidenceAt: true,
  evidenceByName: true, linkedByName: true, remindedAt: true, reminders: true, autoStartedAt: true, autoEndedAt: true,
  client: { select: { id: true, name: true, slug: true } }, task: { select: TASK_SELECT },
};
const DEAD_SYNC = ['DELETED', 'MERGED', 'PENDING_DELETE'];
const isLiveEvent = (event) => Boolean(event && !event.googleCancelled && !DEAD_SYNC.includes(event.googleSyncStatus));

export const calendarLinkFor = (eventId, date) => `/actividad?vista=calendario&evento=${encodeURIComponent(eventId)}${date ? `&fecha=${date}` : ''}`;
const withFiles = (day) => (day ? { ...day, hasDeliverables: (day.task?._count?.deliverables || 0) > 0 } : day);

export const publicProductionDay = (day, today) => (day ? {
  id: day.id, eventId: day.eventId ?? null, taskId: day.taskId ?? null, date: day.date, title: day.title,
  client: day.client ? { id: day.client.id, name: day.client.name, slug: day.client.slug } : null,
  state: productionDayState(withFiles(day), today),
  evidenceUrl: day.evidenceUrl ?? null, evidenceNote: day.evidenceNote ?? null,
  evidenceAt: day.evidenceAt ? bogotaDate(day.evidenceAt) : null, evidenceBy: day.evidenceByName ?? null,
  deliverables: day.task?._count?.deliverables || 0,
  linkedBy: day.linkedByName ?? null,
} : null);

const clock = (value) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(value));

const defaultTasks = async () => {
  const [native, participation] = await Promise.all([import('./nativeTaskService.js'), import('./taskParticipationService.js')]);
  const store = await import('./taskParticipationStore.js');
  return {
    createTask: native.createTask, updateTask: native.updateTask, deleteTask: native.auditAndDeleteTask,
    changeParticipation: participation.changeTaskParticipation, participationInclude: store.participationInclude,
  };
};

export const createProductionDayService = ({ db = prisma, now = () => new Date(), notify = createNotification, tasks = null, log = console.error } = {}) => {
  const today = () => bogotaDate(now());
  const creating = new Set();
  let taskApi = tasks;
  const taskOps = async () => { if (!taskApi) taskApi = await defaultTasks(); return taskApi; };

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
    if (!isLiveEvent(event)) throw httpError(404, 'El evento ya no existe.');
    if (event.type !== 'PRODUCTION') throw httpError(409, 'Solo un evento de Producción es una jornada.', 'NOT_PRODUCTION');
    return event;
  };

  const canEvidence = (actor, event, task) => actor.manager || event?.createdById === actor.userId
    || Boolean(actor.memberId && (event?.memberIds || []).includes(actor.memberId))
    || Boolean(actor.memberId && task && (task.assigneeId === actor.memberId || (task.collaborators || []).some((row) => row.memberId === actor.memberId)));

  const agencyClientId = async () => {
    const rows = await db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true } });
    return rows.find(isAgencyClient)?.id || null;
  };

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

  /** La jornada de un pendiente de Gestión, para el panel de la tarea. Sin jornada responde `null`. */
  const getByTask = async (taskId, user) => {
    const actor = await actorOf(user);
    const day = await db.productionDay.findUnique({ where: { taskId: String(taskId) }, select: { ...DAY_SELECT, event: { select: EVENT_SELECT } } });
    if (!day) return { productionDay: null };
    const task = await db.task.findUnique({ where: { id: String(taskId) }, select: { assigneeId: true, collaborators: { select: { memberId: true } } } });
    const event = day.event;
    return {
      eventId: day.eventId ?? null, date: day.date, title: day.title,
      schedule: event?.startAt && event?.endAt && !event.isAllDay ? `${clock(event.startAt)} a ${clock(event.endAt)}` : null,
      productionDay: publicProductionDay(day, today()),
      canEvidence: canEvidence(actor, event, task),
    };
  };

  /** Los clientes en operación, para el desplegable del formulario del evento. Solo quien puede ligar. */
  const listClients = async (user) => {
    const actor = await actorOf(user);
    if (!actor.manager) return [];
    return db.client.findMany({ where: { isArchived: false }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  };

  /** Mueve el pendiente al cliente de la jornada mientras no esté cerrado. Nunca tumba lo que lo pidió. */
  const moveTaskClient = async (day, clientId) => {
    if (!day?.task || day.task.status === 'REALIZADA' || !clientId || day.task.clientId === clientId) return;
    try { await (await taskOps()).updateTask(day.task.id, { clientId }, null); }
    catch (error) { log('[ProductionDays] No se pudo mover el pendiente de cliente:', error?.message || error); }
  };

  /** Liga (o cambia) el cliente de la jornada; vacío la desliga y su pendiente pasa a la ficha de la agencia. */
  const linkClient = async (eventId, clientId, user) => {
    const actor = await actorOf(user);
    if (!actor.manager) throw httpError(403, 'Ligar una jornada a un cliente es de administradores y project managers.');
    const event = await productionEvent(eventId);
    const existing = await db.productionDay.findUnique({ where: { eventId: event.id }, select: DAY_SELECT });
    if (!clientId) {
      if (!existing?.clientId) return getByEvent(eventId, user);
      if (existing.taskId) {
        await db.productionDay.update({ where: { id: existing.id }, data: { clientId: null, linkedById: actor.userId, linkedByName: actor.name } });
        await moveTaskClient(existing, await agencyClientId());
      } else {
        if (hasProductionEvidence(withFiles(existing))) throw httpError(409, 'Esta jornada ya tiene evidencia: cámbiala de cliente en lugar de quitarlo.', 'HAS_EVIDENCE');
        await db.productionDay.delete({ where: { id: existing.id } });
      }
      return getByEvent(eventId, user);
    }
    const target = await db.client.findUnique({ where: { id: String(clientId) }, select: { id: true, isArchived: true } });
    if (!target || target.isArchived) throw httpError(404, 'Ese cliente no está en operación.');
    const data = { clientId: target.id, date: bogotaDate(event.startAt), title: event.title, linkedById: actor.userId, linkedByName: actor.name };
    if (existing) {
      await db.productionDay.update({ where: { id: existing.id }, data });
      await moveTaskClient(existing, target.id);
    } else {
      await db.productionDay.create({ data: { ...data, eventId: event.id } });
    }
    await ensureTask(event.id);
    return getByEvent(eventId, user);
  };

  const saveEvidence = async (day, { url, note }, actor) => {
    if (day.date > today()) throw httpError(409, 'La evidencia se sube desde el día de la jornada.', 'NOT_YET');
    const problem = evidenceProblem({ url, note });
    if (problem) throw httpError(400, problem, 'INVALID_EVIDENCE');
    await db.productionDay.update({
      where: { id: day.id },
      data: { evidenceUrl: String(url).trim(), evidenceNote: String(note ?? '').trim() || null, evidenceAt: now(), evidenceById: actor.userId, evidenceByName: actor.name },
    });
  };

  /** Sube (o corrige) el enlace de las evidencias desde el evento. */
  const setEvidence = async (eventId, input = {}, user) => {
    const actor = await actorOf(user);
    const event = await productionEvent(eventId);
    if (!canEvidence(actor, event)) throw httpError(403, 'La evidencia la sube quien estuvo en la jornada, quien la agendó o un project manager.');
    const day = await db.productionDay.findUnique({ where: { eventId: event.id }, select: { id: true, date: true } });
    if (!day) throw httpError(409, 'Primero hay que ligar esta jornada a un cliente.', 'NOT_LINKED');
    await saveEvidence({ ...day, date: bogotaDate(event.startAt) }, input, actor);
    return getByEvent(eventId, user);
  };

  /** Sube (o corrige) el enlace de las evidencias desde el pendiente de Gestión. */
  const setEvidenceByTask = async (taskId, input = {}, user) => {
    const actor = await actorOf(user);
    const day = await db.productionDay.findUnique({ where: { taskId: String(taskId) }, select: { id: true, date: true, event: { select: EVENT_SELECT } } });
    if (!day) throw httpError(404, 'Este pendiente no es de una jornada de producción.');
    const task = await db.task.findUnique({ where: { id: String(taskId) }, select: { assigneeId: true, collaborators: { select: { memberId: true } } } });
    if (!canEvidence(actor, day.event, task)) throw httpError(403, 'La evidencia la sube quien estuvo en la jornada, quien la agendó o un project manager.');
    await saveEvidence(day, input, actor);
    return getByTask(taskId, user);
  };

  /**
   * Crea el pendiente de una jornada si todavía no lo tiene: título y fecha del evento, responsable la primera persona
   * del evento (o quien lo agendó) y el resto como colaboradores; cliente el de la jornada o, sin cliente, la agencia.
   * Solo para eventos de Producción de una vez, agendados desde `JORNADA_TASKS_SINCE`. Idempotente.
   */
  async function ensureTask(eventId) {
    const event = await db.operationalEvent.findUnique({ where: { id: String(eventId) }, select: { ...EVENT_SELECT, productionDay: { select: DAY_SELECT } } });
    if (!isLiveEvent(event) || event.type !== 'PRODUCTION') return null;
    if (event.recurrence && event.recurrence !== 'NONE') return null;
    if (new Date(event.createdAt) < JORNADA_TASKS_SINCE) return event.productionDay?.taskId || null;
    if (event.productionDay?.taskId) return event.productionDay.taskId;
    const memberIds = event.memberIds || [];
    const members = memberIds.length ? await db.teamMember.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { id: true } }) : [];
    const ordered = memberIds.filter((id) => members.some((m) => m.id === id));
    let assigneeId = ordered[0] || null;
    if (!assigneeId && event.createdById) assigneeId = (await db.teamMember.findFirst({ where: { userId: event.createdById, isActive: true }, select: { id: true } }))?.id || null;
    if (!assigneeId) { log('[ProductionDays] La jornada no tiene a nadie del equipo: no se creó su pendiente.', event.id); return null; }
    const clientId = event.productionDay?.clientId || await agencyClientId();
    if (!clientId) { log('[ProductionDays] No hay ficha de la agencia para la jornada sin cliente.', event.id); return null; }
    const date = bogotaDate(event.startAt);
    const hours = event.isAllDay ? 'todo el día' : `de ${clock(event.startAt)} a ${clock(event.endAt)}`;
    // El formulario y el pase de cada minuto pueden llegar a la vez: uno crea, el otro espera su turno y no repite.
    if (creating.has(event.id)) return null;
    creating.add(event.id);
    try {
      const day = event.productionDay || await db.productionDay.create({ data: { eventId: event.id, clientId: null, date, title: event.title } });
      const fresh = await db.productionDay.findUnique({ where: { id: day.id }, select: { taskId: true } });
      if (fresh?.taskId) return fresh.taskId;
      const task = await (await taskOps()).createTask({
        title: event.title, dueDate: date, assigneeId, collaboratorIds: ordered.slice(1), creatorId: event.createdById || null,
        clientId, status: 'PENDIENTE',
        comments: `Jornada de producción agendada en el calendario para el ${date.split('-').reverse().join('/')}, ${hours}. Pasa a «En proceso» durante esas horas y se cierra con su entrega: los archivos o el enlace de la carpeta de Drive con las evidencias.`,
      });
      await db.productionDay.update({ where: { id: day.id }, data: { taskId: task.id } });
      return task.id;
    } catch (error) {
      log('[ProductionDays] No se pudo crear el pendiente de la jornada:', error?.message || error);
      return null;
    } finally {
      creating.delete(event.id);
    }
  }

  /** Mueve cada parte del pendiente: el responsable solo, o cada persona del equipo con su reloj. */
  const moveTaskTo = async (taskId, from, to) => {
    const ops = await taskOps();
    const task = await db.task.findUnique({ where: { id: taskId }, include: ops.participationInclude });
    if (!task || task.status === 'REALIZADA') return;
    const shared = Boolean(task.sharedProgress || task.collaborators?.length);
    if (!shared) {
      if (task.status !== from) return;
      await ops.updateTask(taskId, { status: to }, task.assignee?.userId || null);
      return;
    }
    for (const part of taskParticipations(task)) {
      if (part.status !== from || !part.member?.userId) continue;
      try {
        await ops.changeParticipation({
          taskId, memberId: part.memberId, user: { userId: part.member.userId, role: 'USER' },
          payload: { status: to, expectedRevision: part.revision, expectedRosterVersion: task.rosterVersion || 0 },
        });
      } catch (error) {
        log(`[ProductionDays] No se movió la parte de ${part.member?.name || part.memberId}:`, error?.message || error);
      }
    }
  };

  /**
   * El pase de las jornadas (cada minuto): crea los pendientes que falten, mantiene título, fecha y cliente del pendiente
   * con los del evento, lo pasa a «En proceso» durante sus horas y a «Pendiente» al terminar, y retira el pendiente
   * intacto de una jornada que se canceló.
   */
  const syncJornadaTasks = async () => {
    const current = now();
    const events = await db.operationalEvent.findMany({
      where: { type: 'PRODUCTION', createdAt: { gte: JORNADA_TASKS_SINCE }, endAt: { gte: new Date(current.getTime() - 7 * 86400000) } },
      select: { ...EVENT_SELECT, productionDay: { select: DAY_SELECT } },
    });
    const result = { created: 0, started: 0, stopped: 0, retired: 0 };
    for (const event of events) {
      try {
        if (!isLiveEvent(event)) {
          const day = event.productionDay;
          if (day?.task && day.task.status === 'PENDIENTE' && !day.autoStartedAt && !hasProductionEvidence(withFiles(day))) {
            await (await taskOps()).deleteTask(day.task.id, 'Se canceló la jornada en el calendario.', null);
            await db.productionDay.delete({ where: { id: day.id } });
            result.retired += 1;
          }
          continue;
        }
        let day = event.productionDay;
        if (!day?.taskId) {
          if (await ensureTask(event.id)) result.created += 1;
          day = await db.productionDay.findUnique({ where: { eventId: event.id }, select: DAY_SELECT });
          if (!day?.taskId) continue;
        }
        const date = bogotaDate(event.startAt);
        if (day.date !== date || day.title !== event.title) await db.productionDay.update({ where: { id: day.id }, data: { date, title: event.title } });
        const task = day.task;
        if (task && task.status !== 'REALIZADA') {
          const patch = {};
          if (task.title !== event.title) patch.title = event.title;
          if (!task.dueDate || new Date(task.dueDate).toISOString().slice(0, 10) !== date) patch.dueDate = date;
          if (Object.keys(patch).length) await (await taskOps()).updateTask(task.id, patch, null);
        }
        const action = jornadaClockAction({ ...day, startAt: event.startAt, endAt: event.endAt, isAllDay: event.isAllDay }, current);
        if (action === 'START') {
          const claimed = await db.productionDay.updateMany({ where: { id: day.id, autoStartedAt: null }, data: { autoStartedAt: current } });
          if (claimed.count) { await moveTaskTo(day.taskId, 'PENDIENTE', 'EN_CURSO'); result.started += 1; }
        } else if (action === 'STOP') {
          const claimed = await db.productionDay.updateMany({ where: { id: day.id, autoEndedAt: null }, data: { autoEndedAt: current } });
          if (claimed.count) { await moveTaskTo(day.taskId, 'EN_CURSO', 'PENDIENTE'); result.stopped += 1; }
        }
      } catch (error) {
        log('[ProductionDays] Falló el pase de una jornada:', event.id, error?.message || error);
      }
    }
    return result;
  };

  /**
   * Recuerda subir la evidencia de las jornadas de un cliente que ya pasaron sin ella: a quien estuvo en la jornada y al
   * project manager del cliente. Al día siguiente y otra vez tres días después; nunca más de dos veces.
   */
  const runReminders = async () => {
    const current = now();
    if (!isWorkingTime(current)) return { sent: 0 };
    const day = today();
    const pending = await db.productionDay.findMany({
      where: { evidenceUrl: null, date: { lt: day }, client: { is: { isArchived: false } } },
      select: { ...DAY_SELECT, event: { select: { id: true, memberIds: true } }, client: { select: { id: true, name: true, slug: true, projectManager: { select: { userId: true, isActive: true } } } } },
    });
    let sent = 0;
    for (const row of pending) {
      if (hasProductionEvidence(withFiles(row)) || !evidenceReminderDue(row, day)) continue;
      // La fila es la cerradura: solo avisa quien logra contar el recordatorio.
      const claimed = await db.productionDay.updateMany({ where: { id: row.id, reminders: row.reminders, evidenceUrl: null }, data: { reminders: row.reminders + 1, remindedAt: current } });
      if (!claimed.count) continue;
      const memberIds = row.event?.memberIds || [];
      const members = memberIds.length ? await db.teamMember.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { userId: true } }) : [];
      const recipients = new Set(members.map((m) => m.userId).filter(Boolean));
      const pm = row.client?.projectManager;
      if (pm?.userId && pm.isActive !== false) recipients.add(pm.userId);
      const url = row.taskId ? `/gestion?taskId=${encodeURIComponent(row.taskId)}` : row.eventId ? calendarLinkFor(row.eventId, row.date) : `/clientes/operacion/${row.client?.slug || ''}`;
      const [, month, date] = row.date.split('-').map(Number);
      const message = `La jornada de ${row.client?.name || 'un cliente'} del ${date}/${month} no tiene evidencia: súbela en su pendiente para darla por hecha.`;
      for (const userId of recipients) {
        try { if (await notify({ userId, type: PRODUCTION_EVIDENCE_TYPE, message, url, relatedId: row.clientId, resourceId: row.id })) sent += 1; }
        catch (error) { log('[ProductionDays] No se pudo avisar de la evidencia:', error?.message || error); }
      }
    }
    return { sent };
  };

  return { getByEvent, getByTask, listClients, linkClient, setEvidence, setEvidenceByTask, ensureTask, syncJornadaTasks, runReminders };
};

export const productionDayService = createProductionDayService();

export function initProductionDayReminderScheduler({ intervalMs = 30 * 60 * 1000, syncMs = 60 * 1000, service = productionDayService, log = console.error } = {}) {
  const remind = () => service.runReminders().catch((error) => log('[ProductionDays] Falló el pase de recordatorios:', error?.message || error));
  const sync = () => service.syncJornadaTasks().catch((error) => log('[ProductionDays] Falló el pase de pendientes:', error?.message || error));
  const timers = [setInterval(remind, intervalMs), setInterval(sync, syncMs)];
  timers.forEach((timer) => timer.unref?.());
  return timers;
}
