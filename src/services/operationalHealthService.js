import prisma from '../lib/prisma.js';

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_TASK_STATUSES = new Set(['PENDIENTE', 'EN_CURSO', 'DEVUELTA']);

const MODULE_DEFINITIONS = [
  { id: 'gestion', label: 'Gestión', route: '/gestion' },
  { id: 'actividad', label: 'Actividad', route: '/actividad' },
  { id: 'parrillas', label: 'Parrillas', route: '/parrillas' },
  { id: 'cotizaciones', label: 'Cotizaciones', route: '/cotizaciones' },
  { id: 'anuncios', label: 'Anuncios', route: '/' },
  { id: 'conversaciones', label: 'Conversaciones', route: '/clientes' }
];

const SCORE_WEIGHTS = {
  adoption: 30,
  taskQuality: 40,
  collaboration: 15,
  clientReadiness: 15
};

const clampPercentage = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));

const asDate = (value) => value instanceof Date ? value : new Date(value);

const isWithin = (value, window) => {
  if (!value) return false;
  const timestamp = asDate(value).getTime();
  return Number.isFinite(timestamp)
    && timestamp >= window.start.getTime()
    && timestamp < window.end.getTime();
};

const hasText = (value) => String(value || '').replace(/<[^>]*>/g, '').trim().length > 0;

const hasHumanContext = (task) => hasText(task.comments)
  || (task.taskComments || []).some((comment) => !comment.type || comment.type === 'human');

const percentageChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const scoreStatus = (score) => {
  if (score >= 85) return { id: 'HEALTHY', label: 'Saludable' };
  if (score >= 70) return { id: 'WATCH', label: 'En observación' };
  return { id: 'ACTION', label: 'Requiere atención' };
};

export const assertOperationalHealthAccess = (user) => {
  if (String(user?.role || '').toUpperCase() !== 'ADMIN') {
    const error = new Error('Esta vista está disponible solo para administradores.');
    error.statusCode = 403;
    throw error;
  }
};

export const getBogotaWeekWindows = (now = new Date()) => {
  const bogotaClock = new Date(asDate(now).getTime() - BOGOTA_OFFSET_MS);
  const daysSinceMonday = (bogotaClock.getUTCDay() + 6) % 7;
  const currentStart = new Date(Date.UTC(
    bogotaClock.getUTCFullYear(),
    bogotaClock.getUTCMonth(),
    bogotaClock.getUTCDate() - daysSinceMonday,
    5, 0, 0, 0
  ));

  return {
    current: {
      start: currentStart,
      end: new Date(currentStart.getTime() + WEEK_MS)
    },
    previous: {
      start: new Date(currentStart.getTime() - WEEK_MS),
      end: currentStart
    }
  };
};

const buildActionCollector = ({ windows, users }) => {
  const currentUserActions = new Map();
  const previousUserActions = new Map();
  const moduleActions = new Map(MODULE_DEFINITIONS.map((module) => [module.id, {
    ...module,
    current: 0,
    previous: 0,
    currentUsers: new Set(),
    previousUsers: new Set()
  }]));
  const dailyActions = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(windows.current.start.getTime() + index * 24 * 60 * 60 * 1000),
    count: 0
  }));
  const validUserIds = new Set(users.map((user) => user.id));

  const collect = ({ date, moduleId, userId }) => {
    const targetModule = moduleActions.get(moduleId);
    if (!targetModule || !date) return;

    const inCurrent = isWithin(date, windows.current);
    const inPrevious = isWithin(date, windows.previous);
    if (!inCurrent && !inPrevious) return;

    const period = inCurrent ? 'current' : 'previous';
    targetModule[period] += 1;

    if (userId && validUserIds.has(userId)) {
      targetModule[`${period}Users`].add(userId);
      const userActions = inCurrent ? currentUserActions : previousUserActions;
      userActions.set(userId, (userActions.get(userId) || 0) + 1);
    }

    if (inCurrent) {
      const dayIndex = Math.floor((asDate(date).getTime() - windows.current.start.getTime()) / (24 * 60 * 60 * 1000));
      if (dailyActions[dayIndex]) dailyActions[dayIndex].count += 1;
    }
  };

  return { collect, currentUserActions, previousUserActions, moduleActions, dailyActions };
};

const buildIssue = ({ id, title, description, count, tone, items }) => ({
  id,
  title,
  description,
  count,
  tone,
  items: items.slice(0, 12)
});

