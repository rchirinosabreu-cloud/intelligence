import prisma from '../lib/prisma.js';
import DOMPurify from 'isomorphic-dompurify';
import { createNotification } from './notificationService.js';

const ACTIVE_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const ANNOUNCEMENT_ALLOWED_TAGS = ['p', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br', 'span', 'mark', 'a'];
const ANNOUNCEMENT_ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-type', 'data-id', 'data-label', 'data-mention-id'];

export const sanitizeDashboardAnnouncementContent = (content = '') => DOMPurify.sanitize(content.trim(), {
  ALLOWED_TAGS: ANNOUNCEMENT_ALLOWED_TAGS,
  ALLOWED_ATTR: ANNOUNCEMENT_ALLOWED_ATTR,
  ADD_ATTR: ['target', 'rel'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed']
}).trim();

const hasAnnouncementText = (content) => DOMPurify.sanitize(content, {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: []
}).replace(/&nbsp;/gi, ' ').trim().length > 0;

export const assertPersonalDashboardAccess = ({ requester, targetUserId }) => {
  if (requester?.role === 'ADMIN') return;
  if (requester?.userId && requester.userId === targetUserId) return;

  const error = new Error('Solo administradores pueden consultar dashboards personales de otras personas.');
  error.statusCode = 403;
  throw error;
};

export const assertDashboardManagerAccess = (user) => {
  if (!MANAGER_ROLES.includes(user?.role)) {
    const error = new Error('Solo administradores o project managers pueden gestionar este dashboard.');
    error.statusCode = 403;
    throw error;
  }
};

export const assertAdminDashboardAccess = (user) => {
  if (user?.role !== 'ADMIN') {
    const error = new Error('Solo administradores pueden consultar dashboards personales.');
    error.statusCode = 403;
    throw error;
  }
};

const isCommunityManagerRole = (role = '') => role.toLowerCase().includes('community manager');
const isProjectManagerRole = (role = '') => role.toLowerCase().includes('project manager');
const isAccountantRole = (role = '') => role.toLowerCase().includes('contador');

const getBogotaWeekContext = (value) => {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const calendarDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const weekday = calendarDate.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(calendarDate);
  monday.setUTCDate(calendarDate.getUTCDate() - mondayOffset);

  return {
    dateKey: calendarDate.toISOString().slice(0, 10),
    weekKey: monday.toISOString().slice(0, 10),
    weekday
  };
};

const getBogotaDayWindow = (value) => {
  const context = getBogotaWeekContext(value);
  if (!context) return null;
  const [year, month, day] = context.dateKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const getBogotaWeekWindow = (value) => {
  const context = getBogotaWeekContext(value);
  if (!context) return null;
  const [year, month, day] = context.weekKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { start, end };
};

export const buildContextChallengeTaskWhere = ({ userId, now = new Date() }) => {
  const weekWindow = getBogotaWeekWindow(now);
  return {
    creatorId: userId,
    createdAt: {
      gte: weekWindow.start,
      lt: weekWindow.end
    }
  };
};

const toDate = (value) => (value ? new Date(value) : null);

const isSameBogotaDay = (date, now) => {
  if (!date) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date) === formatter.format(now);
};

const formatTask = (task) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  dueDate: task.dueDate,
  completedAt: task.completedAt,
  creatorId: task.creatorId || null,
  assigneeId: task.assigneeId || null,
  isPriority: task.isPriority,
  priority: task.priority,
  isSpecial: task.isSpecial,
  assignee: task.assignee ? {
    id: task.assignee.id,
    name: task.assignee.name,
    role: task.assignee.role,
    avatarUrl: task.assignee.avatarUrl || null
  } : null,
  client: task.client ? {
    id: task.client.id,
    name: task.client.name,
    slug: task.client.slug,
    logoUrl: task.client.logoUrl,
    healthScore: task.client.healthRecords?.[0]?.score ?? null
  } : null
});

