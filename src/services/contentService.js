import prisma from '../lib/prisma.js';
import { assertActiveTeamMembers } from './teamRosterService.js';
import { recognitionTransaction, prepareTaskRecognition, finishTaskRecognition, recordPlanRecognition } from './recognitionService.js';
import { createTask } from './nativeTaskService.js';
import { uploadToS3, deleteFromS3, createSignedUpload, headS3Object, getS3ObjectBuffer } from './s3Service.js';
import { derivedKeyFor } from './socialImageDerivativeService.js';
import { COVER_MAX_BYTES, coverFileProblem, publicCover, withPublicCover } from '../lib/videoCover.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildLinkedTaskUpdates } from '../lib/contentTaskReciprocity.js';
import { nativePlanProblem } from '../lib/externalPlan.js';
import { assertNotSuspended, suspensionBlock } from './clientSuspensionGate.js';
import {
  FINAL_ASSET_MAX_BYTES, FINAL_ASSET_MAX_FILES, FINAL_ASSET_DIRECT_MAX_BYTES, FINAL_ASSETS_PER_ITEM,
  fileTooLargeMessage, tooManyFilesMessage
} from '../lib/uploadLimits.js';
import { DRIVE_PROVIDER, driveLinkProblem, parseDriveFileId } from '../lib/driveLinks.js';
import { finalAssetShapeProblem } from '../lib/finalAssetShape.js';
import { fileContentProblem } from '../lib/fileSignature.js';
import { markContentPlanReviewPending, buildContentPlanReviewPendingData } from './briaContentPlanReviewState.js';
import { resyncItemPublications } from './socialPublishingService.js';
import { queueOwnedStatusProblem, splitPublishTime } from '../lib/socialPublishing.js';
import { itemsNeedingRevisionRequest, shouldRequestRevisionOnNewAsset, REVIEWABLE_ITEM_STATUSES, PUBLISHED_REVIEW_MESSAGE } from '../lib/contentApproval.js';

/** Lo que la pantalla ve de una publicación programada: nunca el token, que ni siquiera vive en esa fila. */
const publicationSelect = {
  select: {
    id: true, socialAccountId: true, platform: true, status: true, scheduledAt: true, attempts: true, nextAttemptAt: true,
    permalink: true, externalMediaId: true, error: true, publishedAt: true, cancelledAt: true, requestedById: true
  },
  orderBy: { platform: 'asc' }
};

/** Las cuentas conectadas del cliente, sin el token cifrado, para que el editor sepa a qué redes puede programar. */
const clientWithSocialAccounts = {
  include: {
    socialAccounts: {
      select: { id: true, platform: true, externalId: true, displayName: true, pageId: true, isActive: true, isPrimary: true, connectedAt: true, lastError: true },
      orderBy: { platform: 'asc' }
    }
  }
};

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
  shareToken: true,
  briaReviewState: true,
  briaReviewRequestedAt: true,
  briaReviewStartedAt: true,
  briaReviewError: true
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
  publishTime: true,
  socialPageIds: true,
  mediaUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assetsLinks: true,
  internalNotes: true,
  comments: true,
  deletedAt: true,
  revisionRequestedAt: true,
  publications: publicationSelect
};

/**
 * El archivo único de antes de los carruseles se retiró (Rodny, 28 de octubre de 2026): en producción no
 * quedaba ninguna pieza con esas cuatro columnas puestas (`npm run parrillas:pieza-final-antigua`). Siguen
 * en la base, en desuso y sin lectores, así que un `PATCH` con esos campos las escribiría y nadie las
 * mostraría nunca: se quitan de lo que entra.
 */
const RETIRED_FINAL_ASSET_FIELDS = ['finalAssetKey', 'finalAssetName', 'finalAssetMimeType', 'finalAssetSize'];
const withoutRetiredFields = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (!RETIRED_FINAL_ASSET_FIELDS.some((field) => field in data)) return data;
  const safe = { ...data };
  for (const field of RETIRED_FINAL_ASSET_FIELDS) delete safe[field];
  return safe;
};