export const buildOperationalHealthSnapshot = ({
  now = new Date(),
  users = [],
  tasks = [],
  taskComments = [],
  operationalEvents = [],
  contentPlans = [],
  contentItems = [],
  quotations = [],
  globalAnnouncements = [],
  targetedAnnouncements = [],
  flowMessages = [],
  clients = []
}) => {
  const windows = getBogotaWeekWindows(now);
  const activeUsers = users.filter((user) => user.isActive !== false);
  const userByTeamMemberId = new Map(
    activeUsers.filter((user) => user.teamMember?.id).map((user) => [user.teamMember.id, user.id])
  );
  const { collect, currentUserActions, previousUserActions, moduleActions, dailyActions } = buildActionCollector({
    windows,
    users: activeUsers
  });

  tasks.forEach((task) => collect({ date: task.createdAt, moduleId: 'gestion', userId: task.creatorId }));
  taskComments
    .filter((comment) => !comment.type || comment.type === 'human')
    .forEach((comment) => collect({ date: comment.createdAt, moduleId: 'gestion', userId: comment.authorId }));
  operationalEvents.forEach((event) => collect({ date: event.createdAt, moduleId: 'actividad', userId: event.createdById }));
  contentPlans.forEach((plan) => collect({
    date: plan.createdAt,
    moduleId: 'parrillas',
    userId: userByTeamMemberId.get(plan.ownerId)
  }));
  contentItems.forEach((item) => collect({
    date: item.createdAt,
    moduleId: 'parrillas',
    userId: userByTeamMemberId.get(item.plan?.ownerId)
  }));
  quotations.forEach((quotation) => collect({ date: quotation.created_at, moduleId: 'cotizaciones' }));
  globalAnnouncements.forEach((announcement) => collect({
    date: announcement.createdAt,
    moduleId: 'anuncios',
    userId: announcement.authorId
  }));
  targetedAnnouncements.forEach((announcement) => collect({
    date: announcement.createdAt,
    moduleId: 'anuncios',
    userId: announcement.relatedId
  }));
  flowMessages.forEach((message) => collect({
    date: message.createdAt,
    moduleId: 'conversaciones',
    userId: userByTeamMemberId.get(message.authorId)
  }));

  const openTasks = tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));
  const missingAssignee = openTasks.filter((task) => !task.assigneeId);
  const missingDate = openTasks.filter((task) => !task.dueDate);
  const missingContext = openTasks.filter((task) => !hasHumanContext(task));
  const overdue = openTasks.filter((task) => task.dueDate && asDate(task.dueDate) < asDate(now));
  const tasksCreatedThisWeek = tasks.filter((task) => isWithin(task.createdAt, windows.current));
  const contextualTasksThisWeek = tasksCreatedThisWeek.filter(hasHumanContext);
  const activeClients = clients.filter((client) => client.isArchived !== true);
  const incompleteClients = activeClients.map((client) => {
    const missingFields = [];
    if (!client.responsibleId) missingFields.push('responsable');
    if (!hasText(client.aiInstructions)) missingFields.push('contexto de marca');
    if (!client.logoUrl) missingFields.push('identidad visual');
    return { ...client, missingFields };
  }).filter((client) => client.missingFields.length > 0);

  const totalTaskFields = openTasks.length * 3;
  const missingTaskFields = missingAssignee.length + missingDate.length + missingContext.length;
  const taskQualityScore = totalTaskFields > 0
    ? clampPercentage(((totalTaskFields - missingTaskFields) / totalTaskFields) * 100)
    : 100;
  const collaborationScore = tasksCreatedThisWeek.length > 0
    ? clampPercentage((contextualTasksThisWeek.length / tasksCreatedThisWeek.length) * 100)
    : 100;
  const clientReadinessScore = activeClients.length > 0
    ? clampPercentage(((activeClients.length - incompleteClients.length) / activeClients.length) * 100)
    : 100;
  const adoptionRate = activeUsers.length > 0
    ? clampPercentage((currentUserActions.size / activeUsers.length) * 100)
    : 0;
  const score = clampPercentage(
    adoptionRate * (SCORE_WEIGHTS.adoption / 100)
    + taskQualityScore * (SCORE_WEIGHTS.taskQuality / 100)
    + collaborationScore * (SCORE_WEIGHTS.collaboration / 100)
    + clientReadinessScore * (SCORE_WEIGHTS.clientReadiness / 100)
  );

  const mapTaskItem = (task) => ({
    id: task.id,
    title: task.title,
    subtitle: task.client?.name || 'Sin cliente',
    url: `/gestion?taskId=${task.id}`
  });

  const issues = [
    buildIssue({
      id: 'tasks-without-context', title: 'Tareas sin contexto',
      description: 'Solicitudes abiertas sin un comentario humano que explique el trabajo.',
      count: missingContext.length, tone: 'amber', items: missingContext.map(mapTaskItem)
    }),
    buildIssue({
      id: 'tasks-without-assignee', title: 'Tareas sin responsable',
      description: 'Trabajo abierto que todavía no tiene una persona a cargo.',
      count: missingAssignee.length, tone: 'rose', items: missingAssignee.map(mapTaskItem)
    }),
    buildIssue({
      id: 'tasks-without-date', title: 'Tareas sin fecha',
      description: 'Compromisos abiertos sin una expectativa temporal definida.',
      count: missingDate.length, tone: 'violet', items: missingDate.map(mapTaskItem)
    }),
    buildIssue({
      id: 'overdue-tasks', title: 'Tareas vencidas',
      description: 'Tareas abiertas cuya fecha acordada ya pasó.',
      count: overdue.length, tone: 'rose', items: overdue.map(mapTaskItem)
    }),
    buildIssue({
      id: 'incomplete-clients', title: 'Clientes incompletos',
      description: 'Cuentas activas sin responsable, contexto de marca o identidad visual.',
      count: incompleteClients.length, tone: 'emerald',
      items: incompleteClients.map((client) => ({
        id: client.id,
        title: client.name,
        subtitle: `Falta: ${client.missingFields.join(', ')}`,
        url: `/cliente/${client.id}`
      }))
    })
  ];

  const modules = [...moduleActions.values()].map((module) => ({
    id: module.id,
    label: module.label,
    route: module.route,
    current: module.current,
    previous: module.previous,
    contributors: module.currentUsers.size,
    trend: percentageChange(module.current, module.previous)
  })).sort((a, b) => b.current - a.current);

  const usersByActivity = activeUsers.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl || null,
    actions: currentUserActions.get(user.id) || 0,
    active: currentUserActions.has(user.id)
  })).sort((a, b) => b.actions - a.actions || a.name.localeCompare(b.name));

  return {
    generatedAt: asDate(now).toISOString(),
    period: {
      currentStart: windows.current.start.toISOString(),
      currentEnd: windows.current.end.toISOString(),
      previousStart: windows.previous.start.toISOString(),
      previousEnd: windows.previous.end.toISOString()
    },
    score,
    status: scoreStatus(score),
    weights: SCORE_WEIGHTS,
    adoption: {
      activeUsers: currentUserActions.size,
      totalUsers: activeUsers.length,
      rate: adoptionRate,
      previousActiveUsers: previousUserActions.size,
      trend: percentageChange(currentUserActions.size, previousUserActions.size)
    },
    quality: {
      score: taskQualityScore,
      openTasks: openTasks.length,
      tasksWithoutAssignee: missingAssignee.length,
      tasksWithoutDate: missingDate.length,
      tasksWithoutContext: missingContext.length,
      overdueTasks: overdue.length
    },
    collaboration: {
      score: collaborationScore,
      tasksCreated: tasksCreatedThisWeek.length,
      tasksWithContext: contextualTasksThisWeek.length,
      comments: taskComments.filter((comment) => isWithin(comment.createdAt, windows.current)).length
    },
    clients: {
      score: clientReadinessScore,
      active: activeClients.length,
      incomplete: incompleteClients.length
    },
    modules,
    dailyActivity: dailyActions.map((day) => ({ date: day.date.toISOString(), count: day.count })),
    users: usersByActivity,
    issues
  };
};

