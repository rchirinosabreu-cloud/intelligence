import { resetSystemStreak, processSystemStreakDailyIncrement, recordQualityStreakTransition } from './qualityStreakService.js';
import prisma from '../lib/prisma.js';
import { assertActiveTeamMembers } from './teamRosterService.js';
import { recognitionTransaction, prepareTaskRecognition, finishTaskRecognition, attachTaskRecognitions, recordPlanRecognition } from './recognitionService.js';
import { createNotification, processMentionsAndNotifications } from './notificationService.js';
import { recordOperationalTrace } from './operationalTraceService.js';
import { classifyTaskDeterministically } from './deterministicTaskClassifier.js';
import { pickAllowedTaskUpdates } from '../config/security.js';
import { closeTaskWorkSession, formatTaskReturnEventContent } from '../lib/taskTiming.js';
import { bogotaTimeOf } from '../lib/taskFocus.js';
import { taskPrivacyFilter } from '../lib/taskPrivacy.js';
import {
    buildContentTaskTitle,
    buildContentItemUpdateFromTask,
    buildLinkedTaskUpdates,
    getContentTaskKind,
    normalizeLinkedUrls
} from '../lib/contentTaskReciprocity.js';
import {
    closeActiveTaskWorkCycle,
    closeActiveTaskWorkSession,
    ensureTaskWorkCycle,
    openTaskWorkSession
} from './taskWorkSessionService.js';

const taskContentPlanSelect = {
    id: true,
    clientId: true,
    month: true,
    year: true,
    status: true,
    ownerId: true,
    client: { select: { slug: true } }
};

const taskCommentAuthorSelect = {
    id: true,
    name: true,
    avatarUrl: true,
    role: true
};

const taskListInclude = {
    client: {
        select: { name: true, logoUrl: true, slug: true }
    },
    // Quién más puede ver un pendiente privado. Va en la lista porque la decisión se
    // toma aquí, en el servidor: si el título viajara y lo escondiera la pantalla,
    // seguiría estando en la respuesta a la vista de cualquiera.
    viewers: { select: { userId: true } },
    assignee: true,
    creator: {
        select: { id: true, name: true, avatarUrl: true, email: true, role: true }
    },
    taskAttachments: true,
    contentItem: {
        include: {
            plan: {
                select: taskContentPlanSelect
            }
        }
    }
};

/**
 * Normalizes a category string into one of the 8 official master labels.
 */
export const normalizeCategory = (cat) => {
    if (!cat) return "Operaciones & Reuniones";
    const clean = cat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    // Mapping logic
    if (clean.includes("estrategico")) return "Estratégico";
    if (clean.includes("creativo") || clean.includes("diseno") || clean.includes("produccion visual") || clean.includes("hogar") || clean.includes("decoracion")) return "Creativo & Diseño";
    if (clean.includes("marketing") || clean.includes("social media") || clean.includes("community")) return "Marketing & Social Media";
    if (clean.includes("video") || clean.includes("audiovisual") || clean.includes("edicion")) return "Producción Audiovisual";
    if (clean.includes("contenido") || clean.includes("redaccion") || clean.includes("copy") || clean.includes("caption")) return "Creación de Contenido";
    if (clean.includes("operaciones") || clean.includes("reunion") || clean.includes("junta") || clean.includes("correccion") || clean.includes("oficina") || clean.includes("ajuste") || clean.includes("sin clasificar")) return "Operaciones & Reuniones";
    if (clean.includes("administrativo") || clean.includes("finanzas") || clean.includes("facturacion") || clean.includes("legal") || clean.includes("presupuesto")) return "Administrativo & Finanzas";
    if (clean.includes("educacion") || clean.includes("formacion") || clean.includes("capacitacion") || clean.includes("investigacion")) return "Educación";

    return "Operaciones & Reuniones";
};

