import express from 'express';
import { initializeWhatsApp, listActiveChats, runScrapingTask } from '../../services/whatsappAutomationService.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();

const restrictAccess = (req, res, next) => {
    const allowedEmails = ['chrodny@gmail.com', 'fvilladigital@gmail.com'];
    if (!req.user || !allowedEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Acceso restringido.' });
    }
    next();
};

router.get('/status', restrictAccess, async (req, res) => {
    const state = await initializeWhatsApp();
    res.json(state);
});

router.get('/chats', restrictAccess, async (req, res) => {
    const chats = await listActiveChats();
    res.json(chats);
});

router.post('/monitored', restrictAccess, async (req, res) => {
    const { chats } = req.body;
    await prisma.automationConfig.upsert({
        where: { id: 'global' },
        update: { monitoredChats: chats },
        create: { id: 'global', monitoredChats: chats }
    });
    res.json({ success: true });
});

router.post('/run-now', restrictAccess, async (req, res) => {
    const config = await prisma.automationConfig.findUnique({ where: { id: 'global' } });
    const chats = config?.monitoredChats || [];
    for (const chatName of chats) {
        await runScrapingTask(chatName);
    }
    res.json({ success: true });
});

export default router;
