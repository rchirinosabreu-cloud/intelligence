import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';

/**
 * ContentPlan Services
 */
export const getContentPlans = async (clientId) => {
  try {
    const where = { deletedAt: null };
    if (clientId) where.clientId = clientId;

    console.log(`[Service] getContentPlans: Fetching plans for clientId=${clientId || 'ALL'}`);

    const plans = await prisma.contentPlan.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, slug: true }
        },
        _count: {
          select: { contentItems: true }
        }
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ]
    });

    console.log(`[Service] getContentPlans: Found ${plans.length} plans`);

    // Map for frontend compatibility: contentItems -> items
    return plans.map(plan => ({
      ...plan,
      _count: {
        ...plan._count,
        items: plan._count?.contentItems || 0
      }
    }));
  } catch (error) {
    console.error(`[Service] Error in getContentPlans (clientId: ${clientId}):`, error);
    throw error;
  }
};

export const getContentPlanById = async (id) => {
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    include: {
      client: true,
      owner: true,
      contentItems: {
        where: { deletedAt: null },
        include: {
          tasks: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { publishDate: 'asc' }
      }
    }
  });

  if (plan && plan.deletedAt) return null;

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    return {
      ...plan,
      items: plan.contentItems || []
    };
  }

  return plan;
};

export const getContentPlanBySlugAndPeriod = async (clientSlug, month, year) => {
  const parsedMonth = parseInt(month);
  const parsedYear = parseInt(year);

  if (isNaN(parsedMonth) || isNaN(parsedYear)) {
    console.error(`[Service] Invalid period for getContentPlanBySlugAndPeriod: month=${month}, year=${year}`);
    return null;
  }

  const plan = await prisma.contentPlan.findFirst({
    where: {
      client: { slug: clientSlug },
      month: parsedMonth,
      year: parsedYear,
      deletedAt: null
    },
    include: {
      client: true,
      owner: true,
      contentItems: {
        where: { deletedAt: null },
        include: {
          tasks: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { publishDate: 'asc' }
      }
    }
  });

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    return {
      ...plan,
      items: plan.contentItems || []
    };
  }

  return plan;
};

export const createContentPlan = async (data) => {
  const { clientId, month, year, status } = data;
  return await prisma.contentPlan.create({
    data: {
      clientId,
      month,
      year,
      status: status || 'PLANIFICACION'
    },
    include: {
      client: true
    }
  });
};

export const updateContentPlan = async (id, data) => {
  return await prisma.contentPlan.update({
    where: { id },
    data
  });
};

export const generateShareToken = async (id) => {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return await prisma.contentPlan.update({
    where: { id },
    data: { shareToken: token }
  });
};

export const getContentPlanByToken = async (token) => {
  const plan = await prisma.contentPlan.findUnique({
    where: { shareToken: token },
    include: {
      client: true,
      contentItems: {
        where: { deletedAt: null },
        orderBy: { publishDate: 'asc' }
      }
    }
  });

  if (plan && plan.deletedAt) return null;

  if (plan) {
    return {
      ...plan,
      items: plan.contentItems || []
    };
  }

  return plan;
};

export const deleteContentPlan = async (id) => {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Soft delete items
    await tx.contentItem.updateMany({
      where: { planId: id },
      data: { deletedAt: now }
    });
    // Soft delete plan
    return await tx.contentPlan.update({
      where: { id },
      data: { deletedAt: now }
    });
  });
};

/**
 * Production / Kanban Link
 */
export const sendItemToKanban = async (itemId, creatorId, executionData = {}) => {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    include: {
      plan: {
        include: { client: true }
      },
      tasks: {
        where: { status: { not: 'REALIZADA' } }
      }
    }
  });

  if (!item) throw new Error('Content item not found');

  // Check if there's already an active task
  if (item.tasks.length > 0) {
    throw new Error('Item already has an active task in Kanban');
  }

  const { assigneeId, dueDate, isPriority, isSpecial } = executionData;

  // Create Task
  // We include a clean comment for the creator to see deep links if needed
  const commentText = `Pieza generada desde Parrilla. Referencia: ${item.mediaUrl || 'N/A'}`;

  const task = await createTask({
    title: `[Producción] ${item.format}: ${item.objective}`,
    dueDate: dueDate ? new Date(dueDate) : item.publishDate,
    assigneeId: assigneeId || null,
    creatorId,
    comments: commentText,
    status: 'PENDIENTE',
    clientId: item.plan.clientId,
    referenceUrl: Array.isArray(item.mediaUrl) ? item.mediaUrl[0] : item.mediaUrl,
    isPriority: !!isPriority,
    isSpecial: !!isSpecial,
    contentItemId: itemId // Explicitly link it
  });

  // Link Task to ContentItem via contentItemId and update status to EN_PRODUCCION
  const updatedItem = await prisma.contentItem.update({
    where: { id: itemId },
    data: {
      status: 'EN_PRODUCCION'
    },
    include: {
      plan: {
        select: { id: true, month: true, year: true, client: { select: { slug: true } } }
      },
      tasks: {
        where: { id: task.id },
        include: {
          assignee: true,
          creator: true
        }
      }
    }
  });

  // Map for frontend compatibility to ensure plan info is present at task level
  if (updatedItem.tasks?.[0]) {
    const t = updatedItem.tasks[0];
    updatedItem.tasks[0] = {
      ...t,
      plan: {
        id: updatedItem.plan.id,
        slug: updatedItem.plan.client.slug,
        month: updatedItem.plan.month,
        year: updatedItem.plan.year
      }
    };
  }

  return updatedItem;
};

/**
 * ContentItem Services
 */
export const getContentItemsByPlan = async (planId) => {
  return await prisma.contentItem.findMany({
    where: {
      planId,
      deletedAt: null
    },
    include: {
      tasks: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { publishDate: 'asc' }
  });
};

export const createContentItem = async (data) => {
  return await prisma.contentItem.create({
    data
  });
};

export const updateContentItem = async (id, data) => {
  return await prisma.contentItem.update({
    where: { id },
    data
  });
};

export const deleteContentItem = async (id) => {
  return await prisma.contentItem.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
};

export const addClientComment = async (itemId, comment) => {
  const item = await prisma.contentItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Content item not found');

  const now = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const updatedComments = item.comments
    ? `${item.comments}\n\n[Cliente - ${now}]: ${comment}`
    : `[Cliente - ${now}]: ${comment}`;

  return await prisma.contentItem.update({
    where: { id: itemId },
    data: {
      comments: updatedComments,
      status: 'DEVUELTO'
    }
  });
};