export const getDashboardMetrics = async () => {
    try {
        // America/Bogota Month Boundaries
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit'
        });
        const monthStr = formatter.format(new Date()); // "YYYY-MM"

        const startOfMonth = new Date(`${monthStr}-01T05:00:00.000Z`);
        const nextMonthDate = new Date(startOfMonth);
        nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
        const endOfMonth = new Date(nextMonthDate.getTime() - 1);

        // 1. Pending (Historical active) - NOT filtered by month
        const pendingCount = await prisma.task.count({
            where: {
                status: {
                    in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA']
                }
            }
        });

        // 2. Completed this month
        const completedThisMonthCount = await prisma.task.count({
            where: {
                status: 'REALIZADA',
                completedAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        // 3. Total (Universo Único de Actividad: Creadas este mes OR Terminadas este mes)
        const totalUniqueActiveThisMonth = await prisma.task.count({
            where: {
                OR: [
                    {
                        createdAt: {
                            gte: startOfMonth,
                            lte: endOfMonth
                        }
                    },
                    {
                        completedAt: {
                            gte: startOfMonth,
                            lte: endOfMonth
                        }
                    }
                ]
            }
        });

        const percentage = totalUniqueActiveThisMonth > 0
            ? Math.round((completedThisMonthCount / totalUniqueActiveThisMonth) * 100)
            : 0;

        return {
            total: totalUniqueActiveThisMonth,
            completed: completedThisMonthCount,
            pending: pendingCount,
            percentage
        };
    } catch (error) {
        console.error("Error fetching dashboard metrics:", error);
        throw error;
    }
};

export const initSystemStreakCron = () => {
    console.log("[SystemStreak] Automated daily increment check initialized.");

    // Initial check after 3 seconds
    const startupTimeout = setTimeout(() => {
        processSystemStreakDailyIncrement().catch(err => {
            console.error("[SystemStreak] Initial daily increment check failed:", err.message);
        });
    }, 3000);
    if (startupTimeout.unref) startupTimeout.unref();

    // Check every hour for calendar day change
    const intervalId = setInterval(() => {
        processSystemStreakDailyIncrement().catch(err => {
            console.error("[SystemStreak] Periodic daily increment check failed:", err.message);
        });
    }, 1000 * 60 * 60);
    if (intervalId.unref) intervalId.unref();
};

// Auto start on module load if not in test env
if (process.env.NODE_ENV !== 'test') {
    try {
        initSystemStreakCron();
    } catch (err) {
        console.error("[SystemStreak] Failed to auto-start SystemStreak cron:", err.message);
    }
}

export { getOrCreateSystemStreak, resetSystemStreak, processSystemStreakDailyIncrement, getQualityStreak } from './qualityStreakService.js';

export const getTasks = async (clientId, viewerUserId = null) => {
    try {
        const clientFilter = clientId ? { clientId } : {};
        const [activeTasks, recentCompletedTasks] = await Promise.all([
            prisma.task.findMany({
                where: { ...clientFilter, status: { not: 'REALIZADA' } },
                include: taskListInclude,
                orderBy: { createdAt: 'asc' }
            }),
            prisma.task.findMany({
                where: { ...clientFilter, status: 'REALIZADA' },
                include: taskListInclude,
                orderBy: { completedAt: 'desc' },
                take: 200
            })
        ]);
        // La reserva se aplica antes de cualquier otra cosa: lo que no se puede ver no
        // debe llegar a la respuesta ni siquiera para ser transformado.
        const tasks = [...activeTasks, ...recentCompletedTasks].map(taskPrivacyFilter(viewerUserId));

        // Map for frontend compatibility: task.plan -> task.contentItem.plan
        return tasks.map(task => {
            if (task.contentItem && task.contentItem.plan) {
                return {
                    ...task,
                    contentPlanId: task.contentItem.plan.id, // Ensure ID is at root
                    plan: {
                        id: task.contentItem.plan.id,
                        slug: task.contentItem.plan.client?.slug || task.client?.slug,
                        month: task.contentItem.plan.month,
                        year: task.contentItem.plan.year,
                        status: task.contentItem.plan.status
                    }
                };
            }
            return task;
        });
    } catch (error) {
        console.error("Error fetching native tasks:", error);
        throw error;
    }
};

const statusMapper = {
    'Pendiente': 'PENDIENTE',
    'En proceso': 'EN_CURSO',
    'Realizado': 'REALIZADA',
    'Devuelto': 'DEVUELTA',
    'PENDIENTE': 'PENDIENTE',
    'EN_CURSO': 'EN_CURSO',
    'REALIZADA': 'REALIZADA',
    'DEVUELTA': 'DEVUELTA'
};

export const createTask = async ({
    title, dueDate, focusDeadlineAt = null, assigneeId, creatorId, comments, status, clientId,
    isPriority = false, priority = null, isSpecial = false, isPrivate = false, viewerIds = [], referenceUrl = null,
    contentItemId = null, followOnCreate = false,
    initial_references = [], initial_inputs = [], initial_insumos = [], initial_comments = [],
    tempAttachments = []
}) => {
    try {
        const mappedStatus = statusMapper[status] || 'PENDIENTE';
        const taskClassification = classifyTaskDeterministically({
            title,
            description: [
                comments,
                ...(Array.isArray(initial_comments) ? initial_comments : [])
                    .map((comment) => comment?.content || '')
            ].filter(Boolean).join(' '),
            attachmentCount: [initial_references, initial_inputs, initial_insumos, tempAttachments]
                .reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0)
        });

        // Use a Prisma transaction to ensure atomicity
        const newTask = await recognitionTransaction(prisma, async (tx) => {
            await assertActiveTeamMembers(tx, [assigneeId]);
            // 1. Create the task
            const task = await tx.task.create({
                data: {
                    title,
                    dueDate: dueDate ? new Date(dueDate) : null,
                    focusDeadlineAt: focusDeadlineAt ? new Date(focusDeadlineAt) : null,
                    focusSetById: focusDeadlineAt ? (creatorId || null) : null,
                    assigneeId,
                    creatorId,
                    comments,
                    status: mappedStatus,
                    clientId,
                    isPriority,
                    priority: priority || null,
                    isSpecial,
                    isPrivate: Boolean(isPrivate),
                    // Quien la crea y quien la ejecuta la ven por serlo, no por estar
                    // en la lista: guardar solo a los demás evita que quitar a alguien
                    // de la lista parezca que le quita el acceso a su propia tarea.
                    ...(isPrivate && Array.isArray(viewerIds) && viewerIds.length
                        ? { viewers: { createMany: { data: [...new Set(viewerIds.filter(Boolean))].map((userId) => ({ userId })), skipDuplicates: true } } }
                        : {}),
                    referenceUrl,
                    contentItemId,
                    aiCategory: taskClassification.category,
                    aiComplexity: taskClassification.complexity,
                    completedAt: mappedStatus === 'REALIZADA' ? new Date() : null,
                    startedAt: mappedStatus === 'REALIZADA' ? new Date() : null
                }
            });

            await prepareTaskRecognition(tx, task.id);
            if (mappedStatus === 'DEVUELTA') {
                await resetSystemStreak(tx);
            }

            // Create initial comment first to link tempAttachments
            let initialComment = null;
            const initialCommentText = Array.isArray(initial_comments) && initial_comments.length > 0
                ? (initial_comments[0].content || "")
                : "";
            if (Array.isArray(initial_comments) && initial_comments.length > 0) {
                initialComment = await tx.taskComment.create({
                    data: {
                        taskId: task.id,
                        authorId: creatorId,
                        content: initialCommentText,
                        type: 'human'
                    }
                });

                // Create any remaining comments
                for (let i = 1; i < initial_comments.length; i++) {
                    await tx.taskComment.create({
                        data: {
                            taskId: task.id,
                            authorId: creatorId,
                            content: initial_comments[i].content,
                            type: 'human'
                        }
                    });
                }
            } else if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
                // Shell comment to link files if no comment text
                initialComment = await tx.taskComment.create({
                    data: {
                        taskId: task.id,
                        authorId: creatorId,
                        content: initialCommentText,
                        type: 'human'
                    }
                });
            }

            // 2. Insert initial_references, initial_inputs, and initial_insumos if any
            const attachmentsToCreate = [];

            if (Array.isArray(initial_references) && initial_references.length > 0) {
                initial_references.forEach(ref => {
                    attachmentsToCreate.push({
                        taskId: task.id,
                        url: ref.url,
                        name: ref.name || null,
                        category: 'REFERENCIA'
                    });
                });
            }

            if (Array.isArray(initial_inputs) && initial_inputs.length > 0) {
                initial_inputs.forEach(input => {
                    attachmentsToCreate.push({
                        taskId: task.id,
                        url: input.url,
                        name: input.name || null,
                        category: 'INSUMO'
                    });
                });
            }

            if (Array.isArray(initial_insumos) && initial_insumos.length > 0) {
                initial_insumos.forEach(insumo => {
                    attachmentsToCreate.push({
                        taskId: task.id,
                        url: insumo.url,
                        name: insumo.name || null,
                        category: 'INSUMO'
                    });
                });
            }

            // Create tempAttachments linked to the initialComment!
            if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
                tempAttachments.forEach(att => {
                    attachmentsToCreate.push({
                        taskId: task.id,
                        commentId: initialComment ? initialComment.id : null,
                        url: att.url,
                        name: att.name || "Adjunto de Chat",
                        category: 'REFERENCIA'
                    });
                });
            }

            if (attachmentsToCreate.length > 0) {
                await tx.taskAttachment.createMany({
                    data: attachmentsToCreate
                });
            }

            if (followOnCreate && creatorId) {
                await tx.taskFollower.create({
                    data: { taskId: task.id, userId: creatorId }
                });
            }

            // Return the created task with its nested relations populated
            return tx.task.findUnique({
                where: { id: task.id },
                include: {
                    client: {
                        select: { name: true, logoUrl: true, slug: true }
                    },
                    assignee: true,
                    creator: {
                        select: { id: true, name: true, avatarUrl: true, email: true, role: true }
                    },
                    taskComments: {
                        include: { author: { select: taskCommentAuthorSelect }, attachments: true },
                        orderBy: { createdAt: 'desc' }
                    },
                    taskAttachments: true,
                    contentItem: {
                        include: {
                            plan: {
                                select: taskContentPlanSelect
                            }
                        }
                    }
                }
            });
        });

        const taskTraceEvents = [
            recordOperationalTrace({
                eventType: 'TASK_CREATED',
                actorId: creatorId,
                subjectUserId: newTask.assignee?.userId || null,
                taskId: newTask.id,
                metadata: { status: newTask.status }
            })
        ];
        if (newTask.assignee?.userId) {
            taskTraceEvents.push(recordOperationalTrace({
                eventType: 'TASK_ASSIGNED',
                actorId: creatorId,
                subjectUserId: newTask.assignee.userId,
                taskId: newTask.id
            }));
        }
        Promise.all(taskTraceEvents).catch((error) => {
            console.error('[nativeTaskService] Creation trace failed:', error?.message || error);
        });

        for (const initialComment of initial_comments) {
            processMentionsAndNotifications(newTask.id, initialComment.content || '', creatorId).catch((error) => {
                console.error('[nativeTaskService] Initial mention processing failed:', error);
            });
        }

        // Map for frontend compatibility
        if (newTask.contentItem && newTask.contentItem.plan) {
            return {
                ...newTask,
                contentPlanId: newTask.contentItem.plan.id, // Ensure ID is at root
                plan: {
                    id: newTask.contentItem.plan.id,
                    slug: newTask.contentItem.plan.client?.slug || newTask.client?.slug,
                    month: newTask.contentItem.plan.month,
                    year: newTask.contentItem.plan.year,
                    status: newTask.contentItem.plan.status
                }
            };
        }

        return newTask;
    } catch (error) {
        console.error("Error creating native task:", error);
        throw error;
    }
};

