import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';

let strategicObjectivesColumnExists = null;

const contentPlanBaseSelect = {
  id: true,
  clientId: true,
  month: true,
  year: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  ownerId: true,
  internalNotes: true,
  shareToken: true
};

const hasStrategicObjectivesColumn = async () => {
  if (strategicObjectivesColumnExists !== null) return strategicObjectivesColumnExists;

  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ContentPlan'
        AND column_name = 'strategicObjectives'
    ) AS "exists"
  `;

  strategicObjectivesColumnExists = Boolean(result?.[0]?.exists);
  return strategicObjectivesColumnExists;
};

const getContentPlanSelect = async (extra = {}) => {
  const hasColumn = await hasStrategicObjectivesColumn();
  return {
    ...contentPlanBaseSelect,
    ...(hasColumn ? { strategicObjectives: true } : {}),
    ...extra
  };
};

const normalizeContentPlan = (plan) => {
  if (!plan) return plan;
  return {
    ...plan,
    strategicObjectives: plan.strategicObjectives ?? ''
  };
};

const filterContentPlanData = async (data) => {
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'strategicObjectives')) return data;
  if (await hasStrategicObjectivesColumn()) return data;

  const { strategicObjectives, ...safeData } = data;
  return safeData;
};

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
      select: await getContentPlanSelect({
        client: {
          select: { id: true, name: true, slug: true }
        },
        _count: {
          select: { contentItems: true }
        }
      }),
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ]
    });

    console.log(`[Service] getContentPlans: Found ${plans.length} plans`);

    // Map for frontend compatibility: contentItems -> items
    return plans.map(plan => ({
      ...normalizeContentPlan(plan),
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
    select: await getContentPlanSelect({
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
    })
  });

  if (plan && plan.deletedAt) return null;

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    return {
      ...normalizeContentPlan(plan),
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
    orderBy: { updatedAt: 'desc' },
    select: await getContentPlanSelect({
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
    })
  });

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    return {
      ...normalizeContentPlan(plan),
      items: plan.contentItems || []
    };
  }

  return plan;
};

export const createContentPlan = async (data) => {
  const { clientId, month, year, status, strategicObjectives } = data;
  const hasStrategicColumn = await hasStrategicObjectivesColumn();

  // Idempotency Shield: Check for existing plans for this period
  const existingPlan = await prisma.contentPlan.findFirst({
    where: { clientId, month, year },
    orderBy: { createdAt: 'desc' },
    select: await getContentPlanSelect()
  });

  if (existingPlan) {
    // Case A: Plan is soft-deleted -> Restore it
    if (existingPlan.deletedAt) {
      console.log(`[Service] createContentPlan: Restoring soft-deleted plan ${existingPlan.id}`);
      return await prisma.contentPlan.update({
        where: { id: existingPlan.id },
        data: {
          deletedAt: null,
          status: status || 'PLANIFICACION',
          ...(hasStrategicColumn ? { strategicObjectives: strategicObjectives ?? existingPlan.strategicObjectives } : {})
        },
        select: await getContentPlanSelect({ client: true })
      });
    }
    // Case B: Plan is active -> Return it (idempotency)
    console.log(`[Service] createContentPlan: Returning existing active plan ${existingPlan.id}`);
    return await prisma.contentPlan.findUnique({
      where: { id: existingPlan.id },
      select: await getContentPlanSelect({ client: true })
    });
  }

  try {
    return await prisma.contentPlan.create({
      data: {
        clientId,
        month,
        year,
        status: status || 'PLANIFICACION',
        ...(hasStrategicColumn ? { strategicObjectives: strategicObjectives || null } : {})
      },
      select: await getContentPlanSelect({
        client: true
      })
    });
  } catch (error) {
    // P2002: Unique constraint violation (Race Condition)
    if (error.code === 'P2002') {
      console.warn(`[Service] createContentPlan: Conflict detected (P2002). Returning existing plan.`);
      return await prisma.contentPlan.findFirst({
        where: { clientId, month, year, deletedAt: null },
        select: await getContentPlanSelect({ client: true })
      });
    }
    throw error;
  }
};

export const updateContentPlan = async (id, data) => {
  return await prisma.contentPlan.update({
    where: { id },
    data: await filterContentPlanData(data),
    select: await getContentPlanSelect()
  });
};

export const generateShareToken = async (id) => {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return await prisma.contentPlan.update({
    where: { id },
    data: { shareToken: token },
    select: { shareToken: true }
  });
};

export const getContentPlanByToken = async (token) => {
  const plan = await prisma.contentPlan.findUnique({
    where: { shareToken: token },
    select: await getContentPlanSelect({
      client: true,
      contentItems: {
        where: { deletedAt: null },
        orderBy: { publishDate: 'asc' }
      }
    })
  });

  if (plan && plan.deletedAt) return null;

  if (plan) {
    return {
      ...normalizeContentPlan(plan),
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
      data: { deletedAt: now },
      select: { id: true }
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
        select: {
          id: true,
          clientId: true,
          month: true,
          year: true,
          client: true
        }
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
  const task = await createTask({
    title: `[Producción] ${item.format}: ${item.objective}`,
    dueDate: dueDate ? new Date(dueDate) : item.publishDate,
    assigneeId: assigneeId || null,
    creatorId,
    comments: "",
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
  // Ensure publishDate is handled correctly
  if (data.publishDate) {
    // If it's already a string in YYYY-MM-DD format, we convert it to a UTC Date object
    // to prevent Prisma/Postgres from applying local timezone offsets.
    if (typeof data.publishDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.publishDate)) {
      data.publishDate = new Date(`${data.publishDate}T00:00:00Z`);
    } else {
      data.publishDate = new Date(data.publishDate);
    }
  }

  const updatedItem = await prisma.contentItem.update({
    where: { id },
    data
  });

  // --- AUTOMATION: Auto-finalize ContentPlan ---
  if (data.status === 'PUBLICADO') {
    try {
        const planItems = await prisma.contentItem.findMany({
            where: { planId: updatedItem.planId, deletedAt: null }
        });

        const allPublished = planItems.length > 0 && planItems.every(item => item.status === 'PUBLICADO');

        if (allPublished) {
            console.log(`[Service] updateContentItem: All items published. Auto-finalizing plan ${updatedItem.planId}`);
            await prisma.contentPlan.update({
                where: { id: updatedItem.planId },
                data: { status: 'FINALIZADO' },
                select: { id: true }
            });
        }
    } catch (automationErr) {
        console.error("[Service] ContentPlan Auto-finalization failed:", automationErr);
    }
  }

  return updatedItem;
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
