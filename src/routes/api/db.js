import express from 'express';
import prisma from '../../lib/prisma.js';
import { getClientByIdentifier, getClients } from '../../services/clientService.js';

const router = express.Router();

// Get specific client details (supports ID or Slug)
router.get('/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const client = await getClientByIdentifier(id);
        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
        return res.json(client);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Get all clients
router.get('/clients', async (req, res) => {
    try {
        const clients = await getClients();
        return res.json(clients);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
