import prisma from '../lib/prisma.js';

export const TRACE_RETENTION_DAYS = 90;
export const TRACE_SYNC_THROTTLE_MS = 5 * 60 * 1000;

const knownEventTypes = new Set([
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'TASK_OPENED',
  'TASK_LIST_SYNCED',
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

export const recordTaskListSync = async ({ userId, taskCount, now = new Date(), db = prisma }) => {
  const normalizedUserId = cleanId(userId);
  if (!normalizedUserId) return null;
  const recent = await db.operationalTraceEvent.findFirst({
    where: {
      actorId: normalizedUserId,
      eventType: 'TASK_LIST_SYNCED',
      occurredAt: { gte: new Date(now.getTime() - TRACE_SYNC_THROTTLE_MS) }
    },
    select: { id: true },
    orderBy: { occurredAt: 'desc' }
  });
  if (recent) return null;

  return recordOperationalTrace({
    eventType: 'TASK_LIST_SYNCED',
    actorId: normalizedUserId,
    subjectUserId: normalizedUserId,
    metadata: { taskCount: Math.max(0, Number(taskCount) || 0) },
    occurredAt: now,
    db
  });
};

const eventDescription = (event, task) => {
  const actor = event.actor?.name || 'Sistema';
  const subject = event.subjectUser?.name;
  const taskName = task?.title ? `“${task.title}”` : 'una tarea';
  switch (event.eventType) {
    case 'TASK_CREATED': return `${actor} creó ${taskName}.`;
    case 'TASK_ASSIGNED': return `${taskName} fue asignada a ${subject || 'un miembro del equipo'}.`;
    case 'TASK_UPDATED': return `${actor} actualizó ${taskName}.`;
    case 'TASK_OPENED': return `${actor} abrió ${taskName}.`;
    case 'TASK_LIST_SYNCED': return `${actor} sincronizó ${event.metadata?.taskCount ?? 0} tareas en Gestión.`;
    case 'NOTIFICATION_CREATED': return `Se generó una notificación para ${subject || 'un miembro del equipo'}.`;
    case 'NOTIFICATION_READ': return `${subject || actor} leyó una notificación${task ? ` de ${taskName}` : ''}.`;
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

  const where = { occurredAt: { gte: from, lte: now } };
  if (userId) where.OR = [{ actorId: userId }, { subjectUserId: userId }];
  if (matchingTaskIds) where.taskId = { in: matchingTaskIds };

  const [users, events] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, avatarUrl: true },
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
    users,
    summary: {
      totalEvents: events.length,
      syncs: events.filter((event) => event.eventType === 'TASK_LIST_SYNCED').length,
      taskOpens: events.filter((event) => event.eventType === 'TASK_OPENED').length,
      taskMutations: events.filter((event) => ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED'].includes(event.eventType)).length,
      notificationReads: events.filter((event) => event.eventType === 'NOTIFICATION_READ').length,
      lastSyncAt: lastSync?.occurredAt?.toISOString?.() || lastSync?.occurredAt || null
    },
    timeline: events.map((event) => {
      const task = event.taskId ? tasksById.get(event.taskId) : null;
      return {
        ...event,
        task: task ? { id: task.id, title: task.title, clientName: task.client?.name || null } : null,
        description: eventDescription(event, task)
      };
    })
  };
};
