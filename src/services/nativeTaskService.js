import prisma from '../lib/prisma.js';

export const getDashboardMetrics = async () => {
    try {
        // Total historical completed tasks (excluding ELIMINADA)
        const totalCompleted = await prisma.task.count({
            where: {
                status: 'REALIZADA'
            }
        });

        // Pending tasks (excluding ELIMINADA)
        const pendingCount = await prisma.task.count({
            where: {
                status: {
                    in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA']
                }
            }
        });

        const totalActive = pendingCount + totalCompleted;
        const percentage = totalActive > 0 ? Math.round((totalCompleted / totalActive) * 100) : 0;

        return {
            total: totalActive,
            completed: totalCompleted,
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
                    {
                        status: 'PENDIENTE',
                        comments: { contains: '[DEVOLUCIÓN' }
                    }
                ]
            },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });

        const currentReturnedTasksCount = await prisma.task.count({
            where: {
                OR: [
                    { status: 'DEVUELTA' },
                    {
                        status: 'PENDIENTE',
                        comments: { contains: '[DEVOLUCIÓN' }
                    }
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
        // Strictly exclude ELIMINADA tasks from Kanban and general listings
        whereClause.status = { not: 'ELIMINADA' };

        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true,
                creator: true
            },
            orderBy: {
                createdAt: 'asc' // Oldest first to match current kanban logic
            }
        });
        return tasks;
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
    'Eliminada': 'ELIMINADA',
    'PENDIENTE': 'PENDIENTE',
    'EN_CURSO': 'EN_CURSO',
    'REALIZADA': 'REALIZADA',
    'DEVUELTA': 'DEVUELTA',
    'ELIMINADA': 'ELIMINADA'
};

export const createTask = async ({ title, dueDate, assigneeId, creatorId, comments, status, clientId }) => {
    try {
        const mappedStatus = statusMapper[status] || 'PENDIENTE';

        const newTask = await prisma.task.create({
            data: {
                title,
                dueDate: dueDate ? new Date(dueDate) : null,
                assigneeId,
                creatorId,
                comments,
                status: mappedStatus,
                clientId
            },
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true,
                creator: true
            }
        });
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

export const updateTask = async (id, data) => {
    try {
        // 1. Fetch current task state to evaluate transitions (TDD Edge Cases)
        const currentTask = await prisma.task.findUnique({
            where: { id },
            select: { status: true, completedAt: true, comments: true }
        });

        if (!currentTask) {
            throw new Error(`Task with id ${id} not found`);
        }

        const updateData = { ...data };

        // Handle explicit incoming date parsing
        if (updateData.dueDate) {
            updateData.dueDate = new Date(updateData.dueDate);
        }

        // Strict Task Lifecycle Logic (completedAt)
        // Only evaluate if the payload actually attempts to change the 'status' (Edge Case B)
        let isCorrected = false;
        if ('status' in updateData) {
            updateData.status = statusMapper[updateData.status] || updateData.status;
            const newStatus = updateData.status;
            const oldStatus = currentTask.status;

            // --- Lógica de Cierre de Ciclo (Notificación de Corrección) ---
            // Si el estado anterior era visually returned y el nuevo es 'Pendiente' o 'En proceso'
            // Consideramos visualmente devuelto si tiene el tag o el status DEVUELTA.
            const wasVisuallyReturned = (oldStatus === 'DEVUELTA') ||
                                       (oldStatus === 'PENDIENTE' && (currentTask.comments || '').includes('[DEVOLUCIÓN'));

            isCorrected = wasVisuallyReturned &&
                              (newStatus === 'PENDIENTE' || newStatus === 'EN_CURSO');

            if (newStatus === 'REALIZADA') {
                // Edge Case A: Only set completedAt to NOW if it wasn't already 'Realizado' / completed.
                // If it already has a completedAt, preserve the history.
                if (!currentTask.completedAt || currentTask.status !== 'REALIZADA') {
                    updateData.completedAt = new Date();
                } else {
                    // Do not touch completedAt to preserve historical data
                    delete updateData.completedAt;
                }
            } else {
                // Test 2: Transition from Realizado to anything else strictly nullifies completedAt
                updateData.completedAt = null;
            }
        } else {
            // If status is not in payload, strictly do not modify completedAt
            delete updateData.completedAt;
        }

        console.log(`[nativeTaskService] Executing Prisma update for ${id}:`, JSON.stringify(updateData, null, 2));

        const updatedTask = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true,
                creator: true
            }
        });

        // --- Cierre de Ciclo: Notificación de Corrección (Post-DB Success) ---
        // Solo si la transición fue exitosa y cumplía los criterios de corrección
        if (isCorrected) {
            try {
                // Usamos la info del objeto actualizado para la notificación
                if (updatedTask.assigneeId) {
                    const teamMember = await prisma.teamMember.findUnique({ where: { id: updatedTask.assigneeId } });

                    if (teamMember && teamMember.email) {
                        const targetUser = await prisma.user.findUnique({
                            where: { email: teamMember.email.trim().toLowerCase() }
                        });

                        if (targetUser) {
                            await prisma.notification.create({
                                data: {
                                    userId: targetUser.id,
                                    message: `La tarea "${updatedTask.title}" que devolviste ha sido corregida y está lista para trabajarse.`,
                                    type: 'TASK_CORRECTED',
                                    relatedId: id
                                }
                            });
                            console.log(`[nativeTaskService] Correction notification sent to ${targetUser.email}`);
                        }
                    }
                }
            } catch (notifyError) {
                console.error("[nativeTaskService] Failed to send correction notification:", notifyError);
                // No lanzamos error para no romper la respuesta del update exitoso
            }
        }

        return updatedTask;
    } catch (error) {
        console.error("Error updating native task:", error);
        throw error;
    }
};

export const softDeleteTask = async (id, reason) => {
    try {
        const updatedTask = await prisma.task.update({
            where: { id },
            data: {
                status: 'ELIMINADA',
                deletionReason: reason,
                completedAt: null // Explicitly nullify if it was previously completed
            }
        });
        return updatedTask;
    } catch (error) {
        console.error("Error soft deleting native task:", error);
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