const newestExternalFeedback = (task, memberUserId) => {
  const comment = (task.taskComments || []).find((item) => item.authorId !== memberUserId);
  return comment?.content || null;
};

const hasCreatorContext = (task) => (task.taskComments || []).some((comment) => (
  comment.authorId === task.creatorId
  && (!comment.type || comment.type === 'human')
  && hasAnnouncementText(comment.content || '')
));

const summarizeTaskCounts = (tasks, now) => {
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
  return {
    activeTasks: activeTasks.length,
    returnedTasks: activeTasks.filter((task) => task.status === 'DEVUELTA').length,
    overdueTasks: activeTasks.filter((task) => (
      task.status !== 'DEVUELTA'
      && task.dueDate
      && new Date(task.dueDate) < now
    )).length
  };
};

const buildAssignedClientSummaries = (clients, now) => {
  return (clients || []).map((client) => {
    const latestHealth = client.healthRecords?.[0] || null;
    const taskCounts = summarizeTaskCounts(client.nativeTasks || [], now);
    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      logoUrl: client.logoUrl,
      healthScore: latestHealth?.score ?? null,
      contentStatus: latestHealth?.contentStatus || null,
      reportStatus: latestHealth?.reportStatus || null,
      contentPlanStatus: client.contentPlans?.[0]?.status || null,
      ...taskCounts
    };
  }).sort((a, b) => {
    const healthA = a.healthScore ?? 101;
    const healthB = b.healthScore ?? 101;
    if (healthA !== healthB) return healthA - healthB;
    return b.activeTasks - a.activeTasks;
  }).slice(0, 8);
};

const buildClientSummaries = (tasks, now) => {
  const byClient = new Map();
  for (const task of tasks) {
    if (!task.client) continue;
    const current = byClient.get(task.client.id) || {
      id: task.client.id,
      name: task.client.name,
      slug: task.client.slug,
      logoUrl: task.client.logoUrl,
      healthScore: task.client.healthRecords?.[0]?.score ?? null,
      activeTasks: 0,
      returnedTasks: 0,
      overdueTasks: 0
    };

    if (ACTIVE_STATUSES.includes(task.status)) current.activeTasks += 1;
    if (task.status === 'DEVUELTA') current.returnedTasks += 1;
    if (task.dueDate && new Date(task.dueDate) < now && ACTIVE_STATUSES.includes(task.status)) current.overdueTasks += 1;
    byClient.set(task.client.id, current);
  }
  return Array.from(byClient.values()).sort((a, b) => b.activeTasks - a.activeTasks).slice(0, 6);
};

