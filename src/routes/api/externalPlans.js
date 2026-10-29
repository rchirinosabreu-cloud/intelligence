import express from 'express';
import {
    getExternalPlanMonth,
    listExternalPlans,
    parseMonthSlug,
    refreshExternalPlanBySlug
} from '../../services/externalPlanService.js';

// El espejo de las parrillas de MIO en Parrillas (Rodny, 29 de octubre de 2026). Va dentro del router de contenido, así que
// pide el permiso de Parrillas. Solo lee la hoja; editarla desde aquí es la siguiente entrega.
export const createExternalPlansRouter = ({
    list = listExternalPlans,
    getMonth = getExternalPlanMonth,
    refresh = refreshExternalPlanBySlug
} = {}) => {
    const router = express.Router();

    router.get('/', async (_req, res) => {
        try {
            return res.json(await list());
        } catch (error) {
            console.error('[Parrillas MIO] No se pudo listar:', error?.message || error);
            return res.status(500).json({ error: 'No pudimos cargar las parrillas de MIO.' });
        }
    });

    router.get('/:slug/:period', async (req, res) => {
        const period = parseMonthSlug(req.params.period);
        if (!period) return res.status(400).json({ error: 'El mes no es válido.' });
        try {
            const plan = await getMonth(undefined, { slug: req.params.slug, ...period });
            if (!plan) return res.status(404).json({ error: 'Ese cliente no tiene una hoja de MIO vinculada.' });
            return res.json(plan);
        } catch (error) {
            console.error('[Parrillas MIO] No se pudo leer el mes:', error?.message || error);
            return res.status(500).json({ error: 'No pudimos cargar la parrilla de MIO.' });
        }
    });

    router.post('/:slug/refresh', async (req, res) => {
        try {
            const results = await refresh(undefined, req.params.slug);
            if (!results) return res.status(404).json({ error: 'Ese cliente no tiene una hoja de MIO vinculada.' });
            const failed = results.find((result) => !result.ok);
            return res.json({ ok: !failed, problem: failed?.problem || null });
        } catch (error) {
            console.error('[Parrillas MIO] No se pudo leer la hoja:', error?.message || error);
            return res.status(500).json({ error: 'No pudimos leer la hoja de MIO.' });
        }
    });

    return router;
};

export default createExternalPlansRouter;
