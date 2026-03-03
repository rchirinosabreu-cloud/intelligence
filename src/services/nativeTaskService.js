import prisma from '../lib/prisma.js';

export const getDashboardMetrics = async () => {
    try {
        // Total historical completed tasks
        const totalCompleted = await prisma.task.count({
            where: {
                OR: [
                    { status: 'Realizado' },
                    { completedAt: { not: null } }
                ]
            }
        });

        // Pending tasks (anything not completed)
        const pendingCount = await prisma.task.count({
            where: {
                status: {
                    not: 'Realizado'
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

export const getTasks = async (clientId) => {
    try {
        const whereClause = clientId ? { clientId } : {};
        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true
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

export const createTask = async ({ title, dueDate, assigneeId, comments, status, clientId }) => {
    try {
        const newTask = await prisma.task.create({
            data: {
                title,
                dueDate: dueDate ? new Date(dueDate) : null,
                assigneeId,
                comments,
                status: status || 'Pendiente',
                clientId
            },
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true
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
        // Option B: Backend filtering. Determine the date boundaries.
        // If dateString is provided (YYYY-MM-DD), use it. Otherwise, default to 'today'.
        const targetDate = dateString ? new Date(dateString) : new Date();

        // Construct the start and end of the target day
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

        const tasks = await prisma.task.findMany({
            where: {
                status: 'Realizado',
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
                assignee: true
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
            select: { status: true, completedAt: true }
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
        if ('status' in updateData) {
            const newStatus = updateData.status;

            if (newStatus === 'Realizado') {
                // Edge Case A: Only set completedAt to NOW if it wasn't already 'Realizado' / completed.
                // If it already has a completedAt, preserve the history.
                if (!currentTask.completedAt || currentTask.status !== 'Realizado') {
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

        const updatedTask = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                },
                assignee: true
            }
        });
        return updatedTask;
    } catch (error) {
        console.error("Error updating native task:", error);
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