export const buildPersonalDashboard = ({ member, now = new Date(), globalAchievements = null }) => {
  const tasks = Array.isArray(member?.nativeTasks) ? member.nativeTasks : [];
  const returnedTaskCandidates = Array.isArray(member?.returnedTasks)
    ? member.returnedTasks
    : tasks.filter((task) => task.status === 'DEVUELTA' && task.creatorId === member?.userId);
  const returnedTasks = Array.from(new Map(
    returnedTaskCandidates
      .filter((task) => task.status === 'DEVUELTA' && task.creatorId === member?.userId)
      .map((task) => [task.id, task])
  ).values());
  const isCommunityManager = isCommunityManagerRole(member?.role);
  const isProjectManager = isProjectManagerRole(member?.role);
  const isAccountant = isAccountantRole(member?.role);
  const currentWeek = getBogotaWeekContext(now)?.weekKey;
  const createdTasks = isCommunityManager
    ? (Array.isArray(member?.createdTasks) ? member.createdTasks : tasks.filter((task) => task.creatorId === member.userId))
      .filter((task) => getBogotaWeekContext(task.createdAt)?.weekKey === currentWeek)
    : [];
  const assignedClients = buildAssignedClientSummaries(member?.responsibleClients || [], now);
  const assignedActiveTasks = tasks.filter((task) => ['PENDIENTE', 'EN_CURSO'].includes(task.status));
  const activeTasks = Array.from(new Map(
    [...assignedActiveTasks, ...returnedTasks].map((task) => [task.id, task])
  ).values());
  const overdueTasks = assignedActiveTasks.filter((task) => {
    const dueDate = toDate(task.dueDate);
    return dueDate && dueDate < now;
  });
  const todayTasks = assignedActiveTasks.filter((task) => isSameBogotaDay(toDate(task.dueDate), now));
  const upcomingTasks = assignedActiveTasks
    .filter((task) => {
      const dueDate = toDate(task.dueDate);
      return dueDate && dueDate > now && !isSameBogotaDay(dueDate, now);
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 8);
  const memberAchievementsToday = tasks
    .filter((task) => task.status === 'REALIZADA' && isSameBogotaDay(toDate(task.completedAt), now))
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  const memberAchievements = memberAchievementsToday.slice(0, 8);
  const achievements = (Array.isArray(globalAchievements) ? globalAchievements : memberAchievements)
    .filter((task) => task.status === 'REALIZADA')
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  const focusCards = [];
  if (overdueTasks.length > 0) {
    focusCards.push({
      id: 'overdue-focus',
      type: 'URGENTE',
      severity: overdueTasks.length > 2 ? 'critical' : 'warning',
      title: `${overdueTasks.length} ${overdueTasks.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`,
      content: 'Revisa fechas, cierra lo que ya esté listo o pide apoyo para desbloquear lo pendiente.',
      actionLabel: 'Ver tareas vencidas',
      actionUrl: '/gestion',
      items: overdueTasks.slice(0, 5).map(formatTask)
    });
  }
  if (returnedTasks.length > 0) {
    focusCards.push({
      id: 'returned-focus',
      type: 'BLOQUEO',
      severity: 'warning',
      title: `${returnedTasks.length} ${returnedTasks.length === 1 ? 'corrección pendiente' : 'correcciones pendientes'}`,
      content: 'Prioriza las devoluciones para recuperar la racha de calidad y cerrar el ciclo con contexto.',
      actionLabel: 'Revisar devoluciones',
      actionUrl: '/gestion',
      items: returnedTasks.slice(0, 5).map((task) => ({
        ...formatTask(task),
        lastFeedback: newestExternalFeedback(task, member.userId)
      }))
    });
  }

  const undocumentedTasks = createdTasks.filter((task) => !hasCreatorContext(task));
  const documentedTaskCount = createdTasks.length - undocumentedTasks.length;
  const announcementDaysThisWeek = new Set(
    (member?.authoredAnnouncements || [])
      .map((announcement) => getBogotaWeekContext(announcement.createdAt))
      .filter((context) => context?.weekKey === currentWeek && context.weekday >= 1 && context.weekday <= 5)
      .map((context) => context.dateKey)
  ).size;
  const operationalEventsByWorkday = (member?.authoredOperationalEvents || []).reduce((eventsByDay, event) => {
    const context = getBogotaWeekContext(event.createdAt);
    if (context?.weekKey !== currentWeek || context.weekday < 1 || context.weekday > 5) return eventsByDay;
    eventsByDay.set(context.dateKey, (eventsByDay.get(context.dateKey) || 0) + 1);
    return eventsByDay;
  }, new Map());
  const operationalEventsThisWeek = [...operationalEventsByWorkday.values()]
    .reduce((total, eventCount) => total + Math.min(eventCount, 2), 0);
  const clientsNeedingAttention = assignedClients.filter((client) => (client.healthScore ?? 100) < 70 || client.returnedTasks > 0 || client.overdueTasks > 0);
  const clientsWithoutPlan = assignedClients.filter((client) => !client.contentPlanStatus || client.contentStatus === 'SIN_PARRILLA');

  const weeklyHabit = isCommunityManager
    ? {
        id: 'keep-context-fresh',
        title: 'Mantener contexto fresco',
        description: 'Cada tarea que crees esta semana debe incluir un comentario tuyo con la información necesaria para comenzar.',
        progress: createdTasks.length > 0 ? Math.round((documentedTaskCount / createdTasks.length) * 100) : null,
        targetLabel: createdTasks.length > 0
          ? `${documentedTaskCount} de ${createdTasks.length} tareas creadas esta semana con contexto`
          : 'Aún no has creado tareas esta semana'
      }
    : isProjectManager
    ? {
        id: 'daily-team-announcement',
        title: 'Publicar un anuncio cada día',
        description: 'Comparte cada día hábil un anuncio general o personal para mantener al equipo alineado y con contexto.',
        progress: Math.round((announcementDaysThisWeek / 5) * 100),
        targetLabel: `${announcementDaysThisWeek} de 5 días con anuncio`
      }
    : isAccountant
    ? {
        id: 'weekly-operational-calendar',
        title: 'Registrar 10 eventos en el calendario',
        description: 'Registra dos eventos por día hábil: jornadas de producción, reuniones o actividades relacionadas con la gestión de la agencia.',
        progress: Math.min(100, Math.round((operationalEventsThisWeek / 10) * 100)),
        targetLabel: `${operationalEventsThisWeek} de 10 eventos registrados esta semana`
      }
    : {
        id: 'no-weekly-challenge',
        title: 'Aún no tienes retos para esta semana',
        description: '',
        progress: null,
        targetLabel: '',
        isEmpty: true
      };

  if (isCommunityManager && clientsNeedingAttention.length > 0) {
    focusCards.push({
      id: 'cm-client-health',
      type: 'OPORTUNIDAD',
      severity: clientsNeedingAttention.some((client) => (client.healthScore ?? 100) < 60 || client.overdueTasks > 0) ? 'warning' : 'info',
      title: `${clientsNeedingAttention.length} ${clientsNeedingAttention.length === 1 ? 'cliente pide liderazgo' : 'clientes piden liderazgo'}`,
      content: 'Lleva a la proxima revision una propuesta, no solo una lista de pendientes: objetivo, insight y siguiente accion.',
      actionLabel: 'Ver mis clientes',
      actionUrl: '/clientes',
      items: clientsNeedingAttention.slice(0, 5).map((client) => ({
        id: client.id,
        title: client.name,
        status: `Salud ${client.healthScore ?? '-'}`,
        dueDate: null,
        client
      }))
    });
  }

  if (isCommunityManager && clientsWithoutPlan.length > 0) {
    focusCards.push({
      id: 'cm-content-plan',
      type: 'ESTRATEGIA',
      severity: 'info',
      title: `${clientsWithoutPlan.length} ${clientsWithoutPlan.length === 1 ? 'parrilla por fortalecer' : 'parrillas por fortalecer'}`,
      content: 'Revisa objetivos, mercado y calendario para anticipar necesidades de contenido antes de que se vuelvan urgencias.',
      actionLabel: 'Abrir parrillas',
      actionUrl: '/parrillas',
      items: clientsWithoutPlan.slice(0, 5).map((client) => ({
        id: client.id,
        title: client.name,
        status: client.contentPlanStatus || 'SIN_PARRILLA',
        dueDate: null,
        client
      }))
    });
  }

  if (undocumentedTasks.length > 0) {
    const taskLabel = undocumentedTasks.length === 1
      ? '1 tarea creada por ti esta semana no tiene un comentario con contexto'
      : `${undocumentedTasks.length} tareas creadas por ti esta semana no tienen comentarios con contexto`;
    focusCards.push({
      id: 'habit-document-progress',
      type: 'HABITO',
      severity: 'info',
      title: 'Hay tareas sin contexto',
      content: `${taskLabel}. Un update breve evita fricción operativa.`,
      actionLabel: 'Actualizar contexto',
      actionUrl: '/gestion',
      items: undocumentedTasks.slice(0, 5).map(formatTask)
    });
  }

  if (focusCards.length === 0) {
    focusCards.push({
      id: 'clear-focus',
      type: 'OPORTUNIDAD',
      severity: 'success',
      title: 'Foco claro',
      content: 'No se detectan bloqueos fuertes. Buen momento para adelantar próximos vencimientos o documentar aprendizajes.',
      actionLabel: 'Ver próximos pendientes',
      actionUrl: '/gestion'
    });
  }

  return {
    member: {
      id: member.id,
      userId: member.userId,
      name: member.name,
      role: member.role,
      avatarUrl: member.avatarUrl || null,
      isCommunityManager
    },
    stats: {
      active: activeTasks.length,
      overdue: overdueTasks.length,
      returned: returnedTasks.length,
      priority: activeTasks.filter((task) => task.isPriority || task.priority === 'URGENTE' || task.priority === 'ALTA').length,
      dueToday: todayTasks.length,
      completedToday: memberAchievementsToday.length
    },
    focusCards: focusCards.slice(0, 5),
    todayTasks: todayTasks.map(formatTask),
    overdueTasks: overdueTasks.map(formatTask),
    returnedTasks: returnedTasks.map((task) => ({
      ...formatTask(task),
      lastFeedback: newestExternalFeedback(task, member.userId)
    })),
    upcomingTasks: upcomingTasks.map(formatTask),
    achievements: achievements.map(formatTask),
    clients: isCommunityManager ? assignedClients : [],
    weeklyHabit,
    announcements: member.announcements || []
  };
};

export const getPersonalDashboard = async ({ requester, targetUserId }) => {
  const userId = targetUserId || requester?.userId;
  assertPersonalDashboardAccess({ requester, targetUserId: userId });
  const dashboardNow = new Date();
  const dashboardDayWindow = getBogotaDayWindow(dashboardNow);
  const dashboardTaskInclude = {
    assignee: {
      select: { id: true, name: true, role: true, avatarUrl: true }
    },
    client: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        healthRecords: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { score: true }
        }
      }
    },
    taskComments: {
      where: { authorId: { not: userId } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
        content: true,
        authorId: true,
        createdAt: true
      }
    }
  };

  const member = await prisma.teamMember.findUnique({
    where: { userId },
    include: {
      responsibleClients: {
        where: { isArchived: false },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          healthRecords: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              score: true,
              contentStatus: true,
              reportStatus: true
            }
          },
          contentPlans: {
            where: { deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              month: true,
              year: true,
              updatedAt: true
            }
          },
          nativeTasks: {
            where: { status: { in: ACTIVE_STATUSES } },
            select: {
              id: true,
              status: true,
              dueDate: true
            }
          }
        }
      },
      nativeTasks: {
        where: {
          OR: [
            { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
            {
              status: 'REALIZADA',
              completedAt: {
                gte: dashboardDayWindow.start,
                lt: dashboardDayWindow.end
              }
            }
          ]
        },
        include: dashboardTaskInclude,
        orderBy: [
          { dueDate: 'asc' },
          { updatedAt: 'desc' }
        ]
      }
    }
  });

  if (!member) {
    const error = new Error('Colaborador no encontrado para este usuario.');
    error.statusCode = 404;
    throw error;
  }

  const announcementLookback = new Date(dashboardNow.getTime() - (8 * 24 * 60 * 60 * 1000));
  const challengeWeekWindow = getBogotaWeekWindow(dashboardNow);
  const [announcements, globalAchievements, createdTasks, authoredAnnouncements, authoredOperationalEvents, returnedTasks] = await Promise.all([
    getDashboardAnnouncements(userId),
    prisma.task.findMany({
      where: {
        status: 'REALIZADA',
        completedAt: { not: null }
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            role: true,
            avatarUrl: true
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            healthRecords: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { score: true }
            }
          }
        }
      }
    }),
    isCommunityManagerRole(member.role)
      ? prisma.task.findMany({
        where: {
          ...buildContextChallengeTaskWhere({ userId, now: dashboardNow })
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          dueDate: true,
          completedAt: true,
          creatorId: true,
          assigneeId: true,
          isPriority: true,
          priority: true,
          isSpecial: true,
          assignee: {
            select: { id: true, name: true, role: true, avatarUrl: true }
          },
          client: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              healthRecords: {
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { score: true }
              }
            }
          },
          taskComments: {
            where: {
              authorId: userId,
              type: 'human'
            },
            select: {
              id: true,
              authorId: true,
              content: true,
              type: true
            }
          }
        }
      })
      : Promise.resolve([]),
    isProjectManagerRole(member.role)
      ? Promise.all([
        prisma.globalAnnouncement.findMany({
          where: {
            authorId: userId,
            createdAt: { gte: announcementLookback }
          },
          select: { id: true, createdAt: true }
        }),
        prisma.notification.findMany({
          where: {
            relatedId: userId,
            type: 'TEAM_ANNOUNCEMENT',
            createdAt: { gte: announcementLookback }
          },
          select: { id: true, createdAt: true }
        })
      ]).then(([globalAnnouncements, personalAnnouncements]) => [
        ...globalAnnouncements.map((announcement) => ({ ...announcement, scope: 'GLOBAL' })),
        ...personalAnnouncements.map((announcement) => ({ ...announcement, scope: 'MEMBER' }))
      ])
      : Promise.resolve([]),
    isAccountantRole(member.role)
      ? prisma.operationalEvent.findMany({
        where: {
          createdById: userId,
          createdAt: {
            gte: challengeWeekWindow.start,
            lt: challengeWeekWindow.end
          }
        },
        select: { id: true, createdAt: true }
      })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: {
        creatorId: userId,
        status: 'DEVUELTA'
      },
      include: dashboardTaskInclude,
      orderBy: [
        { returnedAt: 'desc' },
        { updatedAt: 'desc' }
      ]
    })
  ]);

  return buildPersonalDashboard({
    member: { ...member, announcements, createdTasks, authoredAnnouncements, authoredOperationalEvents, returnedTasks },
    globalAchievements,
    now: dashboardNow
  });
};

