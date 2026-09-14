import prisma from '../lib/prisma.js';
import { activeTeamUserWhere } from './teamRosterService.js';
import { presentPlatformMutation, humanMutationWhere } from '../lib/operationalMutationLabels.js';
import { recognitionLabels } from '../lib/recognitionPresentation.js';

export const TRACE_RETENTION_DAYS = 365;

const humanEventTypes = ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_OPENED', 'SESSION_STARTED',
  'NOTIFICATION_READ', 'RECOGNITION_GRANTED', 'TASK_ALERT_SHOWN', 'TASK_ALERT_REVIEWED', 'TASK_ALERT_DISMISSED',
  'TASK_EXCESSIVE_WORK_CONFIRMED', 'TASK_RETURNED_REMINDER_SNOOZED'];
const personalSystemEvents = ['RECOGNITION_GRANTED', 'TASK_ALERT_SHOWN'];
const humanEventWhere = () => ({ OR: [
  { eventType: { in: humanEventTypes }, OR: [
    { actorId: { not: null } }, { eventType: { in: personalSystemEvents }, subjectUserId: { not: null } },
  ] },
  { eventType: 'TASK_LIST_SYNCED', actorId: { not: null }, metadata: { path: ['source'], equals: 'MANUAL' } },
  humanMutationWhere(),
] });
const isHumanEvent = event => (humanEventTypes.includes(event.eventType)
    && (event.actorId || (personalSystemEvents.includes(event.eventType) && event.subjectUserId)))
  || (event.eventType === 'TASK_LIST_SYNCED' && event.metadata?.source === 'MANUAL')
  || (event.eventType === 'PLATFORM_MUTATION' && event.actorId && presentPlatformMutation(event.metadata).visible);

const knownEventTypes = new Set([
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'TASK_OPENED',
  'TASK_LIST_SYNCED',
  'SESSION_STARTED',
  'PLATFORM_MUTATION',
  'NOTIFICATION_CREATED',
  'NOTIFICATION_READ'
]);

let lastPruneAt = 0;

const clamp = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const cleanId = (value) => {
  const text = String(value || '').trim();
  return text && text.length <= 100 ? text : null;
};

const cleanMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const safe = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 240);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean' || value === null) safe[key] = value;
    else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 20).map((item) => String(item).slice(0, 80));
    }
  }
  return Object.keys(safe).length ? safe : null;
};

const assertAdmin = (requester) => {
  if (requester?.role !== 'ADMIN') {
    const error = new Error('Solo los administradores pueden consultar la trazabilidad operativa.');
    error.statusCode = 403;
    throw error;
  }
};

