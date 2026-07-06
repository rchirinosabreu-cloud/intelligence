import prisma from '../lib/prisma.js';
import { getDashboardMetrics, getQualityStreak, getCompletedTasks, getTasks, createTask, updateTask, auditAndDeleteTask } from '../services/nativeTaskService.js';
import { getClientTasks, createClientTask, updateTaskStatus as updateClientTaskStatus, deleteTask } from '../services/clientTaskService.js';
import { createNotification } from '../services/notificationService.js';

export const getMetrics = async (req, res) => {
    try {
        const metrics = await getDashboardMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch metrics", details: error.message });
    }
};

export const getStreak = async (req, res) => {
    try {
        const streak = await getQualityStreak();
        res.json(streak);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch quality streak", details: error.message });
    }
};

export const getCompleted = async (req, res) => {
    try {
        const tasks = await getCompletedTasks(req.query.date);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch completed tasks", details: error.message });
    }
};

export const getAllTasks = async (req, res) => {
    try {
        const tasks = await getTasks(req.query.clientId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch native tasks", details: error.message });
    }
};

export const createNewTask = async (req, res) => {
    try {
        const taskData = { ...req.body, creatorId: req.user.userId };
        if (!taskData.title || !taskData.clientId) {
            return res.status(400).json({ error: "Missing required fields (title, clientId)" });
        }
        const task = await createTask(taskData);

        if (task.assigneeId && (task.isPriority || task.isSpecial)) {
            try {
                const assigneeTeamMember = await prisma.teamMember.findUnique({
                    where: { id: task.assigneeId },
                    select: { email: true }
                });

                if (assigneeTeamMember && assigneeTeamMember.email) {
                    const assigneeUser = await prisma.user.findUnique({
                        where: { email: assigneeTeamMember.email.trim().toLowerCase() },
                        select: { id: true }
                    });

                    if (assigneeUser && assigneeUser.id !== req.user.userId) {
                        const message = task.isPriority && task.isSpecial
                            ? `Se te ha asignado una tarea PRIORITARIA y ESPECIAL: ${task.title}`
                            : task.isPriority ? `Se te ha asignado una tarea PRIORITARIA: ${task.title}`
                            : `Se te ha asignado una tarea ESPECIAL: ${task.title}`;

                        await createNotification({
                            userId: assigneeUser.id,
                            message,
                            type: 'TASK_ASSIGNED',
                            relatedId: task.id
                        });
                    }
                }
            } catch (err) {
                console.error("Error sending task notification:", err);
            }
        }
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task", details: error.message });
    }
};

export const updateExistingTask = async (req, res) => {
    try {
        const updatedTask = await updateTask(req.params.taskId, req.body, req.user?.userId);
        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
};

export const deleteExistingTask = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: "Missing deletion reason" });
        await auditAndDeleteTask(req.params.taskId, reason, req.user?.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
};

export const addTaskComment = async (req, res) => {
    try {
        const { content, type } = req.body;
        const { taskId } = req.params;
        const authorId = req.user.userId;

        if (!content) return res.status(400).json({ error: "Content is required" });

        const comment = await prisma.taskComment.create({
            data: {
                taskId,
                authorId,
                content,
                type: type || 'human'
            },
            include: { author: true }
        });

        res.status(201).json(comment);
    } catch (error) {
        res.status(500).json({ error: "Failed to add comment", details: error.message });
    }
};

export const getClientTasksHandler = async (req, res) => {
    try {
        const tasks = await getClientTasks(req.params.clientId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
    }
};

export const createClientTaskHandler = async (req, res) => {
    try {
        const { text, dueDate, assigneeId } = req.body;
        if (!text) return res.status(400).json({ error: "Missing text" });
        const task = await createClientTask({ clientId: req.params.clientId, text, dueDate, assigneeId });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task", details: error.message });
    }
};

export const updateClientTaskHandler = async (req, res) => {
    try {
        const task = await updateClientTaskStatus(req.params.taskId, req.body);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
};

export const deleteClientTaskHandler = async (req, res) => {
    try {
        await deleteTask(req.params.taskId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
};
