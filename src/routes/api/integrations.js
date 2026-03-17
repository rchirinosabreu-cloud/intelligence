import express from 'express';
import {
    saveMetaIntegration,
    getIntegrationStatus,
    getMetaAssets,
    getInstagramAccount,
    updateClientMapping,
    deleteIntegration,
    getDecryptedToken
} from '../../services/integrationService.js';
import {
    getOrganicMetrics,
    getReachTrend,
    getTopContent,
    getAdsInsights
} from '../../services/metaMetricsService.js';
import axios from 'axios';

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

// --- METRICS INSIGHTS ENDPOINTS ---

router.get('/meta/metrics/organic/:clientId', async (req, res) => {
    try {
        const { range } = req.query;
        const metrics = await getOrganicMetrics(req.params.clientId, range);
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/meta/metrics/trend/:clientId', async (req, res) => {
    try {
        const { range } = req.query;
        const trend = await getReachTrend(req.params.clientId, range);
        res.json(trend);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/meta/metrics/top-content/:clientId', async (req, res) => {
    try {
        const { range } = req.query;
        const content = await getTopContent(req.params.clientId, range);
        res.json(content);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/meta/metrics/ads/:clientId', async (req, res) => {
    try {
        const { range } = req.query;
        const ads = await getAdsInsights(req.params.clientId, range);
        res.json(ads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Generated Insights Proxy
router.post('/meta/insights/generate', async (req, res) => {
    try {
        const { clientId, metrics } = req.body;
        if (!clientId || !metrics) return res.status(400).json({ error: 'Missing clientId or metrics' });

        // Forward to the internal /api/chat logic or a dedicated Gemini call
        // For simplicity and to reuse the Bria persona, we'll construct a prompt and call Gemini proxy or direct
        // Let's use the GEMINI_API_KEY directly from env to avoid complex proxying here if we want a specific prompt.

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

        const prompt = `
            Eres un Consultor Estratégico Senior de la agencia Brainstudio.
            Analiza los siguientes datos de rendimiento de Meta (Organic & Ads) de los últimos 30 días para un cliente.

            DATOS ORGÁNICOS:
            ${JSON.stringify(metrics.organic, null, 2)}

            DATOS DE ADS:
            ${JSON.stringify(metrics.ads, null, 2)}

            TOP CONTENT:
            ${JSON.stringify(metrics.topContent, null, 2)}

            TU TAREA:
            Escribe un análisis profesional en Español con el siguiente tono: Analítico, Estratégico y Propositivo, pero con un toque Cercano/Humano.
            No seas redundante. Ve al grano. No uses muros de texto.

            FORMATO DE SALIDA:
            ### 🚀 Logros y Avances
            - (Punto clave analítico: por qué funcionó lo que funcionó)
            - (Hallazgo basado en datos)

            ### 💡 Recomendaciones Estratégicas
            - (Acción concreta y creativa para el próximo mes)
            - (Ajuste táctico basado en la eficiencia de pauta)

            IMPORTANTE: No solo repitas los números. Explica el "POR QUÉ" estratégico detrás de ellos.
        `;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        const aiText = response.data.candidates[0].content.parts[0].text;
        res.json({ insight: aiText });

    } catch (error) {
        console.error('[Insights API] Error generating insights:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error al generar insights con IA' });
    }
});

// Delete integration
router.delete('/:clientId/:provider', async (req, res) => {
    try {
        const { clientId, provider } = req.params;
        await deleteIntegration(clientId, provider);
        res.json({ success: true, message: 'Conexión eliminada correctamente' });
    } catch (error) {
        console.error('[Integration API] Error eliminando integración:', error.message);
        res.status(500).json({ error: 'Error al eliminar la conexión' });
    }
});

export default router;
