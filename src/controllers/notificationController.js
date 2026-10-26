import {
    getNotifications,
    createNotification,
    markAsRead,
    markAllNotificationsAsRead,
    getNotificationPreferences,
    saveNotificationPreferences
} from '../services/notificationService.js';

export const listNotifications = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        const [page, preferences] = await Promise.all([
            getNotifications(req.user.userId, {
                cursor: req.query.cursor || null,
                unreadOnly: req.query.unread === '1',
                limit: req.query.limit
            }),
            getNotificationPreferences(req.user.userId)
        ]);
        res.json({ ...page, preferences });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
};

/** Cada quien cambia las suyas: nunca se lee un id de la petición. */
export const updateNotificationPreferences = async (req, res) => {
    try {
        const preferences = await saveNotificationPreferences(req.user.userId, req.body);
        res.json({ preferences });
    } catch (error) {
        console.error('[NotificationController] Failed to save preferences:', error?.message || error);
        res.status(500).json({ error: 'No se pudieron guardar tus preferencias de avisos.' });
    }
};

export const addNotification = async (req, res) => {
    try {
        const { userId, message, type, relatedId } = req.body;
        if (!userId || !message) return res.status(400).json({ error: "Missing fields" });
        const notification = await createNotification({ userId, message, type, relatedId });
        if (!notification) return res.status(400).json({ error: 'El destinatario ya no es un miembro activo del equipo.' });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: "Failed to create notification" });
    }
};

export const markRead = async (req, res) => {
    try {
        await markAsRead(req.params.id, req.user.userId);
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
