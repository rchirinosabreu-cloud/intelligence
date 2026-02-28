import prisma from '../lib/prisma.js';

export const getClientTasks = async (clientId) => {
    try {
        const tasks = await prisma.clientTask.findMany({
            where: { clientId },
            include: { assignee: true },
            orderBy: { createdAt: 'desc' }
        });
        return tasks;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [ClientTaskService] Error fetching client tasks:`, error?.message || error);
        throw error;
    }
};

export const createClientTask = async (data) => {
    try {
        const task = await prisma.clientTask.create({
            data: {
                clientId: data.clientId,
                text: data.text,
                completed: false,
                dueDate: data.dueDate ? new Date(data.dueDate) : null,
                assigneeId: data.assigneeId || null
            },
            include: { assignee: true }
        });
        return task;
    } catch (error) {
        console.error("Error creating client task:", error);
        throw error;
    }
};

export const updateTaskStatus = async (taskId, data) => {
    try {
        // Construct update object dynamically
        const updateData = {};
        if (data.completed !== undefined) updateData.completed = data.completed;
        if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;

        const task = await prisma.clientTask.update({
            where: { id: taskId },
            data: updateData,
            include: { assignee: true }
        });
        return task;
    } catch (error) {
        console.error("Error updating task status:", error);
        throw error;
    }
};

export const deleteTask = async (taskId) => {
    try {
        await prisma.clientTask.delete({
            where: { id: taskId }
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting task:", error);
        throw error;
    }
};
