import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';
import { uploadToS3, deleteFromS3 } from './s3Service.js';
import { randomBytes } from 'node:crypto';

let strategicObjectivesColumnExists = null;
let contentItemFinalAssetColumnsExist = null;

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

const contentItemBaseSelect = {
  id: true,
  planId: true,
  objective: true,
  format: true,
  copyText: true,
  captionText: true,
  publishDate: true,
  mediaUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assetsLinks: true,
  internalNotes: true,
  comments: true,
  deletedAt: true
};

const hasContentItemFinalAssetColumns = async () => {
  if (contentItemFinalAssetColumnsExist !== null) return contentItemFinalAssetColumnsExist;

  const result = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ContentItem'
      AND column_name IN ('finalAssetKey', 'finalAssetName', 'finalAssetMimeType', 'finalAssetSize')
  `;

  const hasColumns = Number(result?.[0]?.count || 0) === 4;
  if (hasColumns) contentItemFinalAssetColumnsExist = true;
  return hasColumns;
};

const getContentItemSelect = async (extra = {}) => {
  const hasFinalAssetColumns = await hasContentItemFinalAssetColumns();
  return {
    ...contentItemBaseSelect,
    ...(hasFinalAssetColumns ? {
      finalAssetKey: true,
      finalAssetName: true,
      finalAssetMimeType: true,
      finalAssetSize: true
    } : {}),
    ...extra
  };
};

const normalizeContentItem = (item) => {
  if (!item) return item;
  return {
    ...item,
    finalAssetKey: item.finalAssetKey ?? null,
    finalAssetName: item.finalAssetName ?? null,
    finalAssetMimeType: item.finalAssetMimeType ?? null,
    finalAssetSize: item.finalAssetSize ?? null
  };
};

const filterContentItemData = async (data) => {
  if (!data) return data;
  if (await hasContentItemFinalAssetColumns()) return data;

  const {
    finalAssetKey,
    finalAssetName,
    finalAssetMimeType,
    finalAssetSize,
    ...safeData
  } = data;

  return safeData;
};

const getPlanContentItemsSelect = async () => ({
  where: { deletedAt: null },
  select: await getContentItemSelect({
    tasks: {
      orderBy: { createdAt: 'desc' }
    }
  }),
  orderBy: { publishDate: 'asc' }
});

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
      contentItems: await getPlanContentItemsSelect()
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
      contentItems: await getPlanContentItemsSelect()
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
  const token = randomBytes(32).toString('base64url');
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
        select: await getContentItemSelect(),
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
    select: await getContentItemSelect({
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
    })
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
    select: await getContentItemSelect({
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
    })
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
  const items = await prisma.contentItem.findMany({
    where: {
      planId,
      deletedAt: null
    },
    select: await getContentItemSelect({
      tasks: {
        orderBy: { createdAt: 'desc' }
      }
    }),
    orderBy: { publishDate: 'asc' }
  });

  return items.map(normalizeContentItem);
};

export const createContentItem = async (data) => {
  const item = await prisma.contentItem.create({
    data: await filterContentItemData(data),
    select: await getContentItemSelect()
  });

  return normalizeContentItem(item);
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
    data: await filterContentItemData(data),
    select: await getContentItemSelect()
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

  return normalizeContentItem(updatedItem);
};

export const deleteContentItem = async (id) => {
  return await prisma.contentItem.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true }
  });
};

export const uploadContentItemFinalAsset = async (itemId, file) => {
  if (!file) throw new Error('No file uploaded');
  if (!/^image\/|^video\//.test(file.mimetype || '')) {
    throw new Error('Solo se permiten imagenes o videos para la pieza final');
  }
  if (!(await hasContentItemFinalAssetColumns())) {
    throw new Error('La base de datos aun no tiene habilitados los adjuntos finales');
  }

  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      finalAssetKey: true,
      plan: {
        select: {
          id: true,
          month: true,
          year: true,
          client: { select: { slug: true } }
        }
      }
    }
  });

  if (!item) throw new Error('Content item not found');
  const previousAssetKey = item.finalAssetKey;

  const upload = await uploadToS3(
    file,
    `content-plans/${item.plan.client.slug}/${item.plan.year}-${String(item.plan.month).padStart(2, '0')}/${item.id}/final`
  );

  const updatedItem = await updateContentItem(itemId, {
    finalAssetKey: upload.key,
    finalAssetName: upload.name,
    finalAssetMimeType: upload.mimeType,
    finalAssetSize: upload.size
  });

  if (previousAssetKey && previousAssetKey !== upload.key) {
    deleteFromS3(previousAssetKey).catch(error => {
      console.error('[Service] Failed to delete replaced final asset:', error.message);
    });
  }

  return updatedItem;
};

export const getContentItemFinalAsset = async (itemId) => {
  if (!(await hasContentItemFinalAssetColumns())) return null;

  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      finalAssetKey: true,
      finalAssetName: true,
      finalAssetMimeType: true,
      finalAssetSize: true
    }
  });

  if (!item?.finalAssetKey) return null;
  return item;
};

export const deleteContentItemFinalAsset = async (itemId) => {
  if (!(await hasContentItemFinalAssetColumns())) {
    throw new Error('La base de datos aun no tiene habilitados los adjuntos finales');
  }

  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      finalAssetKey: true
    }
  });

  if (!item) throw new Error('Content item not found');

  if (item.finalAssetKey) {
    await deleteFromS3(item.finalAssetKey);
  }

  return await updateContentItem(itemId, {
    finalAssetKey: null,
    finalAssetName: null,
    finalAssetMimeType: null,
    finalAssetSize: null
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