export const buildCompletedTaskWhere = (dateString, searchTerm) => {
    const normalizedSearch = String(searchTerm || '').trim();

    if (normalizedSearch) {
        return {
            status: 'REALIZADA',
            completedAt: { not: null },
            OR: [
                { title: { contains: normalizedSearch, mode: 'insensitive' } },
                { client: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                { assignee: { name: { contains: normalizedSearch, mode: 'insensitive' } } }
            ]
        };
    }

    // Fix Timezone Offset (America/Bogota UTC-5)
    let targetDateStr = dateString;

    if (!targetDateStr) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        targetDateStr = formatter.format(new Date());
    }

    const startOfDay = new Date(`${targetDateStr}T05:00:00.000Z`);
    const endOfDay = new Date(startOfDay.getTime() + (24 * 60 * 60 * 1000) - 1);

    return {
        status: 'REALIZADA',
        completedAt: {
            not: null,
            gte: startOfDay,
            lte: endOfDay
        }
    };
};

export const getCompletedTasks = async (dateString, searchTerm) => {
    try {
        const where = buildCompletedTaskWhere(dateString, searchTerm);

        const tasks = await prisma.task.findMany({
            where,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true,
                creator: {
                    select: { id: true, name: true, avatarUrl: true, email: true, role: true }
                }
            },
            orderBy: {
                completedAt: 'desc'
            }
            // Removed take: 100 as we are now strictly filtering by day
        });
        return await attachTaskRecognitions(prisma, tasks);
    } catch (error) {
        console.error("Error fetching completed tasks:", error);
        throw error;
    }
};

