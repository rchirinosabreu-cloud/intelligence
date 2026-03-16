import express from 'express';
import {
    saveMetaIntegration,
    getIntegrationStatus,
    getMetaAssets,
    getInstagramAccount,
    updateClientMapping
} from '../../services/integrationService.js';

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

// List Meta Assets (Ad Accounts & Pages)
router.get('/meta/assets/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        if (!clientId) return res.status(400).json({ error: 'clientId is required' });

        const assets = await getMetaAssets(clientId);
        res.json(assets);
    } catch (error) {
        console.error(`[Integration API] Error fetching assets for client ${req.params.clientId}:`, error.message);

        // Use 400 for business logic errors, 500 for unexpected crashes
        const status = error.message.includes('No se encontró') ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
});

// Get Instagram account linked to a Page
router.get('/meta/instagram/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { pageId } = req.query;
        if (!pageId) return res.status(400).json({ error: 'pageId is required' });

        const igAccount = await getInstagramAccount(clientId, pageId);
        res.json(igAccount);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save Asset Mapping to Client
router.patch('/meta/mapping/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { facebookPageId, instagramBusinessId, adAccountId, businessId } = req.body;

        await updateClientMapping(clientId, {
            facebookPageId,
            instagramBusinessId,
            adAccountId,
            businessId
        });

        res.json({ success: true, message: 'Mapeo de activos guardado correctamente' });
    } catch (error) {
        console.error('[Integration API] Error guardando mapeo:', error.message);
        res.status(500).json({ error: 'Error al guardar el mapeo de activos' });
    }
});

export default router;
