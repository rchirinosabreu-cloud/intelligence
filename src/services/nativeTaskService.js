import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { classifyTaskWithAI } from './aiService.js';

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

export const getQualityStreak = async () => {
    try {
        const lastReturnedTask = await prisma.task.findFirst({
            where: {
                OR: [
                    { status: 'DEVUELTA' },
                    { isReturned: true }
                ]
            },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });

        const currentReturnedTasksCount = await prisma.task.count({
            where: {
                OR: [
                    { status: 'DEVUELTA' },
                    { isReturned: true }
                ]
            }
        });

        const now = new Date();

        if (!lastReturnedTask) {
            // If no task has EVER been returned, we count since the first task was created
            const firstTask = await prisma.task.findFirst({
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true }
            });

            if (!firstTask) return { currentStreakDays: 0, currentReturnedTasksCount: 0 };

            const diffTime = Math.abs(now - firstTask.createdAt);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return { currentStreakDays: diffDays, currentReturnedTasksCount };
        }

        const diffTime = Math.abs(now - lastReturnedTask.updatedAt);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return { currentStreakDays: diffDays, currentReturnedTasksCount };
    } catch (error) {
        console.error("Error calculating quality streak:", error);
        throw error;
    }
};

export const getTasks = async (clientId) => {
    try {
        const whereClause = clientId ? { clientId } : {};

        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                client: {
                    select: { name: true, logoUrl: true, slug: true }
                },
                assignee: true,
                creator: true,
                contentItem: {
                    include: {
                        plan: {
                            include: {
                                client: { select: { slug: true } }
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'asc' // Oldest first to match current kanban logic
            }
        });

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
    title, dueDate, assigneeId, creatorId, comments, status, clientId,
    isPriority = false, isSpecial = false, specialType = null, referenceUrl = null,
    contentItemId = null
}) => {
    try {
        const mappedStatus = statusMapper[status] || 'PENDIENTE';

        // Create the task immediately
        const newTask = await prisma.task.create({
            data: {
                title,
                dueDate: dueDate ? new Date(dueDate) : null,
                assigneeId,
                creatorId,
                comments,
                status: mappedStatus,
                clientId,
                isPriority,
                isSpecial,
                specialType,
                referenceUrl,
                contentItemId
            },
            include: {
                client: {
                    select: { name: true, logoUrl: true, slug: true }
                },
                assignee: true,
                creator: true,
                contentItem: {
                    include: {
                        plan: {
                            include: {
                                client: { select: { slug: true } }
                            }
                        }
                    }
                }
            }
        });

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

        // Background tasks: AI Classification, Embeddings, etc.
        // We do NOT await this, allowing the function to return immediately
        (async () => {
            try {
                const classification = await classifyTaskWithAI(title, comments || "");
                if (classification) {
                    await prisma.task.update({
                        where: { id: newTask.id },
                        data: {
                            aiCategory: normalizeCategory(classification.categoria),
                            aiComplexity: classification.complejidad
                        }
                    });
                    console.log(`[nativeTaskService] Background AI classification completed for task ${newTask.id}`);
                }
            } catch (aiErr) {
                console.warn(`[nativeTaskService] Background task classification failed for task ${newTask.id}:`, aiErr.message);
            }
        })();

        return newTask;
    } catch (error) {
        console.error("Error creating native task:", error);
        throw error;
    }
};

export const getCompletedTasks = async (dateString) => {
    try {
        // Fix Timezone Offset (America/Bogota UTC-5)
        let targetDateStr = dateString;

        if (!targetDateStr) {
            // If no date provided, get "today" in UTC-5
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Bogota',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            targetDateStr = formatter.format(new Date()); // Returns YYYY-MM-DD
        }

        // Construct the boundaries in strict UTC to match Prisma's stored values
        // A day in Bogota (e.g. 2026-03-03) starts at 2026-03-03T05:00:00.000Z
        // and ends at 2026-03-04T04:59:59.999Z
        const startOfDay = new Date(`${targetDateStr}T05:00:00.000Z`);

        // To get the end of the day, add 24 hours and subtract 1 millisecond
        const endOfDay = new Date(startOfDay.getTime() + (24 * 60 * 60 * 1000) - 1);

        const tasks = await prisma.task.findMany({
            where: {
                status: 'REALIZADA',
                completedAt: {
                    not: null,
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true,
                creator: true
            },
            orderBy: {
                completedAt: 'desc'
            }
            // Removed take: 100 as we are now strictly filtering by day
        });
        return tasks;
    } catch (error) {
        console.error("Error fetching completed tasks:", error);
        throw error;
    }
};

export const updateTask = async (id, data, updaterId = null) => {
    try {
        // 1. Fetch current task state to evaluate transitions (TDD Edge Cases)
        const currentTask = await prisma.task.findUnique({
            where: { id },
            select: {
                title: true,
                status: true,
                completedAt: true,
                startedAt: true,
                returnCount: true,
                isReturned: true,
                returnedAt: true,
                comments: true,
                isPriority: true,
                isSpecial: true,
                assigneeId: true,
                creatorId: true,
                contentItemId: true
            }
        });

        if (!currentTask) {
            throw new Error(`Task with id ${id} not found`);
        }

        const updateData = { ...data };

        // Normalize category if provided in the update payload
        if (updateData.aiCategory) {
            updateData.aiCategory = normalizeCategory(updateData.aiCategory);
        }

        // Handle explicit incoming date parsing
        if (updateData.dueDate) {
            updateData.dueDate = new Date(updateData.dueDate);
        }

        // Strict Task Lifecycle Logic (completedAt)
        // Only evaluate if the payload actually attempts to change the 'status' (Edge Case B)
        let isCorrected = false;
        let isReturned = false;
        if ('status' in updateData) {
            updateData.status = statusMapper[updateData.status] || updateData.status;
            const newStatus = updateData.status;
            const oldStatus = currentTask.status;

            isReturned = (newStatus === 'DEVUELTA' && oldStatus !== 'DEVUELTA');

            // Radar de Mérito: Increment returnCount on transition to DEVUELTA
            if (isReturned) {
                updateData.returnCount = (currentTask.returnCount || 0) + 1;
                updateData.isReturned = true;
                updateData.returnedAt = new Date();
            }

            // Radar de Mérito: Initial startedAt logic
            if (newStatus === 'EN_CURSO' && !currentTask.startedAt) {
                updateData.startedAt = new Date();
            }

            // --- Lógica de Cierre de Ciclo (Notificación de Corrección) ---
            // Si el estado anterior era visually returned y el nuevo es 'Pendiente' o 'En proceso'
            // Consideramos visualmente devuelto si tiene el tag o el status DEVUELTA o el flag isReturned.
            const wasVisuallyReturned = currentTask.isReturned || (oldStatus === 'DEVUELTA') ||
                                       (oldStatus === 'PENDIENTE' && (currentTask.comments || '').includes('[DEVOLUCIÓN'));

            isCorrected = wasVisuallyReturned &&
                              (newStatus === 'PENDIENTE' || newStatus === 'EN_CURSO');

            if (isCorrected) {
                updateData.isReturned = false;
                updateData.returnedAt = null;
            }

            // Fix Reintegration: Add [REINTEGRADA] tag
            if (isCorrected) {
                const now = new Intl.DateTimeFormat('es-CO', {
                    timeZone: 'America/Bogota',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                }).format(new Date());
                const reintegratedTag = `[REINTEGRADA - ${now}]`;

                // Add tag to comments if not already present after last DEVOLUCIÓN
                const currentComments = updateData.comments || currentTask.comments || '';
                updateData.comments = `${reintegratedTag}\n${currentComments}`.trim();
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
                    try {
                        const linkedItem = await prisma.contentItem.findUnique({
                            where: { id: currentTask.contentItemId || 'none' },
                            include: {
                                plan: {
                                    include: { owner: true }
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

                            await prisma.task.create({
                                data: {
                                    title: `[Publicar] ${linkedItem.format}: ${linkedItem.objective}`,
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
                            await prisma.contentItem.update({
                                where: { id: linkedItem.id },
                                data: { status: 'PUBLICADO' }
                            });
                        }
                    } catch (automationErr) {
                        console.error("[nativeTaskService] Hand-off Automation Failed:", automationErr);
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
            try {
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
                        await prisma.contentItem.update({
                            where: { id: currentTask.contentItemId },
                            data: { status: contentItemStatus }
                        });
                    }
                }
            } catch (mirrorErr) {
                console.error("[nativeTaskService] Mirror Effect Failed:", mirrorErr);
            }
        } else {
            // If status is not in payload, strictly do not modify completedAt
            delete updateData.completedAt;
        }

        console.log(`[nativeTaskService] FINAL updateData being sent to Prisma for ${id}:`, JSON.stringify(updateData, null, 2));

        const updatedTask = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                client: {
                    select: { name: true, logoUrl: true, slug: true }
                },
                assignee: true,
                creator: true,
                contentItem: {
                    include: {
                        plan: {
                            include: {
                                client: { select: { slug: true } }
                            }
                        }
                    }
                }
            }
        });

        // Map for frontend compatibility
        if (updatedTask.contentItem && updatedTask.contentItem.plan) {
            return {
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

        return updatedTask;
    } catch (error) {
        console.error("Error updating native task:", error);
        throw error;
    }
};

export const auditAndDeleteTask = async (id, reason, deletedByUserId = null) => {
    try {
        // Use a transaction to ensure we log and delete atomically
        return await prisma.$transaction(async (tx) => {
            // 1. Get task data for the log
            const task = await tx.task.findUnique({
                where: { id },
                select: { title: true, clientId: true }
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
        await prisma.task.delete({
            where: { id }
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting native task:", error);
        throw error;
    }
};
