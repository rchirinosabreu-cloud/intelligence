
import prisma from '../lib/prisma.js';
import { cleanNotificationPreview } from '../utils/notificationUtils.js';
import { recordOperationalTrace } from './operationalTraceService.js';

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
        recordOperationalTrace({
            eventType: 'NOTIFICATION_CREATED',
            actorId: data.actorId || null,
            subjectUserId: data.userId,
            taskId: notification.taskId || null,
            metadata: { notificationType: notification.type || 'GENERAL' }
        }).catch((traceError) => {
            console.error('[NotificationService] Creation trace failed:', traceError?.message || traceError);
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
        const commentPreview = cleanNotificationPreview(commentContent, 90);

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
                        message: `Te han mencionado en la tarea "${task.title}": "${commentPreview}"`,
                        type: 'TASK_MENTION',
                        relatedId: task.id,
                        taskId: task.id
                    });
                }
            }
        }

        // 2. Process Thread Participant notifications (TASK_COMMENT_REPLY)
        const previousComments = await prisma.taskComment.findMany({
            where: { taskId },
            select: { authorId: true }
        });
        const threadParticipants = new Set(previousComments.map(c => c.authorId).filter(Boolean));
        if (assigneeUserId) {
            threadParticipants.add(assigneeUserId);
        }
        if (authorId) {
            threadParticipants.delete(authorId);
        }

        for (const participantId of threadParticipants) {
            if (!notifiedUserIds.has(participantId)) {
                notifiedUserIds.add(participantId);
                await createNotification({
                    userId: participantId,
                    message: `Nuevo mensaje en el hilo de la tarea "${task.title}": "${commentPreview}"`,
                    type: 'TASK_COMMENT_REPLY',
                    relatedId: task.id,
                    taskId: task.id
                });
            }
        }
    } catch (err) {
        console.error("Error processing mentions and notifications:", err);
    }
};

export const markAllNotificationsAsRead = async (userId) => {
    try {
        const unreadNotifications = await prisma.notification.findMany({
            where: { userId, isRead: false },
            select: { id: true, taskId: true, type: true }
        });
        const readAt = new Date();
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt }
        });
        Promise.all(unreadNotifications.map((notification) => recordOperationalTrace({
            eventType: 'NOTIFICATION_READ',
            actorId: userId,
            subjectUserId: userId,
            taskId: notification.taskId || null,
            metadata: { notificationType: notification.type || 'GENERAL' },
            occurredAt: readAt
        }))).catch((traceError) => {
            console.error('[NotificationService] Bulk read trace failed:', traceError?.message || traceError);
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

export const markAsRead = async (notificationId, userId) => {
    try {
        const notification = await prisma.notification.findFirst({
            where: { id: notificationId, userId },
            select: { id: true, taskId: true, type: true, isRead: true }
        });
        if (!notification) return false;
        const readAt = new Date();
        const result = await prisma.notification.updateMany({
            where: { id: notificationId, userId, isRead: false },
            data: { isRead: true, readAt }
        });
        if (result.count > 0) {
            recordOperationalTrace({
                eventType: 'NOTIFICATION_READ',
                actorId: userId,
                subjectUserId: userId,
                taskId: notification.taskId || null,
                metadata: { notificationType: notification.type || 'GENERAL' },
                occurredAt: readAt
            }).catch((traceError) => {
                console.error('[NotificationService] Read trace failed:', traceError?.message || traceError);
            });
        }
        return result.count > 0 || notification.isRead;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [NotificationService] Error marking as read:`, error?.message || error);
        throw error;
    }
};
