import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';

/**
 * ContentPlan Services
 */
export const getContentPlans = async (clientId) => {
  return await prisma.contentPlan.findMany({
    where: clientId ? { clientId } : {},
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
  return await prisma.contentPlan.findUnique({
    where: { id },
    include: {
      client: true,
      items: {
        orderBy: { publishDate: 'asc' }
      }
    }
  });
};

export const createContentPlan = async (data) => {
  const { clientId, month, year, status } = data;
  return await prisma.contentPlan.create({
    data: {
      clientId,
      month,
      year,
      status: status || 'PLANIFICACION'
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
  return await prisma.contentPlan.delete({
    where: { id }
  });
};

/**
 * Production / Kanban Link
 */
export const sendItemToKanban = async (itemId, creatorId) => {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    include: {
      plan: {
        include: { client: true }
      }
    }
  });

  if (!item) throw new Error('Content item not found');
  if (item.taskId) throw new Error('Item already in production');

  // Create Task
  const task = await createTask({
    title: `[${item.format}] ${item.objective} - ${item.plan.client.name}`,
    dueDate: item.publishDate,
    assigneeId: null, // Initial unassigned
    creatorId,
    comments: `Copy: ${item.copyText}\n\nCaption: ${item.captionText}\n\nMedia: ${item.mediaUrl || 'N/A'}`,
    status: 'PENDIENTE',
    clientId: item.plan.clientId,
    referenceUrl: item.mediaUrl
  });

  // Link Task to ContentItem
  return await prisma.contentItem.update({
    where: { id: itemId },
    data: { taskId: task.id },
    include: { task: true }
  });
};

/**
 * ContentItem Services
 */
export const getContentItemsByPlan = async (planId) => {
  return await prisma.contentItem.findMany({
    where: { planId },
    include: {
      task: true
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
  return await prisma.contentItem.delete({
    where: { id }
  });
};
