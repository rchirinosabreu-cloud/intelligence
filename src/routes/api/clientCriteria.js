import express from 'express';
import { createClientCriterionService } from '../../services/briaClientCriterionService.js';
import { createCriterionDiscoveryService } from '../../services/briaCriterionDiscoveryService.js';

export const createClientCriteriaRouter = (service = createClientCriterionService(), logger = console, discovery = createCriterionDiscoveryService()) => {
  const router = express.Router({ mergeParams: true });
  const handle = (operation, status = 200) => async (req, res) => {
    try {
      return res.status(status).json(await operation(req));
    } catch (error) {
      logger.error('[Bria client criteria]', error.response?.data || error);
      if (error.name === 'OpenAIRequestError') return res.status(502).json({ error: 'Bria no pudo completar la búsqueda. Reintenta en unos momentos.' });
      const publicError = [400, 403, 404, 409, 422, 504].includes(error.status);
      return res.status(publicError ? error.status : 500).json({ error: publicError ? error.message : 'No fue posible guardar o cargar los criterios del cliente.' });
    }
  };
  const identity = req => ({ planId: req.params.planId, actorUserId: req.user?.userId });
  router.get('/', handle(req => service.list(identity(req))));
  router.get('/discovery', handle(req => discovery.status(identity(req))));
  router.post('/discover', handle(req => discovery.discover(identity(req))));
  router.patch('/:criterionId/draft', handle(req => {
    const { text, category, reason, scope, version } = req.body || {};
    return service.edit({ ...identity(req), criterionId: req.params.criterionId, text, category, reason, scope, version });
  }));
  router.post('/', handle(req => {
    const { text, category, reason, findingId, requestId } = req.body || {};
    return service.propose({ ...identity(req), text, category, reason, findingId, requestId });
  }, 201));
  router.patch('/:criterionId', handle(req => {
    const { action, reason, version } = req.body || {};
    return service.decide({ ...identity(req), criterionId: req.params.criterionId, action, reason, version });
  }));
  router.delete('/:criterionId', handle(req => {
    const { version, confirmation } = req.body || {};
    return service.remove({ ...identity(req), criterionId: req.params.criterionId, version, confirmation });
  }));
  return router;
};
