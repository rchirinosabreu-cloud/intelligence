import prisma from '../lib/prisma.js';

const ACTIVE_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

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
  isPriority: task.isPriority,
  priority: task.priority,
  isSpecial: task.isSpecial,
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

const summarizeTaskCounts = (tasks, now) => {
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
  return {
    activeTasks: activeTasks.length,
    returnedTasks: activeTasks.filter((task) => task.status === 'DEVUELTA').length,
    overdueTasks: activeTasks.filter((task) => task.dueDate && new Date(task.dueDate) < now).length
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

export const buildPersonalDashboard = ({ member, now = new Date() }) => {
  const tasks = Array.isArray(member?.nativeTasks) ? member.nativeTasks : [];
  const isCommunityManager = isCommunityManagerRole(member?.role);
  const assignedClients = buildAssignedClientSummaries(member?.responsibleClients || [], now);
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
  const overdueTasks = activeTasks.filter((task) => {
    const dueDate = toDate(task.dueDate);
    return dueDate && dueDate < now;
  });
  const returnedTasks = activeTasks.filter((task) => task.status === 'DEVUELTA');
  const todayTasks = activeTasks.filter((task) => isSameBogotaDay(toDate(task.dueDate), now));
  const upcomingTasks = activeTasks
    .filter((task) => {
      const dueDate = toDate(task.dueDate);
      return dueDate && dueDate > now && !isSameBogotaDay(dueDate, now);
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 8);
  const achievements = tasks
    .filter((task) => task.status === 'REALIZADA' && isSameBogotaDay(toDate(task.completedAt), now))
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .slice(0, 8);

  const focusCards = [];
  if (overdueTasks.length > 0) {
    focusCards.push({
      id: 'overdue-focus',
      type: 'URGENTE',
      severity: overdueTasks.length > 2 ? 'critical' : 'warning',
      title: `${overdueTasks.length} ${overdueTasks.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`,
      content: 'Revisa fechas, cierra lo que ya esté listo o pide apoyo para desbloquear lo pendiente.',
      actionLabel: 'Ver tareas vencidas',
      actionUrl: '/gestion'
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
      actionUrl: '/gestion'
    });
  }

  const undocumentedTasks = activeTasks.filter((task) => (task.taskComments || []).length === 0);
  const clientsNeedingAttention = assignedClients.filter((client) => (client.healthScore ?? 100) < 70 || client.returnedTasks > 0 || client.overdueTasks > 0);
  const clientsWithoutPlan = assignedClients.filter((client) => !client.contentPlanStatus || client.contentStatus === 'SIN_PARRILLA');

  const weeklyHabit = isCommunityManager && assignedClients.length > 0
    ? {
        id: 'lead-account-growth',
        title: 'Llegar con propuestas',
        description: 'Prepara una recomendacion accionable para tus clientes asignados: campana, ajuste de parrilla, oportunidad de comunicacion o mejora basada en resultados.',
        progress: Math.max(0, Math.round(((assignedClients.length - clientsNeedingAttention.length) / Math.max(assignedClients.length, 1)) * 100)),
        targetLabel: 'Clientes con liderazgo preventivo'
      }
    : undocumentedTasks.length > 0
    ? {
        id: 'document-progress',
        title: 'Documentar avances',
        description: 'Agrega contexto a tus tareas activas para que el equipo pueda entender el estado sin perseguirte.',
        progress: Math.max(0, Math.round(((activeTasks.length - undocumentedTasks.length) / Math.max(activeTasks.length, 1)) * 100)),
        targetLabel: 'Tareas activas con contexto'
      }
    : {
        id: 'keep-context-fresh',
        title: 'Mantener contexto fresco',
        description: 'Sostén el hábito de actualizar tareas cuando cambie el estado, el insumo o la fecha.',
        progress: 100,
        targetLabel: 'Contexto actualizado'
      };

  if (isCommunityManager && clientsNeedingAttention.length > 0) {
    focusCards.push({
      id: 'cm-client-health',
      type: 'OPORTUNIDAD',
      severity: clientsNeedingAttention.some((client) => (client.healthScore ?? 100) < 60 || client.overdueTasks > 0) ? 'warning' : 'info',
      title: `${clientsNeedingAttention.length} ${clientsNeedingAttention.length === 1 ? 'cliente pide liderazgo' : 'clientes piden liderazgo'}`,
      content: 'Lleva a la proxima revision una propuesta, no solo una lista de pendientes: objetivo, insight y siguiente accion.',
      actionLabel: 'Ver mis clientes',
      actionUrl: '/clientes'
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
      actionUrl: '/parrillas'
    });
  }

  if (undocumentedTasks.length > 0) {
    focusCards.push({
      id: 'habit-document-progress',
      type: 'HABITO',
      severity: 'info',
      title: 'Hay tareas sin contexto',
      content: `${undocumentedTasks.length} tareas activas no tienen comentarios. Un update breve evita fricción operativa.`,
      actionLabel: 'Actualizar contexto',
      actionUrl: '/gestion'
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
      completedToday: achievements.length
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
    clients: assignedClients.length > 0 ? assignedClients : buildClientSummaries(activeTasks, now),
    weeklyHabit,
    announcements: member.announcements || []
  };
};

export const getPersonalDashboard = async ({ requester, targetUserId }) => {
  const userId = targetUserId || requester?.userId;
  assertPersonalDashboardAccess({ requester, targetUserId: userId });

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
        include: {
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
            orderBy: { createdAt: 'desc' },
            select: {
              content: true,
              authorId: true,
              createdAt: true
            }
          }
        },
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

  const announcements = await getDashboardAnnouncements(userId);

  return buildPersonalDashboard({ member: { ...member, announcements } });
};

export const getDashboardAnnouncements = async (userId) => {
  const [globalAnnouncements, targetedAnnouncements] = await Promise.all([
    prisma.globalAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    }),
    prisma.notification.findMany({
      where: {
        userId,
        type: 'TEAM_ANNOUNCEMENT'
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

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
      isRead: announcement.isRead
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
};

export const createDashboardAnnouncement = async ({ requester, scope, content, targetUserId }) => {
  assertDashboardManagerAccess(requester);

  const cleanContent = content?.trim();
  if (!cleanContent) {
    const error = new Error('El anuncio no puede estar vacio.');
    error.statusCode = 400;
    throw error;
  }

  if (scope === 'GLOBAL') {
    return prisma.globalAnnouncement.create({
      data: {
        content: cleanContent,
        type: 'DASHBOARD'
      }
    });
  }

  if (scope === 'MEMBER') {
    if (!targetUserId) {
      const error = new Error('Selecciona una persona para el anuncio.');
      error.statusCode = 400;
      throw error;
    }

    return prisma.notification.create({
      data: {
        userId: targetUserId,
        message: cleanContent,
        type: 'TEAM_ANNOUNCEMENT',
        resourceId: 'dashboard',
        url: '/'
      }
    });
  }

  const error = new Error('Alcance de anuncio no soportado.');
  error.statusCode = 400;
  throw error;
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