export const getOperationalHealth = async ({ requester, now = new Date(), db = prisma }) => {
  assertOperationalHealthAccess(requester);
  const windows = getBogotaWeekWindows(now);
  const since = windows.previous.start;

  const [
    users,
    tasks,
    taskComments,
    operationalEvents,
    contentPlans,
    contentItems,
    quotations,
    globalAnnouncements,
    targetedAnnouncements,
    flowMessages,
    clients
  ] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, role: true, avatarUrl: true, isActive: true,
        teamMember: { select: { id: true } }
      }
    }),
    db.task.findMany({
      where: {
        OR: [
          { status: { not: 'REALIZADA' } },
          { createdAt: { gte: since } }
        ]
      },
      select: {
        id: true, title: true, status: true, creatorId: true, createdAt: true,
        dueDate: true, assigneeId: true, comments: true,
        client: { select: { id: true, name: true } },
        taskComments: {
          where: { type: 'human' },
          select: { id: true, type: true },
          take: 1
        }
      }
    }),
    db.taskComment.findMany({
      where: { createdAt: { gte: since }, type: 'human' },
      select: { id: true, authorId: true, createdAt: true, type: true }
    }),
    db.operationalEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdById: true, createdAt: true }
    }),
    db.contentPlan.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { id: true, ownerId: true, createdAt: true }
    }),
    db.contentItem.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { id: true, createdAt: true, plan: { select: { ownerId: true } } }
    }),
    db.quotation.findMany({
      where: { created_at: { gte: since } },
      select: { id: true, created_at: true }
    }),
    db.globalAnnouncement.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, authorId: true, createdAt: true }
    }),
    db.notification.findMany({
      where: { createdAt: { gte: since }, type: 'TEAM_ANNOUNCEMENT' },
      select: { id: true, relatedId: true, createdAt: true }
    }),
    db.flowMessage.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, authorId: true, createdAt: true }
    }),
    db.client.findMany({
      where: { isArchived: false },
      select: {
        id: true, name: true, slug: true, isArchived: true,
        responsibleId: true, logoUrl: true, aiInstructions: true
      }
    })
  ]);

  return buildOperationalHealthSnapshot({
    now,
    users,
    tasks,
    taskComments,
    operationalEvents,
    contentPlans,
    contentItems,
    quotations,
    globalAnnouncements,
    targetedAnnouncements,
    flowMessages,
    clients
  });
};
