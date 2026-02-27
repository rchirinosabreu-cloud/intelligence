
import prisma from '../lib/prisma.js';

export const getClientAnnouncements = async (clientId) => {
    try {
        const announcements = await prisma.clientAnnouncement.findMany({
            where: { clientId },
            orderBy: { createdAt: 'desc' }
        });
        return announcements;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [ClientAnnouncementService] Error fetching announcements:`, error?.message || error);
        throw error;
    }
};

export const createClientAnnouncement = async (data) => {
    try {
        const announcement = await prisma.clientAnnouncement.create({
            data: {
                clientId: data.clientId,
                content: data.content,
                type: data.type || 'info'
            }
        });
        return announcement;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [ClientAnnouncementService] Error creating announcement:`, error?.message || error);
        throw error;
    }
};
