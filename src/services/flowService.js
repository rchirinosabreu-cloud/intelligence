
import prisma from '../lib/prisma.js';

// GET all messages for a client
export const getFlowMessages = async (clientId) => {
    try {
        const messages = await prisma.flowMessage.findMany({
            where: { clientId },
            include: { author: true },
            orderBy: { createdAt: 'desc' }
        });
        return messages;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [FlowService] Error fetching messages:`, error?.message || error);
        throw error;
    }
};

// POST a new message (Immutable)
export const createFlowMessage = async (data) => {
    try {
        const message = await prisma.flowMessage.create({
            data: {
                clientId: data.clientId,
                content: data.content,
                authorId: data.authorId
            },
            include: { author: true }
        });
        return message;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [FlowService] Error creating message:`, error?.message || error);
        throw error;
    }
};