export const updateTask = async (id, data, updaterId = null) => {
    try {
        const transition = await recognitionTransaction(prisma, async (tx) => {
        const recognitionBefore = await prepareTaskRecognition(tx, id);
        // 1. Fetch current task state to evaluate transitions (TDD Edge Cases)
        const currentTask = await tx.task.findUnique({
            where: { id },
            select: {
                title: true,
                status: true,
                completedAt: true,
                startedAt: true,
                accumulatedWorkMs: true,
                returnCount: true,
                isReturned: true,
                returnedAt: true,
                comments: true,
                isPriority: true,
                isSpecial: true,
                assigneeId: true,
                creatorId: true,
                contentItemId: true,
                contentItem: {
                    select: {
                        id: true,
                        objective: true,
                        format: true,
                        publishDate: true,
                        mediaUrl: true,
                        assetsLinks: true,
                        tasks: {
                            select: {
                                id: true,
                                title: true,
                                dueDate: true,
                                status: true
                            }
                        }
                    }
                }
            }
        });

        if (!currentTask) {
            throw new Error(`Task with id ${id} not found`);
        }

        const updateData = pickAllowedTaskUpdates(data);
        await assertActiveTeamMembers(tx, [updateData.assigneeId], [currentTask.assigneeId]);

        // Extract and isolate returnReason and reintegrateReason
        const { returnReason, returnNote, reintegrateReason, reopenReason, reopenNote } = updateData;
        delete updateData.returnReason;
        delete updateData.returnNote;
        delete updateData.reintegrateReason;
        delete updateData.reopenReason;
        delete updateData.reopenNote;

        // Handle adding a single new attachment in edition mode
        if (updateData.newAttachment) {
            const { name, url, category } = updateData.newAttachment;
            if (currentTask.contentItem) {
                const contentField = category === 'INSUMO' ? 'contentInputs' : 'contentReferences';
                const currentValues = category === 'INSUMO'
                    ? currentTask.contentItem.assetsLinks
                    : currentTask.contentItem.mediaUrl;
                updateData[contentField] = normalizeLinkedUrls([...(currentValues || []), url]);
            } else {
                await tx.taskAttachment.create({
                    data: {
                        taskId: id,
                        name: name || null,
                        url,
                        category: category || 'REFERENCIA'
                    }
                });
            }
            delete updateData.newAttachment;
        }

        // Handle deleting an attachment in edition mode
        if (updateData.deleteAttachmentId) {
            const attachment = await tx.taskAttachment.findFirst({
                where: { id: updateData.deleteAttachmentId, taskId: id },
                select: { id: true, url: true, category: true }
            });
            await tx.taskAttachment.deleteMany({
                where: { id: updateData.deleteAttachmentId, taskId: id }
            });
            if (attachment && currentTask.contentItem) {
                const contentField = attachment.category === 'INSUMO' ? 'contentInputs' : 'contentReferences';
                const currentValues = attachment.category === 'INSUMO'
                    ? currentTask.contentItem.assetsLinks
                    : currentTask.contentItem.mediaUrl;
                updateData[contentField] = normalizeLinkedUrls(currentValues)
                    .filter((url) => url !== attachment.url);
            }
            delete updateData.deleteAttachmentId;
        }

        // Critical Fix: Sanitize updateData to prevent nested relational updates
        // that cause duplication or unlinking of records (e.g. "New Pueblito" bug)
        const relationsToStrip = ['client', 'assignee', 'creator', 'contentItem', 'plan', 'taskAttachments'];
        relationsToStrip.forEach(key => delete updateData[key]);

        // Normalize category if provided in the update payload
        if (updateData.aiCategory) {
            updateData.aiCategory = normalizeCategory(updateData.aiCategory);
        }

        // Handle explicit incoming date parsing
        if (updateData.dueDate) {
            updateData.dueDate = new Date(updateData.dueDate);
        }
        // Compromiso con hora: an explicit null clears it; a value is stored as an instant.
        if ('focusDeadlineAt' in updateData) {
            updateData.focusDeadlineAt = updateData.focusDeadlineAt ? new Date(updateData.focusDeadlineAt) : null;
            // Who set the hour gets the overdue notice and the extension requests; a new hour can be notified again.
            updateData.focusSetById = updateData.focusDeadlineAt ? (updaterId || null) : null;
            updateData.focusOverdueNotifiedAt = null;
        }

        const reciprocalContentUpdate = buildContentItemUpdateFromTask({
            task: currentTask,
            taskUpdate: updateData
        });

        if (reciprocalContentUpdate && currentTask.contentItem) {
            const previousItem = currentTask.contentItem;
            const nextItem = { ...previousItem, ...reciprocalContentUpdate };
            const titleChanged = Object.prototype.hasOwnProperty.call(reciprocalContentUpdate, 'objective')
                || Object.prototype.hasOwnProperty.call(reciprocalContentUpdate, 'format');
            const siblingTaskUpdates = buildLinkedTaskUpdates({
                previousItem,
                nextItem,
                tasks: previousItem.tasks,
                excludedTaskIds: [id],
                forceTitles: titleChanged
            });

            const currentTaskKind = getContentTaskKind(currentTask.title);
            if (titleChanged && currentTaskKind) {
                updateData.title = buildContentTaskTitle(currentTaskKind, nextItem);
            }

            await tx.contentItem.update({
                where: { id: currentTask.contentItemId },
                data: reciprocalContentUpdate,
                select: { id: true }
            });

            for (const { id: taskId, data: taskData } of siblingTaskUpdates) {
                const siblingBefore = await prepareTaskRecognition(tx, taskId);
                const siblingAfter = await tx.task.update({
                    where: { id: taskId },
                    data: taskData,
                });
                await finishTaskRecognition(tx, siblingBefore, siblingAfter);
            }
        }

        delete updateData.contentObjective;
        delete updateData.contentReferences;
        delete updateData.contentInputs;

        if ('title' in updateData || 'comments' in updateData) {
            const taskClassification = classifyTaskDeterministically({
                title: updateData.title ?? currentTask.title,
                description: updateData.comments ?? currentTask.comments ?? ''
            });
            updateData.aiCategory = taskClassification.category;
            updateData.aiComplexity = taskClassification.complexity;
        }

        // Strict Task Lifecycle Logic (completedAt)
        // Only evaluate if the payload actually attempts to change the 'status' (Edge Case B)
        let isCorrected = false;
        let isReturned = false;
        if ('status' in updateData) {
            updateData.status = statusMapper[updateData.status] || updateData.status;
            const newStatus = updateData.status;
            const oldStatus = currentTask.status;
            const isReopened = oldStatus === 'REALIZADA' && newStatus === 'PENDIENTE';
            const transitionAt = new Date();

            if (oldStatus === 'EN_CURSO' && newStatus !== 'EN_CURSO') {
                updateData.accumulatedWorkMs = closeTaskWorkSession(currentTask, transitionAt);
                updateData.startedAt = null;
                const closeReason = newStatus === 'REALIZADA'
                    ? 'COMPLETED'
                    : newStatus === 'DEVUELTA' ? 'RETURNED' : 'PAUSED';
                await closeActiveTaskWorkSession(tx, {
                    taskId: id,
                    actorId: updaterId,
                    at: transitionAt,
                    closeReason
                });
            }

            if (isReopened) {
                if (!reopenReason || !reopenNote?.trim()) {
                    throw new Error('Reopening a completed task requires a reason and note');
                }
                updateData.startedAt = null;
                await ensureTaskWorkCycle(tx, {
                    taskId: id,
                    actorId: updaterId,
                    at: transitionAt,
                    kind: 'REWORK',
                    reason: reopenReason,
                    note: reopenNote.trim()
                });
                await tx.taskComment.create({
                    data: {
                        taskId: id,
                        authorId: updaterId,
                        content: `[${reopenReason}]\n${reopenNote.trim()}`,
                        type: 'system_reopen'
                    }
                });
            }

            isReturned = (newStatus === 'DEVUELTA' && oldStatus !== 'DEVUELTA');

            // Radar de Mérito: Increment returnCount on transition to DEVUELTA
            if (isReturned) {
                const returnEventContent = formatTaskReturnEventContent(returnReason, returnNote);
                if (!returnEventContent) {
                    throw new Error('Returning a task requires a reason and note');
                }
                updateData.returnCount = (currentTask.returnCount || 0) + 1;
                updateData.isReturned = true;
                updateData.returnedAt = new Date();

                await resetSystemStreak(tx);

                await tx.taskComment.create({
                    data: {
                        taskId: id,
                        authorId: updaterId,
                        content: returnEventContent,
                        type: 'system_return'
                    }
                });
            }

            // Radar de Mérito: Initial startedAt logic
            if (newStatus === 'EN_CURSO' && oldStatus !== 'EN_CURSO') {
                updateData.startedAt = transitionAt;
                const cycle = await ensureTaskWorkCycle(tx, {
                    taskId: id,
                    actorId: updaterId,
                    at: transitionAt,
                    kind: oldStatus === 'DEVUELTA' ? 'REWORK' : 'INITIAL',
                    reason: oldStatus === 'DEVUELTA' ? 'RETURNED' : null
                });
                await openTaskWorkSession(tx, {
                    task: { ...currentTask, id },
                    cycleId: cycle.id,
                    actorId: updaterId,
                    at: transitionAt
                });
            }

            if (newStatus === 'REALIZADA' || newStatus === 'DEVUELTA') {
                await closeActiveTaskWorkCycle(tx, {
                    taskId: id,
                    actorId: updaterId,
                    at: transitionAt,
                    closeReason: newStatus === 'REALIZADA' ? 'COMPLETED' : 'RETURNED'
                });
            }

            // --- Lógica de Cierre de Ciclo (Notificación de Corrección) ---
            // Si el estado anterior era visually returned y el nuevo es 'Pendiente' o 'En proceso'
            // Consideramos visualmente devuelto si tiene el tag o el status DEVUELTA o el flag isReturned.
            const wasVisuallyReturned = currentTask.isReturned || (oldStatus === 'DEVUELTA') ||
                                       (oldStatus === 'PENDIENTE' && (currentTask.comments || '').includes('[DEVOLUCIÓN'));

            isCorrected = wasVisuallyReturned &&
                              (newStatus === 'PENDIENTE' || newStatus === 'EN_CURSO');

            if (isCorrected) {
                if (!reintegrateReason?.trim()) {
                    throw new Error('Reintegrating a returned task requires a note');
                }
                updateData.isReturned = false;
                await ensureTaskWorkCycle(tx, {
                    taskId: id,
                    actorId: updaterId,
                    at: transitionAt,
                    kind: 'REWORK',
                    reason: 'RETURNED',
                    note: reintegrateReason || null
                });
            }

            // Fix Reintegration: Create system_reintegrate comment using the decoupled reintegrateReason
            if (isCorrected && reintegrateReason) {
                await tx.taskComment.create({
                    data: {
                        taskId: id,
                        authorId: updaterId,
                        content: reintegrateReason,
                        type: 'system_reintegrate'
                    }
                });
            }

            if (newStatus === 'REALIZADA') {
                // Edge Case A: Only set completedAt to NOW if it wasn't already 'Realizado' / completed.
                // If it already has a completedAt, preserve the history.
                if (!currentTask.completedAt || currentTask.status !== 'REALIZADA') {
                    updateData.completedAt = new Date();

                    // Radar de Mérito: If startedAt is missing, set both started and completed
                    if (!currentTask.startedAt && !updateData.startedAt) {
                        updateData.startedAt = updateData.completedAt;
                    }

                    // --- AUTOMATION: HAND-OFF (Production to Publication) ---
                    // Only trigger if this was a production task transition to 'REALIZADA'
                    // and it hasn't already been handled.
                        const linkedItem = await tx.contentItem.findUnique({
                            where: { id: currentTask.contentItemId || 'none' },
                            include: {
                                plan: {
                                    select: {
                                        id: true,
                                        clientId: true,
                                        ownerId: true,
                                        owner: true
                                    }
                                }
                            }
                        });

                        // Check if it's a production task (not a publication task)
                        const isProductionTask = !(currentTask.title || '').startsWith('[Publicar]');

                        if (linkedItem && linkedItem.plan?.ownerId && isProductionTask) {
                            console.log(`[nativeTaskService] Production task completed. Creating Publication task for CM: ${linkedItem.plan.ownerId}`);

                            const referenceText = Array.isArray(linkedItem.mediaUrl)
                                ? linkedItem.mediaUrl.join(', ')
                                : (linkedItem.mediaUrl || 'N/A');

                            const publicationTitle = `[Publicar] ${linkedItem.format}: ${linkedItem.objective}`;
                            const existingPublicationTask = await tx.task.findFirst({
                                where: {
                                    contentItemId: linkedItem.id,
                                    title: publicationTitle
                                },
                                select: { id: true }
                            });

                            if (!existingPublicationTask) await tx.task.create({
                                data: {
                                    title: publicationTitle,
                                    dueDate: linkedItem.publishDate,
                                    assigneeId: linkedItem.plan.ownerId,
                                    creatorId: updaterId || currentTask.creatorId,
                                    status: 'PENDIENTE',
                                    clientId: linkedItem.plan.clientId,
                                    contentItemId: linkedItem.id, // Linked to the same item
                                    comments: `Pieza lista para publicar. Referencia: ${referenceText}`
                                }
                            });
                        }

                        // --- CLOSURE TRIGGER: Publication Task -> PUBLICADO ---
                        if (linkedItem && currentTask.title.startsWith('[Publicar]')) {
                            console.log(`[nativeTaskService] Publication task completed. Marking ContentItem ${linkedItem.id} as PUBLICADO.`);
                            await tx.contentItem.update({
                                where: { id: linkedItem.id },
                                data: { status: 'PUBLICADO' }
                            });
                        }
                } else {
                    // Do not touch completedAt to preserve historical data
                    delete updateData.completedAt;
                }
            } else {
                // Test 2: Transition from Realizado to anything else strictly nullifies completedAt
                updateData.completedAt = null;
            }

            // --- Sincronización Bidireccional (Efecto Espejo Total) ---
                if (currentTask.contentItemId) {
                    let contentItemStatus = null;
                    const isPublicationTask = currentTask.title.startsWith('[Publicar]');

                    if (newStatus === 'REALIZADA') {
                        contentItemStatus = isPublicationTask ? 'PUBLICADO' : 'REALIZADO';
                    } else if (newStatus === 'DEVUELTA') {
                        contentItemStatus = 'DEVUELTO';
                    } else if (newStatus === 'PENDIENTE' || newStatus === 'EN_CURSO') {
                        contentItemStatus = 'EN_PRODUCCION';
                    }

                    if (contentItemStatus) {
                        await tx.contentItem.update({
                            where: { id: currentTask.contentItemId },
                            data: { status: contentItemStatus }
                        });
                    }
                }
        } else {
            // If status is not in payload, strictly do not modify completedAt
            delete updateData.completedAt;
        }

        // Con quién se comparte un pendiente privado. Va aparte de `updateData` porque
        // es una tabla propia, y se reemplaza entera: la lista que llega es la lista que
        // queda. Al dejar de ser privado no queda nadie apuntado.
        if ('viewerIds' in updateData || 'isPrivate' in updateData) {
            const stillPrivate = 'isPrivate' in updateData ? Boolean(updateData.isPrivate) : true;
            const chosen = stillPrivate && Array.isArray(updateData.viewerIds)
                ? [...new Set(updateData.viewerIds.filter(Boolean))]
                : [];
            await tx.taskViewer.deleteMany({ where: { taskId: id } });
            if (chosen.length) {
                await tx.taskViewer.createMany({ data: chosen.map((userId) => ({ taskId: id, userId })), skipDuplicates: true });
            }
        }
        delete updateData.viewerIds;

        console.log(`[nativeTaskService] FINAL updateData being sent to Prisma for ${id}:`, JSON.stringify(updateData, null, 2));

        const updatedTask = await tx.task.update({
            where: { id },
            data: updateData,
            include: {
                client: {
                    select: { name: true, logoUrl: true, slug: true }
                },
                assignee: true,
                creator: {
                    select: { id: true, name: true, avatarUrl: true, email: true, role: true }
                },
                taskComments: {
                    include: { author: { select: taskCommentAuthorSelect }, attachments: true },
                    orderBy: { createdAt: 'desc' }
                },
                taskAttachments: true,
                contentItem: {
                    include: {
                        plan: {
                            select: taskContentPlanSelect
                        }
                    }
                }
            }
        });

        if (currentTask.status === 'DEVUELTA' && updatedTask.status !== 'DEVUELTA') {
            await recordQualityStreakTransition(tx, currentTask, updatedTask);
        }
        const recognitionAt = recognitionBefore?.task.status !== 'REALIZADA' && updatedTask.status === 'REALIZADA' ? updatedTask.completedAt : new Date();
        await finishTaskRecognition(tx, recognitionBefore, updatedTask, recognitionAt);
        if (updatedTask.contentItem) await recordPlanRecognition(tx, updatedTask.contentItem.planId, recognitionAt, { allowAward: false });
        return { currentTask, updatedTask, isCorrected, isReturned };
        });

        const { currentTask, updatedTask, isCorrected, isReturned } = transition;

        recordOperationalTrace({
            eventType: 'TASK_UPDATED',
            actorId: updaterId,
            subjectUserId: updatedTask.assignee?.userId || null,
            taskId: updatedTask.id,
            metadata: {
                changedFields: Object.keys(data || {}),
                fromStatus: currentTask.status,
                toStatus: updatedTask.status
            }
        }).catch((error) => {
            console.error('[nativeTaskService] Update trace failed:', error?.message || error);
        });

        // Map for frontend compatibility without skipping post-commit notifications.
        let responseTask = updatedTask;
        if (updatedTask.contentItem && updatedTask.contentItem.plan) {
            responseTask = {
                ...updatedTask,
                contentPlanId: updatedTask.contentItem.plan.id, // Ensure ID is at root
                plan: {
                    id: updatedTask.contentItem.plan.id,
                    slug: updatedTask.contentItem.plan.client?.slug || updatedTask.client?.slug,
                    month: updatedTask.contentItem.plan.month,
                    year: updatedTask.contentItem.plan.year,
                    status: updatedTask.contentItem.plan.status
                }
            };
        }

        // --- Notificaciones de Prioridad o Especial ---
        if (updatedTask.assigneeId) {
            const isPriority = updatedTask.isPriority;
            const isSpecial = updatedTask.isSpecial;

            const assigneeChanged = updatedTask.assigneeId !== currentTask.assigneeId;
            const priorityMarked = isPriority && !currentTask.isPriority;
            const specialMarked = isSpecial && !currentTask.isSpecial;

            // Trigger if newly marked OR if reassigned while already being priority/special
            if (priorityMarked || specialMarked || (assigneeChanged && (isPriority || isSpecial))) {
                try {
                    const assigneeTeamMember = await prisma.teamMember.findUnique({
                        where: { id: updatedTask.assigneeId },
                        select: { email: true }
                    });

                    if (assigneeTeamMember && assigneeTeamMember.email) {
                        const assigneeUser = await prisma.user.findUnique({
                            where: { email: assigneeTeamMember.email.trim().toLowerCase() },
                            select: { id: true }
                        });

                        if (assigneeUser && assigneeUser.id !== updaterId) {
                            let message = "";
                            if (assigneeChanged && (isPriority || isSpecial)) {
                                message = `Se te ha asignado una tarea ${isPriority ? 'PRIORITARIA' : ''}${isPriority && isSpecial ? ' y ' : ''}${isSpecial ? 'ESPECIAL' : ''}: ${updatedTask.title}`;
                            } else if (priorityMarked && specialMarked) {
                                message = `Se ha marcado como PRIORITARIA y ESPECIAL la tarea: ${updatedTask.title}`;
                            } else if (priorityMarked) {
                                message = `Se ha marcado como PRIORITARIA la tarea: ${updatedTask.title}`;
                            } else {
                                message = `Se ha marcado como ESPECIAL la tarea: ${updatedTask.title}`;
                            }

                            await createNotification({
                                userId: assigneeUser.id,
                                message,
                                type: 'TASK_UPDATED',
                                relatedId: id
                            });
                        }
                    }
                } catch (err) {
                    console.error("Error sending update notification:", err);
                }
            }
        }

        // --- Compromiso con hora: la persona se entera cuando un manager fija, mueve o quita la hora ---
        if ('focusDeadlineAt' in data && updatedTask.assigneeId) {
            try {
                const assigneeMember = await prisma.teamMember.findUnique({
                    where: { id: updatedTask.assigneeId },
                    select: { userId: true }
                });
                const assigneeUser = assigneeMember?.userId ? { id: assigneeMember.userId } : null;
                if (assigneeUser && assigneeUser.id !== updaterId) {
                    const time = bogotaTimeOf(updatedTask.focusDeadlineAt);
                    await createNotification({
                        userId: assigneeUser.id,
                        message: updatedTask.focusDeadlineAt
                            ? `Tienes un compromiso: «${updatedTask.title}» hasta las ${time}. Hasta que la termines, tus demás pendientes quedan bloqueados.`
                            : `Se quitó la hora de compromiso de «${updatedTask.title}». Tus pendientes vuelven a estar disponibles.`,
                        type: 'TASK_FOCUS_SET',
                        relatedId: id,
                        actorId: updaterId
                    });
                }
            } catch (focusNotifyError) {
                console.error('[nativeTaskService] Focus notification failed:', focusNotifyError?.message || focusNotifyError);
            }
        }

        // --- Notificación de Devolución ---
        if (isReturned && updatedTask.creatorId && updatedTask.creatorId !== updaterId) {
             try {
                await createNotification({
                    userId: updatedTask.creatorId,
                    message: `Se ha devuelto tu tarea: ${updatedTask.title}`,
                    type: 'TASK_RETURNED',
                    relatedId: id
                });
             } catch (notifyError) {
                console.error("[nativeTaskService] Failed to send return notification:", notifyError);
             }
        }

        // --- Notificación a Seguidores (Tarea Completada) ---
        if ('status' in data && (statusMapper[data.status] || data.status) === 'REALIZADA' && currentTask.status !== 'REALIZADA') {
            try {
                const followers = await prisma.taskFollower.findMany({
                    where: { taskId: id },
                    select: { userId: true }
                });

                for (const follower of followers) {
                    // Don't notify the person who completed it
                    if (follower.userId !== updaterId) {
                        await createNotification({
                            userId: follower.userId,
                            message: `La tarea que sigues ha sido COMPLETADA: ${updatedTask.title}`,
                            type: 'TASK_COMPLETED',
                            relatedId: id
                        });
                    }
                }
            } catch (followNotifyErr) {
                console.error("[nativeTaskService] Follower notification failed:", followNotifyErr);
            }
        }

        // --- Cierre de Ciclo: Notificación de Corrección (Post-DB Success) ---
        // Solo si la transición fue exitosa y cumplía los criterios de corrección
        if (isCorrected) {
            console.log(`[nativeTaskService] Update SUCCESS for ${id}. Current status in DB: ${updatedTask.status}. Triggering notification...`);
            try {
                let targetUserId = null;
                let notificationMessage = `La tarea "${updatedTask.title}" ha sido corregida y reintegrada.`;

                // Destinatario Inteligente:
                // Si el usuario que reintegra es el creador, notificamos al responsable (Asignado)
                if (updaterId && updaterId === updatedTask.creatorId && updatedTask.assigneeId) {
                    // Resolver el UserID a partir del TeamMember (assigneeId)
                    const assigneeTeamMember = await prisma.teamMember.findUnique({
                        where: { id: updatedTask.assigneeId },
                        select: { email: true }
                    });

                    if (assigneeTeamMember && assigneeTeamMember.email) {
                        const assigneeUser = await prisma.user.findUnique({
                            where: { email: assigneeTeamMember.email.trim().toLowerCase() },
                            select: { id: true }
                        });

                        if (assigneeUser) {
                            targetUserId = assigneeUser.id;
                            notificationMessage = `La tarea "${updatedTask.title}" que devolviste ya ha sido corregida y está lista en tus pendientes.`;
                        }
                    }
                }

                // Fallback: Si no se pudo determinar el asignado o el updater no es el creador,
                // notificamos al creador (comportamiento anterior) para no dejar el ciclo abierto.
                if (!targetUserId && updatedTask.creatorId) {
                    targetUserId = updatedTask.creatorId;
                }

                if (targetUserId) {
                    await createNotification({
                        userId: targetUserId,
                        message: notificationMessage,
                        type: 'TASK_CORRECTED',
                        relatedId: id
                    });
                    console.log(`[nativeTaskService] Reintegration notification sent to ${targetUserId}`);
                }
            } catch (notifyError) {
                console.error("[nativeTaskService] Failed to send correction notification:", notifyError);
            }
        }

        return responseTask;
    } catch (error) {
        console.error("Error updating native task:", error);
        throw error;
    }
};