/** Las columnas de la portada son aditivas, así que se leen solo si el arranque ya las creó. */
let contentItemCoverColumnsExist = null;
const hasContentItemCoverColumns = async () => {
  if (contentItemCoverColumnsExist !== null) return contentItemCoverColumnsExist;
  const result = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ContentItem'
      AND column_name IN ('coverKey', 'coverName', 'coverMimeType', 'coverSize')
  `;
  const hasColumns = Number(result?.[0]?.count || 0) === 4;
  if (hasColumns) contentItemCoverColumnsExist = true;
  return hasColumns;
};

const getContentItemSelect = async (extra = {}) => {
  const hasCoverColumns = await hasContentItemCoverColumns();
  return {
    ...contentItemBaseSelect,
    ...(hasCoverColumns ? {
      coverKey: true,
      coverName: true,
      coverMimeType: true,
      coverSize: true
    } : {}),
    finalAssets: {
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
    },
    ...extra
  };
};

/**
 * La pieza tal como sale hacia la pantalla: la portada como `cover` —su clave de almacenamiento se queda
 * aquí, la pantalla la pide por la API— y sus archivos finales en una sola lista, que es la que define el
 * orden del carrusel publicado.
 */
const normalizeContentItem = (item) => {
  if (!item) return item;
  return { ...withPublicCover(item), finalAssets: item.finalAssets || [] };
};

/**
 * Las piezas que viajan dentro de una parrilla salen con la misma forma que una pieza suelta
 * (Rodny, 26 de octubre de 2026: «la subo y me dice guardada pero no aparece»). El editor lee
 * `item.cover` y aquí nunca se construía, así que una portada recién guardada no aparecía jamás
 * —y la clave del almacenamiento sí viajaba al navegador—.
 */
const planItems = (plan) => (plan?.contentItems || []).map(normalizeContentItem);

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
      client: clientWithSocialAccounts,
      owner: true,
      contentItems: await getPlanContentItemsSelect()
    })
  });

  if (plan && plan.deletedAt) return null;

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    const items = planItems(plan);
    return {
      ...normalizeContentPlan(plan),
      contentItems: items,
      items,
      // Por qué esta parrilla está congelada por una suspensión de cartera, o null. La pantalla lo dice arriba en vez
      // de dejar que la persona escriba media parrilla y se encuentre el 409 al guardar.
      suspendedReason: (await suspensionBlock(prisma, {
        clientId: plan.clientId, year: plan.year, month: plan.month, clientName: plan.client?.name
      }))?.reason || null
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
      client: clientWithSocialAccounts,
      owner: true,
      contentItems: await getPlanContentItemsSelect()
    })
  });

  // Frontend Compatibility: items -> contentItems
  if (plan) {
    const items = planItems(plan);
    return {
      ...normalizeContentPlan(plan),
      contentItems: items,
      items
    };
  }

  return plan;
};

export const createContentPlan = async (data) => {
  const { clientId, month, year, status, strategicObjectives } = data;
  // Un cliente con hoja de MIO no lleva parrillas nativas, tampoco restauradas de la papelera (29 de octubre de 2026).
  const owner = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, externalPlanUrl: true } }) : null;
  const sheetProblem = nativePlanProblem(owner);
  if (sheetProblem) throw Object.assign(new Error(sheetProblem), { status: 409, code: 'PLAN_IN_SHEET' });
  // Un cliente suspendido por cartera no estrena parrilla del mes congelado; el mes en curso se termina.
  await assertNotSuspended(prisma, { clientId, year, month, clientName: owner?.name });
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
          ...buildContentPlanReviewPendingData(),
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
  if (data?.ownerId) {
    const current = await prisma.contentPlan.findUnique({ where: { id }, select: { ownerId: true } });
    await assertActiveTeamMembers(prisma, [data.ownerId], [current?.ownerId]);
  }
  const safeData = await filterContentPlanData(data);
  return await prisma.contentPlan.update({
    where: { id },
    data: {
      ...safeData,
      ...buildContentPlanReviewPendingData()
    },
    select: await getContentPlanSelect()
  });
};

/**
 * El enlace público de una parrilla (Rodny, 25 de septiembre de 2026).
 *
 * **Es el mismo cada vez.** Antes esta función generaba un token nuevo en cada llamada y lo
 * sobrescribía, así que volver a pulsar «Compartir» mataba el enlace que el cliente ya tenía guardado,
 * sin avisar a nadie: el cliente se encontraba una parrilla que ya no existía.
 *
 * Cambiarlo sigue siendo posible —un enlace que llegó a quien no debía hay que poder anularlo— pero es
 * una decisión explícita (`rotate`), nunca el efecto secundario de pedir el enlace.
 */
export const generateShareToken = async (id, { rotate = false } = {}) => {
  const existing = await prisma.contentPlan.findUnique({
    where: { id },
    select: { shareToken: true }
  });
  if (!existing) throw new Error('Parrilla no encontrada');
  if (existing?.shareToken && !rotate) return existing;

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
    const items = planItems(plan);
    return {
      ...normalizeContentPlan(plan),
      contentItems: items,
      items
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

  // Despachar a producción es justo lo que una suspensión frena.
  await assertPlanNotSuspended(item.plan);

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
          // Nunca el User entero: viaja al navegador y llevaría la contraseña cifrada y el secreto del MFA.
          creator: { select: { id: true, name: true, email: true, avatarUrl: true } }
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

  await markContentPlanReviewPending(updatedItem.planId);

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

/** De qué cliente y de qué mes es una parrilla, para preguntar si está congelada por una suspensión. */
const planCycle = async (planId) => (planId
  ? prisma.contentPlan.findUnique({ where: { id: planId }, select: { clientId: true, year: true, month: true, client: { select: { name: true } } } })
  : null);

const assertPlanNotSuspended = async (plan) => {
  if (!plan) return;
  await assertNotSuspended(prisma, { clientId: plan.clientId, year: plan.year, month: plan.month, clientName: plan.client?.name });
};

export const createContentItem = async (data) => {
  await assertPlanNotSuspended(await planCycle(data?.planId));
  const item = await prisma.contentItem.create({
    data: withoutRetiredFields(data),
    select: await getContentItemSelect()
  });

  await markContentPlanReviewPending(item.planId);

  return normalizeContentItem(item);
};

export const updateContentItem = async (id, data, { fromClientReview = false } = {}) => {
  // La suspensión frena **nuestro** trabajo, no la revisión del cliente: el portal nunca puede decirle que está
  // suspendido por cartera. Una pieza de un mes congelado que él apruebe no produce ni publica nada.
  if (!fromClientReview) {
    const plan = (await prisma.contentItem.findUnique({ where: { id }, select: { plan: { select: { clientId: true, year: true, month: true, client: { select: { name: true } } } } } }))?.plan;
    await assertPlanNotSuspended(plan);
  }
  const normalizedData = { ...data };

  // Ensure publishDate is handled correctly
  if (normalizedData.publishDate) {
    // If it's already a string in YYYY-MM-DD format, we convert it to a UTC Date object
    // to prevent Prisma/Postgres from applying local timezone offsets.
    if (typeof normalizedData.publishDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(normalizedData.publishDate)) {
      normalizedData.publishDate = new Date(`${normalizedData.publishDate}T00:00:00Z`);
    } else {
      normalizedData.publishDate = new Date(normalizedData.publishDate);
    }
  }

  // Hora de publicación en reloj de Bogotá ('HH:mm'); vacío la quita. Cualquier otra cosa se rechaza
  // antes de tocar la base, porque de esta hora depende cuándo sale la pieza en redes.
  if (Object.prototype.hasOwnProperty.call(normalizedData, 'publishTime')) {
    const raw = normalizedData.publishTime;
    if (raw === null || raw === undefined || String(raw).trim() === '') normalizedData.publishTime = null;
    else if (!splitPublishTime(String(raw).trim())) throw Object.assign(new Error('La hora de publicación debe tener el formato HH:mm.'), { status: 400 });
    else normalizedData.publishTime = String(raw).trim();
  }
  const scheduleChanged = Object.prototype.hasOwnProperty.call(normalizedData, 'publishDate')
    || Object.prototype.hasOwnProperty.call(normalizedData, 'publishTime');

  // Cambiar el estado es una decisión nueva sobre la pieza —la aprueba el cliente, o la movemos
  // nosotros—, así que cierra la ronda que estuviera pedida. Editar el caption o la fecha no la
  // cierra: ahí el cliente sigue debiendo su respuesta (Rodny, 5 de octubre de 2026).
  if (Object.prototype.hasOwnProperty.call(normalizedData, 'status')) {
    normalizedData.revisionRequestedAt = null;

    // Mientras la publicación esté armada, el estado de la pieza es de la cola (15 de octubre de 2026).
    // Este era el otro camino del accidente: el desplegable de Estado la ponía en PUBLICADO y, al llegar
    // la hora, el publicador la encontraba publicada y cancelaba las dos redes. Quien quiera marcarla a
    // mano cancela primero la publicación; «Ya se publicó» lo hace por su cuenta antes de llegar aquí.
    const armedItem = await prisma.contentItem.findUnique({
      where: { id },
      select: { publishDate: true, publishTime: true, publications: { select: { status: true } } }
    });
    const queueProblem = queueOwnedStatusProblem({ item: armedItem, publications: armedItem?.publications || [] });
    if (queueProblem) throw Object.assign(new Error(queueProblem), { status: 409, statusCode: 409 });
  }

  const safeData = withoutRetiredFields(normalizedData);
  const itemSelect = await getContentItemSelect();
  const updatedItem = await recognitionTransaction(prisma, async (tx) => {
    const previousItem = await tx.contentItem.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        objective: true,
        format: true,
        publishDate: true,
        tasks: {
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true
          }
        }
      }
    });

    if (!previousItem) throw new Error('Content item not found');
    if (fromClientReview && previousItem.status === 'PUBLICADO') {
      throw Object.assign(new Error(PUBLISHED_REVIEW_MESSAGE), { status: 409 });
    }

    const nextItem = { ...previousItem, ...safeData };
    const linkedTaskUpdates = buildLinkedTaskUpdates({
      previousItem,
      nextItem,
      tasks: previousItem.tasks,
      forceTitles: Object.prototype.hasOwnProperty.call(safeData, 'objective')
        || Object.prototype.hasOwnProperty.call(safeData, 'format')
    });

    const item = await tx.contentItem.update({
      where: { id },
      data: safeData,
      select: itemSelect
    });

    for (const { id: taskId, data: taskData } of linkedTaskUpdates) {
      const before = await prepareTaskRecognition(tx, taskId);
      const after = await tx.task.update({
        where: { id: taskId },
        data: taskData,
      });
      await finishTaskRecognition(tx, before, after);
    }

    await recordPlanRecognition(tx, item.planId, new Date(), { allowAward: safeData.status === 'APROBADO' && previousItem.status !== 'APROBADO' });

    await markContentPlanReviewPending(item.planId, { db: tx });

    return item;
  });

  // La pieza cambió de día o de hora: lo que estaba programado en redes la sigue (o se cancela si perdió la hora).
  if (scheduleChanged) {
    try {
      await resyncItemPublications(id);
    } catch (syncError) {
      console.error('[Service] updateContentItem: no se pudo mover la publicación programada:', syncError.response?.data || syncError.message || syncError);
    }
  }

  // --- AUTOMATION: Auto-finalize ContentPlan ---
  if (normalizedData.status === 'PUBLICADO') {
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
  return await prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, planId: true }
    });
    await markContentPlanReviewPending(item.planId, { db: tx });
    return item;
  });
};

/**
 * La portada de un video (Rodny, 15 de octubre de 2026). Una por pieza y aparte de la rejilla de
 * archivos finales, cuyo orden es el del carrusel que sale publicado.
 *
 * Igual que una pieza final: se comprueba lo que dicen los bytes, no la extensión, antes de gastar la
 * subida. Y **no** pide una nueva ronda de revisión al cliente: la portada es cómo se ve el video en la
 * cuadrícula, no un cambio de lo que el cliente aprobó.
 */
export const setContentItemCover = async (itemId, file) => {
  if (!file) throw Object.assign(new Error('Selecciona una imagen para la portada.'), { status: 400 });
  const problem = coverFileProblem({ name: file.originalname, mimeType: file.mimetype, size: file.size || file.buffer?.length });
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  const mismatched = fileContentProblem({ name: file.originalname, mimeType: file.mimetype, bytes: file.buffer });
  if (mismatched) throw Object.assign(new Error(mismatched), { status: 400 });

  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: { id: true, coverKey: true, plan: { select: { month: true, year: true, client: { select: { slug: true } } } } }
  });
  if (!item) throw Object.assign(new Error('Content item not found'), { status: 404 });

  const basePath = `content-plans/${item.plan.client.slug}/${item.plan.year}-${String(item.plan.month).padStart(2, '0')}/${item.id}/cover`;
  const upload = await uploadToS3(file, basePath, { maxBytes: COVER_MAX_BYTES });
  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: { coverKey: upload.key, coverName: upload.name, coverMimeType: upload.mimeType, coverSize: upload.size }
  });

  // La copia preparada para Meta se hace al publicar y lleva el nombre de la clave anterior: se suelta
  // con ella para que la portada nueva no herede la copia de la vieja.
  if (item.coverKey && item.coverKey !== upload.key) {
    deleteFromS3(item.coverKey).catch((error) => console.error('[Service] No se pudo borrar la portada anterior:', error.message));
    deleteFromS3(derivedKeyFor({ id: `${item.id}-cover`, storageKey: item.coverKey }, 'cover')).catch(() => {});
  }
  return publicCover(updated);
};

export const removeContentItemCover = async (itemId) => {
  const item = await prisma.contentItem.findUnique({ where: { id: itemId }, select: { id: true, coverKey: true } });
  if (!item) throw Object.assign(new Error('Content item not found'), { status: 404 });
  if (!item.coverKey) return null;
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { coverKey: null, coverName: null, coverMimeType: null, coverSize: null }
  });
  deleteFromS3(item.coverKey).catch((error) => console.error('[Service] No se pudo borrar la portada:', error.message));
  deleteFromS3(derivedKeyFor({ id: `${item.id}-cover`, storageKey: item.coverKey }, 'cover')).catch(() => {});
  return null;
};

/** Los bytes de la portada, para que la pantalla la vea por la API y no por una URL pública. */
export const getContentItemCover = async (itemId) => {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: { coverKey: true, coverName: true, coverMimeType: true }
  });
  if (!item?.coverKey) return null;
  return { buffer: await getS3ObjectBuffer(item.coverKey), name: item.coverName, mimeType: item.coverMimeType };
};

export const uploadContentItemFinalAssets = async (itemId, files = []) => {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Selecciona al menos un archivo');
  if (files.length > FINAL_ASSET_MAX_FILES) throw new Error(tooManyFilesMessage());
  const oversized = files.find(file => Number(file?.size || file?.buffer?.length || 0) > FINAL_ASSET_MAX_BYTES);
  if (oversized) throw new Error(fileTooLargeMessage(oversized));
  if (files.some(file => !/^image\/|^video\//.test(file.mimetype || ''))) {
    throw new Error('Solo se permiten imágenes o videos para el carrusel');
  }
  // Un video con extensión .png entraba como imagen y la publicación fallaba a su hora (Rodny,
  // 1 de octubre de 2026). Se dice aquí, con el nombre del archivo, antes de gastar la subida.
  const mismatched = files.map(file => fileContentProblem({ name: file.originalname, mimeType: file.mimetype, bytes: file.buffer })).find(Boolean);
  if (mismatched) throw Object.assign(new Error(mismatched), { status: 400 });

  const { item, basePath, nextPosition } = await loadFinalAssetTarget(itemId, files.length);
  const uploads = await Promise.all(files.map(file => uploadToS3(file, basePath, { maxBytes: FINAL_ASSET_MAX_BYTES })));

  try {
    await prisma.$transaction(uploads.map((upload, index) => prisma.contentItemFinalAsset.create({
      data: {
        contentItemId: item.id,
        storageKey: upload.key,
        name: upload.name,
        mimeType: upload.mimeType,
        size: upload.size,
        position: nextPosition + index
      }
    })));
  } catch (error) {
    await Promise.allSettled(uploads.map(upload => deleteFromS3(upload.key)));
    throw error;
  }

  await requestRevisionIfApproved(item.id);
  return listFinalAssets(item.id);
};

/**
 * Dónde viven los archivos de esta pieza y cuánto sitio le queda. Lo comparten los tres caminos
 * (formulario, subida directa y enlace) para que ninguno se salte el tope ni invente otra ruta.
 */
const loadFinalAssetTarget = async (itemId, incoming = 1) => {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      _count: { select: { finalAssets: true } },
      finalAssets: { orderBy: { position: 'desc' }, take: 1, select: { position: true } },
      plan: { select: { month: true, year: true, client: { select: { slug: true } } } }
    }
  });
  if (!item) throw new Error('Content item not found');
  if (item._count.finalAssets + incoming > FINAL_ASSETS_PER_ITEM) {
    throw new Error(`Una pieza puede contener máximo ${FINAL_ASSETS_PER_ITEM} archivos finales`);
  }

  return {
    item,
    basePath: `content-plans/${item.plan.client.slug}/${item.plan.year}-${String(item.plan.month).padStart(2, '0')}/${item.id}/final-assets`,
    nextPosition: (item.finalAssets[0]?.position ?? -1) + 1
  };
};

const listFinalAssets = (itemId) => prisma.contentItemFinalAsset.findMany({
  where: { contentItemId: itemId },
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
});

/**
 * El cliente aprobó lo que tenía delante. Si después le ponemos material a esa pieza —la foto, el
 * video— aprobó otra cosa, así que se le pide otra vuelta (Rodny, 5 de octubre de 2026). Lo llaman
 * los tres caminos que añaden material: el formulario, la subida directa y el enlace de Drive.
 *
 * Nunca falla hacia fuera: marcar la revisión no puede tumbar una subida que sí funcionó.
 */
const requestRevisionIfApproved = async (itemId) => {
  try {
    const item = await prisma.contentItem.findUnique({
      where: { id: itemId },
      select: { id: true, status: true, revisionRequestedAt: true }
    });
    if (!item || !shouldRequestRevisionOnNewAsset(item) || item.revisionRequestedAt) return;
    await prisma.contentItem.updateMany({
      where: { id: itemId, status: { in: REVIEWABLE_ITEM_STATUSES }, revisionRequestedAt: null, deletedAt: null },
      data: { revisionRequestedAt: new Date() }
    });
  } catch (error) {
    console.error('[Service] No se pudo marcar la pieza para una revisión nueva:', error.message);
  }
};

/** «Pedir nueva revisión» a mano, desde el editor. Solo tiene sentido en una pieza ya aprobada. */
export const requestContentItemRevision = async (itemId) => {
  const item = await prisma.contentItem.findUnique({
    where: { id: itemId },
    select: { id: true, status: true, deletedAt: true }
  });
  if (!item || item.deletedAt) throw Object.assign(new Error('Pieza no encontrada'), { status: 404 });
  if (item.status === 'PUBLICADO') throw Object.assign(new Error(PUBLISHED_REVIEW_MESSAGE), { status: 409 });
  if (!shouldRequestRevisionOnNewAsset(item)) {
    throw Object.assign(
      new Error('Esa pieza todavía está en manos del cliente: ya la tiene por revisar.'),
      { status: 409 }
    );
  }
  // Vuelve a comprobar el estado al escribir: Meta pudo terminar mientras se leía la pieza.
  const saved = await prisma.contentItem.updateMany({
    where: { id: itemId, status: { in: REVIEWABLE_ITEM_STATUSES }, deletedAt: null },
    data: { revisionRequestedAt: new Date() }
  });
  if (!saved.count) throw Object.assign(new Error('La pieza cambió de estado. Vuelve a abrirla.'), { status: 409 });
  const updated = await prisma.contentItem.findUnique({ where: { id: itemId }, select: await getContentItemSelect() });
  return normalizeContentItem(updated);
};

/**
 * Lo mismo para el mes entero, que es como se trabaja: se cargan las piezas finales de toda la
 * parrilla y se reenvía un solo enlace. Devuelve cuántas quedaron pendientes de que las vea.
 */
export const requestContentPlanRevision = async (planId) => {
  const items = await prisma.contentItem.findMany({
    where: { planId, deletedAt: null },
    select: { id: true, status: true, revisionRequestedAt: true }
  });
  const pending = itemsNeedingRevisionRequest(items);
  if (pending.length === 0) return { requested: 0 };

  const saved = await prisma.contentItem.updateMany({
    where: { id: { in: pending.map(item => item.id) }, status: { in: REVIEWABLE_ITEM_STATUSES }, revisionRequestedAt: null, deletedAt: null },
    data: { revisionRequestedAt: new Date() }
  });
  return { requested: saved.count };
};

const storageKeyFor = (basePath, name) => {
  const sanitized = String(name || 'pieza-final').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  return `${basePath}/${Date.now()}_${randomUUID()}_${sanitized}`;
};

/**
 * Entrega un video pesado como enlace de Google Drive en vez de subirlo (Rodny, 24 de septiembre de 2026).
 * El enlace se resuelve aquí en su identificador y se guarda ya resuelto; lo que no se puede saber desde
 * aquí es si el cliente podrá abrirlo, y de eso avisa la pantalla al pegarlo.
 */
export const addContentItemDriveAsset = async (itemId, { url, name } = {}) => {
  const problem = driveLinkProblem(url);
  if (problem) throw new Error(problem);

  const externalFileId = parseDriveFileId(url);
  const { item, basePath: _basePath, nextPosition } = await loadFinalAssetTarget(itemId);

  const duplicate = await prisma.contentItemFinalAsset.findFirst({
    where: { contentItemId: item.id, externalFileId }
  });
  if (duplicate) throw new Error('Ese archivo de Drive ya está en esta pieza.');

  const data = {
    contentItemId: item.id,
    storageKey: null,
    name: String(name || '').trim() || 'Video en Drive',
    mimeType: null,
    size: null,
    externalUrl: String(url).trim(),
    externalProvider: DRIVE_PROVIDER,
    externalFileId,
    position: nextPosition
  };

  const shapeProblem = finalAssetShapeProblem(data);
  if (shapeProblem) throw new Error(shapeProblem);

  await prisma.contentItemFinalAsset.create({ data });
  await requestRevisionIfApproved(item.id);
  return listFinalAssets(item.id);
};

/**
 * Permisos firmados para que el navegador suba directo al almacenamiento lo que no cabe por el servidor.
 * Aquí **solo** se reparten permisos: nada queda guardado en la base hasta que el navegador confirme, así
 * que una subida a medias no deja una pieza fantasma en la parrilla.
 */
export const createFinalAssetUploadTickets = async (itemId, files = []) => {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) throw new Error('Selecciona al menos un archivo');
  if (list.length > FINAL_ASSET_MAX_FILES) throw new Error(tooManyFilesMessage());

  const oversized = list.find(file => Number(file?.size || 0) > FINAL_ASSET_DIRECT_MAX_BYTES);
  if (oversized) throw new Error(fileTooLargeMessage(oversized, FINAL_ASSET_DIRECT_MAX_BYTES));
  if (list.some(file => !/^image\/|^video\//.test(String(file?.mimeType || '')))) {
    throw new Error('Solo se permiten imágenes o videos para la pieza final');
  }

  const { basePath } = await loadFinalAssetTarget(itemId, list.length);

  return Promise.all(list.map(async (file) => {
    const key = storageKeyFor(basePath, file.name);
    const { url } = await createSignedUpload({ key, contentType: file.mimeType });
    return { key, url, name: String(file.name || 'pieza-final'), mimeType: file.mimeType };
  }));
};

/**
 * El navegador dice que ya subió; aquí se comprueba y recién entonces existe la pieza.
 *
 * Dos cosas que no se pueden saltar. La clave tiene que estar **dentro de la carpeta de esta pieza**: si
 * se aceptara cualquier clave, alguien podría colgar en su parrilla un archivo de otro cliente. Y el peso
 * y el tipo se leen del almacenamiento, no de lo que declaró el navegador, que es una promesa, no un hecho.
 */
export const confirmContentItemFinalAssets = async (itemId, uploads = []) => {
  const list = Array.isArray(uploads) ? uploads : [];
  if (list.length === 0) throw new Error('No hay archivos que confirmar');
  if (list.length > FINAL_ASSET_MAX_FILES) throw new Error(tooManyFilesMessage());

  const { item, basePath, nextPosition } = await loadFinalAssetTarget(itemId, list.length);

  const verified = await Promise.all(list.map(async (upload, index) => {
    const key = String(upload?.key || '');
    if (!key.startsWith(`${basePath}/`)) throw new Error('Ese archivo no pertenece a esta pieza.');

    const object = await headS3Object(key);
    if (!object) throw new Error('El archivo no llegó completo al almacenamiento. Vuelve a intentarlo.');
    if (object.size <= 0) throw new Error('El archivo llegó vacío al almacenamiento. Vuelve a intentarlo.');
    if (object.size > FINAL_ASSET_DIRECT_MAX_BYTES) {
      throw new Error(fileTooLargeMessage({ name: upload?.name, size: object.size }, FINAL_ASSET_DIRECT_MAX_BYTES));
    }
    if (!/^image\/|^video\//.test(object.mimeType || '')) {
      throw new Error('Solo se permiten imágenes o videos para la pieza final');
    }

    return {
      contentItemId: item.id,
      storageKey: key,
      name: String(upload?.name || '').trim() || 'pieza-final',
      mimeType: object.mimeType,
      size: object.size,
      externalUrl: null,
      externalProvider: null,
      externalFileId: null,
      position: nextPosition + index
    };
  }));

  const shapeProblem = verified.map(finalAssetShapeProblem).find(Boolean);
  if (shapeProblem) throw new Error(shapeProblem);

  try {
    await prisma.$transaction(verified.map(data => prisma.contentItemFinalAsset.create({ data })));
  } catch (error) {
    await Promise.allSettled(verified.map(data => deleteFromS3(data.storageKey)));
    throw error;
  }

  await requestRevisionIfApproved(item.id);
  return listFinalAssets(item.id);
};

export const getContentItemFinalAssetById = async (itemId, assetId) => (
  prisma.contentItemFinalAsset.findFirst({ where: { id: assetId, contentItemId: itemId } })
);

export const deleteContentItemFinalAssetById = async (itemId, assetId) => {
  const asset = await prisma.contentItemFinalAsset.findFirst({ where: { id: assetId, contentItemId: itemId } });
  if (!asset) throw new Error('Archivo final no encontrado');

  await prisma.contentItemFinalAsset.delete({ where: { id: asset.id } });
  deleteFromS3(asset.storageKey).catch(error => {
    console.error('[Service] Failed to delete carousel asset from storage:', error.response?.data || error.message);
  });
  return { success: true, id: asset.id };
};

export const addClientComment = async (itemId, comment) => {
  return await recognitionTransaction(prisma, async (tx) => {
  const item = await tx.contentItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Content item not found');
  if (item.status === 'PUBLICADO') throw Object.assign(new Error(PUBLISHED_REVIEW_MESSAGE), { status: 409 });

  const now = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const updatedComments = item.comments
    ? `${item.comments}\n\n[Cliente - ${now}]: ${comment}`
    : `[Cliente - ${now}]: ${comment}`;

    const updated = await tx.contentItem.update({
      where: { id: itemId },
      data: {
        comments: updatedComments,
        status: 'DEVUELTO',
        // El cliente ya respondió: la ronda que le pedimos queda cerrada.
        revisionRequestedAt: null
      }
    });
    await recordPlanRecognition(tx, updated.planId, new Date(), { allowAward: false });
    await markContentPlanReviewPending(updated.planId, { db: tx });
    return updated;
  });
};
