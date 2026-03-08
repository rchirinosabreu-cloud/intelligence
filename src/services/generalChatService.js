
import prisma from '../lib/prisma.js';

export const getGeneralChatMessages = async () => {
    try {
        const messages = await prisma.generalChatMessage.findMany({
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        role: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        return messages;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [GeneralChatService] Error fetching messages:`, error?.message || error);
        throw error;
    }
};

export const createGeneralChatMessage = async (data) => {
    try {
        const message = await prisma.generalChatMessage.create({
            data: {
                content: data.content,
                authorId: data.authorId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        role: true
                    }
                }
            }
        });
        return message;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [GeneralChatService] Error creating message:`, error?.message || error);
        throw error;
    }
};