export const auditAndDeleteTask = async (id, reason, deletedByUserId = null) => {
    try {
        // Use a transaction to ensure we log and delete atomically
        return await recognitionTransaction(prisma, async (tx) => {
            const recognitionBefore = await prepareTaskRecognition(tx, id);
            // 1. Get task data for the log
            const task = await tx.task.findUnique({
                where: { id },
                select: { title: true, clientId: true, status: true }
            });

            if (!task) {
                throw new Error(`Task with id ${id} not found for auditing`);
            }

            // 2. Create Audit Log
            await tx.deletedTaskLog.create({
                data: {
                    originalTaskId: id,
                    taskTitle: task.title,
                    clientId: task.clientId,
                    reason: reason,
                    deletedById: deletedByUserId
                }
            });

            // 3. Perform Hard Delete
            await tx.task.delete({
                where: { id }
            });
            await recordQualityStreakTransition(tx, task, null);
            await finishTaskRecognition(tx, recognitionBefore, null);

            console.log(`[nativeTaskService] Task ${id} ("${task.title}") hard deleted with reason: ${reason}`);
            return { success: true };
        });
    } catch (error) {
        console.error("Error auditing and deleting native task:", error);
        throw error;
    }
};

export const deleteTask = async (id) => {
    try {
        await recognitionTransaction(prisma, async tx => {
            const recognitionBefore = await prepareTaskRecognition(tx, id);
            const deletedTask = await tx.task.delete({ where: { id } });
            await recordQualityStreakTransition(tx, deletedTask, null);
            await finishTaskRecognition(tx, recognitionBefore, null);
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting native task:", error);
        throw error;
    }
};

export const toggleTaskFollow = async (taskId, userId) => {
    try {
        const existingFollower = await prisma.taskFollower.findUnique({
            where: {
                taskId_userId: { taskId, userId }
            }
        });

        if (existingFollower) {
            await prisma.taskFollower.delete({
                where: {
                    taskId_userId: { taskId, userId }
                }
            });
            return false; // Unfollowed
        } else {
            await prisma.taskFollower.create({
                data: { taskId, userId }
            });
            return true; // Followed
        }
    } catch (error) {
        console.error("Error toggling task follow:", error);
        throw error;
    }
};

export const checkIsFollowing = async (taskId, userId) => {
    try {
        const follower = await prisma.taskFollower.findUnique({
            where: {
                taskId_userId: { taskId, userId }
            }
        });
        return !!follower;
    } catch (error) {
        console.error("Error checking follow status:", error);
        throw error;
    }
};
