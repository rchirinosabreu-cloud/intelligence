import { getNotifications, getUnreadNotificationCount, createNotification, markAsRead, markAllNotificationsAsRead } from '../services/notificationService.js';

export const listNotifications = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        const notifications = await getNotifications(req.user.userId);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
};

export const getUnreadCount = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        const count = await getUnreadNotificationCount(req.user.userId);
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch unread count" });
    }
};

export const addNotification = async (req, res) => {
    try {
        const { userId, message, type, relatedId } = req.body;
        if (!userId || !message) return res.status(400).json({ error: "Missing fields" });
        const notification = await createNotification({ userId, message, type, relatedId });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: "Failed to create notification" });
    }
};

export const markRead = async (req, res) => {
    try {
        await markAsRead(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to mark as read" });
    }
};

export const markAllRead = async (req, res) => {
    try {
        await markAllNotificationsAsRead(req.user.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to mark all as read" });
    }
};
