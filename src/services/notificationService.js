
import prisma from '../lib/prisma.js';

export const createNotification = async (data) => {
    try {
        const notification = await prisma.notification.create({
            data: {
                userId: data.userId,
                message: data.message,
                type: data.type,
                relatedId: data.relatedId,
                resourceId: data.resourceId || data.relatedId,
                url: data.url || null,
                taskId: data.taskId || (data.type?.startsWith('TASK_') ? data.relatedId : null)
            }
        });
        return notification;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error creating notification:`, error?.message || error);
        throw error;
    }
};

export const processMentionsAndNotifications = async (taskId, commentContent, authorId) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { id: true, title: true, assigneeId: true }
        });
        if (!task) return;

        // Resolve assignee User ID
        let assigneeUserId = null;
        if (task.assigneeId) {
            const tm = await prisma.teamMember.findUnique({
                where: { id: task.assigneeId },
                select: { userId: true, email: true }
            });
            if (tm) {
                if (tm.userId) {
                    assigneeUserId = tm.userId;
                } else if (tm.email) {
                    const u = await prisma.user.findUnique({
                        where: { email: tm.email.trim().toLowerCase() },
                        select: { id: true }
                    });
                    if (u) assigneeUserId = u.id;
                }
            }
        }

        // Get all active users
        const allUsers = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, name: true, email: true }
        });

        // Track who has already been notified to avoid duplicate notifications
        const notifiedUserIds = new Set();
        if (authorId) {
            notifiedUserIds.add(authorId); // Do not notify the author
        }

        // 1. Process mentions (@User or @userId)
        for (const user of allUsers) {
            const mentionByName = `@${user.name.toLowerCase()}`;
            const mentionById = `@${user.id}`;
            const normalizedContent = commentContent.toLowerCase();

            if (normalizedContent.includes(mentionByName) || commentContent.includes(mentionById)) {
                if (!notifiedUserIds.has(user.id)) {
                    notifiedUserIds.add(user.id);
                    await createNotification({
                        userId: user.id,
                        message: `Te han mencionado en la tarea "${task.title}": "${commentContent.substring(0, 60)}..."`,
                        type: 'TASK_MENTION',
                        relatedId: task.id,
                        taskId: task.id
                    });
                }
            }
        }

        // 2. Process Assignee notification if they haven't been notified (and are not the author)
        if (assigneeUserId && !notifiedUserIds.has(assigneeUserId)) {
            await createNotification({
                userId: assigneeUserId,
                message: `Nuevo comentario en tu tarea asignada "${task.title}": "${commentContent.substring(0, 60)}..."`,
                type: 'TASK_COMMENT',
                relatedId: task.id,
                taskId: task.id
            });
        }
    } catch (err) {
        console.error("Error processing mentions and notifications:", err);
    }
};

export const markAllNotificationsAsRead = async (userId) => {
    try {
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error marking all as read:`, error?.message || error);
        throw error;
    }
};

export const getUnreadNotificationCount = async (userId) => {
    try {
        const count = await prisma.notification.count({
            where: {
                userId,
                isRead: false
            }
        });
        return count;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error counting notifications:`, error?.message || error);
        throw error;
    }
};

export const getNotifications = async (userId) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        return notifications;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error fetching notifications:`, error?.message || error);
        throw error;
    }
};

export const markAsRead = async (notificationId) => {
    try {
        await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error marking as read:`, error?.message || error);
        throw error;
    }
};
