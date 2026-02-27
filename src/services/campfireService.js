
import prisma from '../lib/prisma.js';

// GET all messages for a client
export const getCampfireMessages = async (clientId) => {
    try {
        const messages = await prisma.campfireMessage.findMany({
            where: { clientId },
            orderBy: { createdAt: 'desc' }
        });
        return messages;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [CampfireService] Error fetching messages:`, error?.message || error);
        throw error;
    }
};

// POST a new message (Immutable)
export const createCampfireMessage = async (data) => {
    try {
        const message = await prisma.campfireMessage.create({
            data: {
                clientId: data.clientId,
                content: data.content,
                author: data.author
            }
        });
        return message;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [CampfireService] Error creating message:`, error?.message || error);
        throw error;
    }
};
