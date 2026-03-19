import prisma from '../lib/prisma.js';

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
