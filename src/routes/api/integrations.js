import express from 'express';
import { saveMetaIntegration, getIntegrationStatus } from '../../services/integrationService.js';

const router = express.Router();

// Exchange Meta Token
router.post('/meta/exchange', async (req, res) => {
    try {
        const { clientId, accessToken, metadata } = req.body;

        if (!clientId || !accessToken) {
            return res.status(400).json({ error: 'clientId y accessToken son requeridos' });
        }

        const integration = await saveMetaIntegration(clientId, accessToken, metadata);

        res.json({
            success: true,
            message: 'Integración con Meta exitosa',
            updatedAt: integration.updatedAt
        });
    } catch (error) {
        console.error('[Integration API] Error en exchange de Meta:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Error al procesar la integración con Meta',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// Get client integrations status
router.get('/:clientId/status', async (req, res) => {
    try {
        const { clientId } = req.params;
        const status = await getIntegrationStatus(clientId);
        res.json(status);
    } catch (error) {
        console.error('[Integration API] Error al obtener status:', error.message);
        res.status(500).json({ error: 'Error al obtener el estado de las integraciones' });
    }
});

export default router;
