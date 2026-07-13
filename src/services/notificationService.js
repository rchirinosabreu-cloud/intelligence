
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
