import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getTasks = async (clientId) => {
    try {
        const whereClause = clientId ? { clientId } : {};
        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                }
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

export const createTask = async ({ title, dueDate, assignee, comments, status, clientId }) => {
    try {
        const newTask = await prisma.task.create({
            data: {
                title,
                dueDate: dueDate ? new Date(dueDate) : null,
                assignee,
                comments,
                status: status || 'Pendiente',
                clientId
            },
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                }
            }
        });
        return newTask;
    } catch (error) {
        console.error("Error creating native task:", error);
        throw error;
    }
};

export const updateTask = async (id, data) => {
    try {
        const updateData = { ...data };
        if (updateData.dueDate) {
            updateData.dueDate = new Date(updateData.dueDate);
        }

        const updatedTask = await prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                client: {
                    select: { name: true, logoUrl: true }
                }
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