export const getDashboardAnnouncements = async (userId, { db = prisma } = {}) => {
  const [globalAnnouncements, targetedAnnouncements] = await Promise.all([
    db.globalAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    db.notification.findMany({
      where: {
        userId,
        type: 'TEAM_ANNOUNCEMENT'
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  ]);

  const authorIds = [...new Set(targetedAnnouncements.map((announcement) => announcement.relatedId).filter(Boolean))];
  const authors = authorIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true, avatarUrl: true }
    })
    : [];
  const authorsById = new Map(authors.map((author) => [author.id, author]));

  return [
    ...globalAnnouncements.map((announcement) => ({
      id: announcement.id,
      scope: 'GLOBAL',
      content: announcement.content,
      type: announcement.type,
      createdAt: announcement.createdAt,
      isRead: true
    })),
    ...targetedAnnouncements.map((announcement) => ({
      id: announcement.id,
      scope: 'MEMBER',
      content: announcement.message,
      type: announcement.type,
      createdAt: announcement.createdAt,
      isRead: announcement.isRead,
      author: authorsById.get(announcement.relatedId) || null
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const createDashboardAnnouncement = async (
  { requester, scope, content, targetUserId },
  { db = prisma, notificationCreator = createNotification } = {}
) => {
  assertDashboardManagerAccess(requester);

  const cleanContent = sanitizeDashboardAnnouncementContent(content);
  if (!hasAnnouncementText(cleanContent)) {
    const error = new Error('El anuncio no puede estar vacio.');
    error.statusCode = 400;
    throw error;
  }

  if (scope === 'GLOBAL') {
    const announcement = await db.globalAnnouncement.create({
      data: {
        content: cleanContent,
        type: 'DASHBOARD',
        authorId: requester?.userId || null
      }
    });

    if (typeof db.user?.findMany === 'function') {
      const recipients = await db.user.findMany({
        where: {
          isActive: true,
          id: requester?.userId ? { not: requester.userId } : undefined
        },
        select: { id: true }
      });
      const recipientUsers = recipients.filter(({ id }) => id !== requester?.userId);
      const deliveryResults = await Promise.allSettled(recipientUsers.map(({ id: userId }) => notificationCreator({
        userId,
        message: cleanContent,
        type: 'ANNOUNCEMENT_GLOBAL',
        relatedId: announcement.id,
        resourceId: 'dashboard',
        url: '/'
      }, { db })));
      const failedDeliveries = deliveryResults.filter(({ status }) => status === 'rejected');
      if (failedDeliveries.length > 0) {
        console.error(`[PersonalDashboardService] ${failedDeliveries.length} global announcement notifications failed.`);
      }
    }

    return announcement;
  }

  if (scope === 'MEMBER') {
    if (!targetUserId) {
      const error = new Error('Selecciona una persona para el anuncio.');
      error.statusCode = 400;
      throw error;
    }

    return notificationCreator({
      userId: targetUserId,
      message: cleanContent,
      type: 'TEAM_ANNOUNCEMENT',
      relatedId: requester?.userId || null,
      resourceId: 'dashboard',
      url: '/'
    }, { db });
  }

  const error = new Error('Alcance de anuncio no soportado.');
  error.statusCode = 400;
  throw error;
};

const assertSupportedAnnouncementScope = (scope) => {
  if (!['GLOBAL', 'MEMBER'].includes(scope)) {
    const error = new Error('Alcance de anuncio no soportado.');
    error.statusCode = 400;
    throw error;
  }
};

const findMemberAnnouncement = async (db, id) => {
  const announcement = await db.notification.findFirst({
    where: {
      id,
      type: 'TEAM_ANNOUNCEMENT'
    }
  });

  if (!announcement) {
    const error = new Error('El anuncio personal no existe.');
    error.statusCode = 404;
    throw error;
  }

  return announcement;
};

export const updateDashboardAnnouncement = async ({ requester, scope, id, content }, { db = prisma } = {}) => {
  assertDashboardManagerAccess(requester);
  assertSupportedAnnouncementScope(scope);

  const cleanContent = sanitizeDashboardAnnouncementContent(content);
  if (!hasAnnouncementText(cleanContent)) {
    const error = new Error('El anuncio no puede estar vacio.');
    error.statusCode = 400;
    throw error;
  }

  if (scope === 'GLOBAL') {
    return db.globalAnnouncement.update({
      where: { id },
      data: { content: cleanContent }
    });
  }

  await findMemberAnnouncement(db, id);
  return db.notification.update({
    where: { id },
    data: { message: cleanContent }
  });
};

export const deleteDashboardAnnouncement = async ({ requester, scope, id }, { db = prisma } = {}) => {
  assertDashboardManagerAccess(requester);
  assertSupportedAnnouncementScope(scope);

  if (scope === 'GLOBAL') {
    return db.globalAnnouncement.delete({ where: { id } });
  }

  await findMemberAnnouncement(db, id);
  return db.notification.delete({ where: { id } });
};

export const assignClientOwner = async ({ requester, clientId, memberId }) => {
  assertDashboardManagerAccess(requester);

  if (!clientId || !memberId) {
    const error = new Error('Cliente y Community Manager son requeridos.');
    error.statusCode = 400;
    throw error;
  }

  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, role: true, userId: true }
  });

  if (!member) {
    const error = new Error('Community Manager no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  if (!isCommunityManagerRole(member.role)) {
    const error = new Error('Solo puedes asignar clientes a personas con rol Community Manager.');
    error.statusCode = 400;
    throw error;
  }

  return prisma.client.update({
    where: { id: clientId },
    data: { responsibleId: member.id },
    include: {
      responsible: {
        select: { id: true, name: true, role: true, userId: true, avatarUrl: true }
      }
    }
  });
};