const maybePruneExpiredTrace = async ({ now, db }) => {
  if (typeof db.operationalTraceEvent?.deleteMany !== 'function') return;
  if (now.getTime() - lastPruneAt < 24 * 60 * 60 * 1000) return;
  lastPruneAt = now.getTime();
  const cutoff = new Date(now.getTime() - TRACE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.operationalTraceEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
};

export const recordOperationalTrace = async ({
  eventType,
  actorId = null,
  subjectUserId = null,
  taskId = null,
  metadata = null,
  occurredAt = new Date(),
  db = prisma
}) => {
  if (!knownEventTypes.has(eventType)) {
    throw new Error(`Unsupported operational trace event: ${eventType}`);
  }

  const event = await db.operationalTraceEvent.create({
    data: {
      eventType,
      actorId: cleanId(actorId),
      subjectUserId: cleanId(subjectUserId),
      taskId: cleanId(taskId),
      metadata: cleanMetadata(metadata),
      occurredAt
    }
  });

  maybePruneExpiredTrace({ now: occurredAt, db }).catch((error) => {
    console.error('[OperationalTrace] Retention cleanup failed:', error?.message || error);
  });
  return event;
};

export const recordTaskListSync = async ({ userId, taskCount, source, now = new Date(), db = prisma }) => {
  const normalizedUserId = cleanId(userId);
  if (!normalizedUserId || source !== 'MANUAL') return null;

  return recordOperationalTrace({
    eventType: 'TASK_LIST_SYNCED',
    actorId: normalizedUserId,
    subjectUserId: normalizedUserId,
    metadata: { taskCount: Math.max(0, Number(taskCount) || 0), source: 'MANUAL' },
    occurredAt: now,
    db
  });
};

const eventDescription = (event, task) => {
  const actor = event.actor?.name || 'Sistema';
  const subject = event.subjectUser?.name;
  const title = task?.title || event.metadata?.taskTitle;
  const taskName = title ? `“${title}”` : 'una tarea';
  const alertName = event.metadata?.kind === 'RETURNED' ? 'tarea devuelta' : 'más de 15 horas';
  switch (event.eventType) {
    case 'TASK_CREATED': return `${actor} creó ${taskName}.`;
    case 'TASK_ASSIGNED': return `${taskName} fue asignada a ${subject || 'un miembro del equipo'}.`;
    case 'TASK_UPDATED': return `${actor} actualizó ${taskName}.`;
    case 'TASK_OPENED': return `${actor} abrió ${taskName}.`;
    case 'TASK_LIST_SYNCED': return `${actor} actualizó la lista de tareas.`;
    case 'RECOGNITION_GRANTED': return `${subject || actor} recibió el reconocimiento “${recognitionLabels[event.metadata?.kind] || 'Reconocimiento del equipo'}”.`;
    case 'TASK_ALERT_SHOWN': return event.metadata?.kind === 'RETURNED'
      ? `Se le mostró a ${subject || actor} un recordatorio para revisar ${taskName}, que lleva más de una hora devuelta.`
      : `Se le mostró a ${subject || actor} un aviso porque ${taskName} superó las 15 horas de trabajo.`;
    case 'TASK_ALERT_REVIEWED': return `${actor} seleccionó “Revisar tarea” en el aviso de ${alertName} de ${taskName}.`;
    case 'TASK_ALERT_DISMISSED': return `${actor} cerró el aviso de ${alertName} de ${taskName}.`;
    case 'TASK_EXCESSIVE_WORK_CONFIRMED': return `${actor} seleccionó “Sigo trabajando” en el aviso de más de 15 horas de ${taskName}.`;
    case 'TASK_RETURNED_REMINDER_SNOOZED': return `${actor} seleccionó “Recordarme más tarde” en el aviso de tarea devuelta de ${taskName}.`;
    case 'SESSION_STARTED': return `${actor} inició sesión en la plataforma.`;
    case 'PLATFORM_MUTATION': return presentPlatformMutation(event.metadata, actor).description;
    case 'NOTIFICATION_CREATED': return `Se generó una notificación para ${subject || 'un miembro del equipo'}.`;
    case 'NOTIFICATION_READ': return `${subject || actor} marcó una notificación como leída${task ? ` de ${taskName}` : ''}.`;
    default: return 'Actividad operativa registrada.';
  }
};

export const getOperationalTrace = async ({
  requester,
  filters = {},
  now = new Date(),
  db = prisma
}) => {
  assertAdmin(requester);
  const days = clamp(filters.days, 1, 30, 7);
  const limit = clamp(filters.limit, 1, 200, 100);
  const userId = cleanId(filters.userId);
  const taskQuery = String(filters.taskQuery || '').trim().slice(0, 120);
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let matchingTaskIds = null;
  if (taskQuery) {
    const matchingTasks = await db.task.findMany({
      where: {
        OR: [
          { id: taskQuery },
          { title: { contains: taskQuery, mode: 'insensitive' } },
          { client: { name: { contains: taskQuery, mode: 'insensitive' } } }
        ]
      },
      select: { id: true },
      take: 25
    });
    matchingTaskIds = matchingTasks.map((task) => task.id);
  }

  const where = { occurredAt: { gte: from, lte: now }, AND: [humanEventWhere()] };
  if (userId) where.OR = [{ actorId: userId }, { subjectUserId: userId }];
  if (matchingTaskIds) where.taskId = { in: matchingTaskIds };

  const [users, candidates] = await Promise.all([
    db.user.findMany({
      where: activeTeamUserWhere(),
      select: { id: true, name: true, role: true, avatarUrl: true, teamMember: { select: { name: true, avatarUrl: true } } },
      orderBy: { name: 'asc' }
    }),
    db.operationalTraceEvent.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, role: true, avatarUrl: true } },
        subjectUser: { select: { id: true, name: true, role: true, avatarUrl: true } }
      },
      orderBy: { occurredAt: 'desc' },
      take: limit
    })
  ]);

  const events = candidates.filter(isHumanEvent);
  const taskIds = [...new Set(events.map((event) => event.taskId).filter(Boolean))];
  const tasks = taskIds.length
    ? await db.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, title: true, client: { select: { name: true } } }
    })
    : [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const lastSync = events.find((event) => event.eventType === 'TASK_LIST_SYNCED');

  return {
    generatedAt: now.toISOString(),
    retentionDays: TRACE_RETENTION_DAYS,
    period: { from: from.toISOString(), to: now.toISOString(), days },
    users: users.map(user => ({ id: user.id, name: user.teamMember?.name || user.name, role: user.role, avatarUrl: user.teamMember?.avatarUrl || user.avatarUrl })),
    summary: {
      totalEvents: events.length,
      syncs: events.filter((event) => event.eventType === 'TASK_LIST_SYNCED').length,
      taskOpens: events.filter((event) => event.eventType === 'TASK_OPENED').length,
      taskMutations: events.filter((event) => ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED'].includes(event.eventType)).length,
      platformMutations: events.filter((event) => event.eventType === 'PLATFORM_MUTATION' && presentPlatformMutation(event.metadata).isChange).length,
      sessionStarts: events.filter((event) => event.eventType === 'SESSION_STARTED').length,
      notificationReads: events.filter((event) => event.eventType === 'NOTIFICATION_READ').length,
      lastSyncAt: lastSync?.occurredAt?.toISOString?.() || lastSync?.occurredAt || null
    },
    timeline: events.map((event) => {
      const task = event.taskId ? tasksById.get(event.taskId) : null;
      return {
        ...event,
        displayLabel: event.eventType === 'PLATFORM_MUTATION' ? presentPlatformMutation(event.metadata).label
          : ({ TASK_LIST_SYNCED: 'Lista de tareas actualizada', RECOGNITION_GRANTED: 'Reconocimiento recibido',
            TASK_ALERT_SHOWN: 'Aviso mostrado', TASK_ALERT_REVIEWED: 'Revisar tarea', TASK_ALERT_DISMISSED: 'Aviso cerrado',
            TASK_EXCESSIVE_WORK_CONFIRMED: 'Sigo trabajando', TASK_RETURNED_REMINDER_SNOOZED: 'Recordarme más tarde',
          }[event.eventType] || null),
        task: task ? { id: task.id, title: task.title, clientName: task.client?.name || null } : null,
        description: eventDescription(event, task)
      };
    })
  };
};
