import express from 'express';
import prisma from '../../lib/prisma.js';

const router = express.Router();

// Get specific client details
router.get('/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const client = await prisma.client.findUnique({
            where: { id }
        });
        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(client);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all clients (proxied from server.js logic but keeping it here for modularity)
router.get('/clients', async (req, res) => {
    try {
        const clients = await prisma.client.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(clients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
