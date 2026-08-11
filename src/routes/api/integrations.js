import express from 'express';
import prisma from '../../lib/prisma.js';
import { requireManagerRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();
router.use(requireManagerRole);

const publicIntegrationSelect = {
    id: true,
    type: true,
    externalId: true,
    alias: true,
    isActive: true,
    clientId: true,
    metadata: true,
    createdAt: true,
    updatedAt: true
};

// Get all integrations
router.get('/integrations', async (req, res) => {
    const integrations = await prisma.agencyIntegration.findMany({
        select: publicIntegrationSelect,
        orderBy: { createdAt: 'desc' }
    });
    res.json(integrations);
});

// Create a new source link (e.g., adding a specific Sheet ID)
router.post('/sources', async (req, res) => {
    const { type, externalId, alias, clientId } = req.body;
    try {
        const source = await prisma.agencyIntegration.create({
            data: {
                type,
                externalId,
                alias,
                clientId: clientId || null,
                isActive: true
            },
            select: publicIntegrationSelect
        });
        res.status(201).json(source);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete an integration/source
router.delete('/integrations/:id', async (req, res) => {
    try {
        await prisma.agencyIntegration.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
