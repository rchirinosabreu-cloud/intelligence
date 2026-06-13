import prisma from '../lib/prisma.js';
import { getFlowMessages, createFlowMessage } from '../services/flowService.js';
import { getGeneralChatMessages, createGeneralChatMessage } from '../services/generalChatService.js';
import { createNotification } from '../services/notificationService.js';

export const listFlow = async (req, res) => {
    try {
        const messages = await getFlowMessages(req.params.clientId);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
    }
};

export const addFlow = async (req, res) => {
    try {
        const { content } = req.body;
        const userEmail = req.user.email;
        if (!content) return res.status(400).json({ error: "Missing content" });

        const tm = await prisma.teamMember.findFirst({ where: { email: { equals: userEmail, mode: 'insensitive' } } });
        if (!tm) return res.status(403).json({ error: "User is not a TeamMember" });

        const message = await createFlowMessage({ clientId: req.params.clientId, content, authorId: tm.id });

        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) mentionedUserIds.add(match[2]);

        for (const mid of mentionedUserIds) {
            const targetTm = await prisma.teamMember.findUnique({ where: { id: mid } });
            if (targetTm && targetTm.email) {
                const targetUser = await prisma.user.findUnique({ where: { email: targetTm.email.trim().toLowerCase() } });
                if (targetUser && targetUser.id !== req.user.userId) {
                    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
                    await createNotification({ userId: targetUser.id, message: `${req.user.name} te mencionó en el chat de ${client?.name || "un cliente"}`, type: 'CAMPFIRE_MENTION', relatedId: req.params.clientId });
                }
            }
        }
        res.json(message);
    } catch (error) {
        res.status(500).json({ error: "Failed to create message" });
    }
};

export const listGeneral = async (req, res) => {
    try {
        const messages = await getGeneralChatMessages();
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
    }
};

export const addGeneral = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: "Missing content" });
        const message = await createGeneralChatMessage({ content, authorId: req.user.userId });

        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) mentionedUserIds.add(match[2]);

        for (const mid of mentionedUserIds) {
            const targetTm = await prisma.teamMember.findUnique({ where: { id: mid } });
            if (targetTm && targetTm.email) {
                const targetUser = await prisma.user.findUnique({ where: { email: targetTm.email.trim().toLowerCase() } });
                if (targetUser && targetUser.id !== req.user.userId) {
                    await createNotification({ userId: targetUser.id, message: `${req.user.name} te mencionó en el chat general`, type: 'GENERAL_CHAT_MENTION', relatedId: message.id });
                }
            }
        }
        res.json(message);
    } catch (error) {
        res.status(500).json({ error: "Failed to create message" });
    }
};
