import express from 'express';
import { adBudgetService } from '../../services/adBudgetService.js';

// Pautas (reunión del 6 de noviembre de 2026). El módulo lo protege `requireModulePermission('pautas')` en el índice de
// rutas. Un error de validación responde con su frase en español; nunca un código.
export const createAdBudgetRouter = ({ service = null } = {}) => {
  const router = express.Router();
  const read = () => service || adBudgetService();
  const handle = (work, status = 200) => async (req, res) => {
    try {
      return res.status(status).json(await work(req));
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      console.error('[Ad budgets API] No se pudo completar:', error.response?.data || error);
      return res.status(500).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' });
    }
  };

  router.get('/', handle((req) => read().list({ clientId: req.query.clientId || null, includeFinished: req.query.terminadas === '1' })));
  router.get('/options', handle(() => read().options()));
  router.post('/', handle((req) => read().create(req.body || {}, req.user), 201));
  router.get('/:id', handle((req) => read().detail(req.params.id)));
  router.patch('/:id', handle((req) => read().update(req.params.id, req.body || {}, req.user)));
  router.delete('/:id', handle((req) => read().remove(req.params.id, req.user)));
  router.post('/:id/spend', handle((req) => read().recordSpend(req.params.id, req.body || {}, req.user), 201));
  router.patch('/:id/readings/:readingId', handle((req) => read().updateReading(req.params.id, req.params.readingId, req.body || {}, req.user)));
  router.delete('/:id/readings/:readingId', handle((req) => read().deleteReading(req.params.id, req.params.readingId, req.user)));
  router.patch('/:id/cycles/:cycleKey', handle((req) => read().updateCycle(req.params.id, req.params.cycleKey, req.body || {}, req.user)));
  router.post('/:id/cycles/:cycleKey/reopen', handle((req) => read().reopenCycle(req.params.id, req.params.cycleKey, req.user)));
  router.put('/:id/carry-over', handle((req) => read().adjustCarryOver(req.params.id, req.body || {}, req.user)));
  router.delete('/:id/carry-over', handle((req) => read().clearCarryOver(req.params.id, { cycleKey: req.query.cycleKey || null }, req.user)));
  router.post('/:id/campaigns', handle((req) => read().createCampaign(req.params.id, req.body || {}, req.user), 201));
  router.patch('/:id/campaigns/:campaignId', handle((req) => read().updateCampaign(req.params.id, req.params.campaignId, req.body || {}, req.user)));
  router.delete('/:id/campaigns/:campaignId', handle((req) => read().deleteCampaign(req.params.id, req.params.campaignId, req.user)));
  return router;
};
