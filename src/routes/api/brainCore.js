import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { parseJsonResponse, extractModelText } from '../../services/aiService.js';
import { addAgencyContext, performAdvancedExtraction, getIntelligenceFeed, getClientProfileFromMemory, searchContext, updateAgencyContext, deleteAgencyContext, getMemoryStats, askBrainCore } from '../../services/brainCoreService.js';
import { getRecentEmails, readGoogleSheet, DEFAULT_IMPERSONATED_EMAIL } from '../../services/googleWorkspaceService.js';
import { triageEmailsWithAI, onlyBasecampEmails } from '../../services/emailTriageService.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

import { requireModulePermission } from '../../middlewares/authMiddleware.js';

const restrictAccess = requireModulePermission('Manager');

// 1. Context Feed (Dashboard protagonists) - Redesigned for v2.5 Predictive Alerts
router.get('/feed', restrictAccess, async (req, res) => {
    try {
        const { status } = req.query;
        const [feed, stats] = await Promise.all([
            getIntelligenceFeed(status),
            getMemoryStats()
        ]);

        res.json({ feed: feed || [], stats: stats || { count: 0 } });
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /feed:', error);
        res.json({
            feed: [{
                id: 'error',
                type: 'HISTORIAL',
                title: "Cerebro en Mantenimiento",
                content: "El motor de inteligencia está sincronizando. Intenta de nuevo en unos segundos.",
                severity: "info",
                timestamp: new Date()
            }],
            stats: { count: 0 }
        });
    }
});

// 2. Add Context (Text or Image with Advanced Extraction)
router.post('/context', restrictAccess, upload.single('image'), async (req, res) => {
    try {
        let { content, clientId, metadata } = req.body;
        if (metadata && typeof metadata === 'string') metadata = JSON.parse(metadata);
        if (clientId === 'null' || !clientId) clientId = null;

        if (req.file) {
            const extraction = await performAdvancedExtraction(req.file.buffer, req.file.mimetype);
            if (extraction) {
                content = extraction.content;
                metadata = { ...metadata, insights: extraction.insights };
            }
        }

        if (!content) return res.status(400).json({ error: 'Contenido vacío.' });

        const status = req.file ? 'PENDING' : 'APPROVED';

        const record = await addAgencyContext(content, req.file ? 'IMAGE' : 'TEXT', clientId, metadata, status);
        res.status(201).json(record);
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /context:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Update Memory
router.patch('/context/:id', restrictAccess, async (req, res) => {
    try {
        const { content, status } = req.body;
        if (content) await updateAgencyContext(req.params.id, content);
        if (status) {
            await prisma.agencyContext.update({
                where: { id: req.params.id },
                data: { status }
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete Memory
router.delete('/context/:id', restrictAccess, async (req, res) => {
    try {
        await deleteAgencyContext(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Ask Brain Core (Semantic Search)
router.get('/ask', restrictAccess, async (req, res) => {
    try {
        const { q, clientId } = req.query;
        if (!q) return res.status(400).json({ error: 'Falta la pregunta.' });
        const answer = await askBrainCore(q, clientId === 'null' ? null : clientId);
        res.json(answer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Knowledge Radar (Client Profile)
router.get('/radar/:clientId', restrictAccess, async (req, res) => {
    try {
        const profile = await getClientProfileFromMemory(req.params.clientId);
        if (!profile) return res.status(404).json({ error: 'Sin conocimiento previo.' });
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Executive Workspace (DEPRECATED)
router.get('/workspace/insights', restrictAccess, (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecado. Centralizado en Project Manager Feed.' });
});

// 8. Client Executive Summary (DEPRECATED)
router.get('/client-summary/:clientId', restrictAccess, (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecado.' });
});

export default router;
