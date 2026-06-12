import prisma from '../lib/prisma.js';
import { getGlobalAnnouncements, createGlobalAnnouncement, deleteGlobalAnnouncement } from '../services/globalAnnouncementService.js';
import { getClientAnnouncements, createClientAnnouncement } from '../services/clientAnnouncementService.js';
import { createNotification } from '../services/notificationService.js';

export const listGlobal = async (req, res) => {
    try {
        const announcements = await getGlobalAnnouncements();
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch global announcements" });
    }
};

export const addGlobal = async (req, res) => {
    try {
        const { content, type } = req.body;
        if (!content) return res.status(400).json({ error: "Missing content" });
        const announcement = await createGlobalAnnouncement({ content, type });

        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            const tm = await prisma.teamMember.findUnique({ where: { id: mentionedId } });
            if (tm && tm.email) {
                const user = await prisma.user.findUnique({ where: { email: tm.email.trim().toLowerCase() } });
                if (user && user.id !== req.user.userId) {
                    await createNotification({ userId: user.id, message: `${req.user.name} te mencionó en un anuncio global`, type: 'ANNOUNCEMENT_GLOBAL', relatedId: announcement.id });
                }
            }
        }
        res.json(announcement);
    } catch (error) {
        res.status(500).json({ error: "Failed to create global announcement" });
    }
};

export const deleteGlobal = async (req, res) => {
    try {
        await deleteGlobalAnnouncement(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete global announcement" });
    }
};

export const listClient = async (req, res) => {
    try {
        const announcements = await getClientAnnouncements(req.params.clientId);
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch announcements" });
    }
};

export const addClient = async (req, res) => {
    try {
        const { content, type } = req.body;
        if (!content) return res.status(400).json({ error: "Missing content" });
        const announcement = await createClientAnnouncement({ clientId: req.params.clientId, content, type });

        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            const tm = await prisma.teamMember.findUnique({ where: { id: mentionedId } });
            if (tm && tm.email) {
                const user = await prisma.user.findUnique({ where: { email: tm.email.trim().toLowerCase() } });
                if (user && user.id !== req.user.userId) {
                    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
                    await createNotification({ userId: user.id, message: `${req.user.name} te mencionó en un anuncio de ${client?.name || "un cliente"}`, type: 'ANNOUNCEMENT_CLIENT', relatedId: req.params.clientId });
                }
            }
        }
        res.json(announcement);
    } catch (error) {
        res.status(500).json({ error: "Failed to create announcement" });
    }
};
