import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';

/**
 * ContentPlan Services
 */
export const getContentPlans = async (clientId) => {
  const where = { deletedAt: null };
  if (clientId) where.clientId = clientId;

  return await prisma.contentPlan.findMany({
    where,
    include: {
      client: {
        select: { id: true, name: true, slug: true }
      },
      _count: {
        select: { items: true }
      }
    },
    orderBy: [
      { year: 'desc' },
      { month: 'desc' }
    ]
  });
};

export const getContentPlanById = async (id) => {
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    include: {
      client: true,
      owner: true,
      items: {
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
  return plan;
};

export const getContentPlanBySlugAndPeriod = async (clientSlug, month, year) => {
  const plan = await prisma.contentPlan.findFirst({
    where: {
      client: { slug: clientSlug },
      month: parseInt(month),
      year: parseInt(year),
      deletedAt: null
    },
    include: {
      client: true,
      owner: true,
      items: {
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
    referenceUrl: item.mediaUrl,
    isPriority: !!isPriority,
    isSpecial: !!isSpecial,
    contentItemId: itemId // Explicitly link it
  });

  // Link Task to ContentItem via contentItemId and update status to EN_PRODUCCION
  return await prisma.contentItem.update({
    where: { id: itemId },
    data: {
      status: 'EN_PRODUCCION'
    },
    include: {
      tasks: {
        where: { id: task.id }
      }
    }
  });
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
