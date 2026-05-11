import express from 'express';
import automationService from '../../services/automationService.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();

const restrictAccess = (req, res, next) => {
    const allowedEmails = ['chrodny@gmail.com', 'fvilladigital@gmail.com'];
    if (!req.user || !allowedEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Acceso restringido.' });
    }
    next();
};

/**
 * GET /api/automation/status
 * Devuelve el estado actual de la conexión de automatización.
 */
router.get('/status', restrictAccess, async (req, res) => {
    try {
        const state = await automationService.getStatus();
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/brain-core/connect-whatsapp
 * Inicia el proceso de vinculación de WhatsApp y devuelve el QR en Base64.
 */
router.post('/connect-whatsapp', restrictAccess, async (req, res) => {
    try {
        const result = await automationService.vincularChat();
        res.json(result);
    } catch (error) {
        console.error("[AutomationRoute] Error connecting WhatsApp:", error);
        res.status(500).json({ error: "No se pudo generar el acceso seguro a WhatsApp.", details: error.message });
    }
});

// Mantener compatibilidad con rutas anteriores si es necesario o actualizarlas
router.get('/chats', restrictAccess, async (req, res) => {
    try {
        // Esta lógica dependería de tener la sesión ya activa
        const status = await automationService.getStatus();
        if (status.status !== 'ready') {
            return res.status(400).json({ error: 'WhatsApp no está vinculado.' });
        }
        // Aquí se podría implementar un comando de openclaw para listar chats
        res.json([]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
