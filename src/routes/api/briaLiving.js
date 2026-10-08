import express from 'express';
import { canUseBria, SIGNAL_STATES } from '../../lib/briaLivingMemory.js';
import { getBriaLivingRepository } from '../../services/briaLivingService.js';

export const createBriaLivingRouter = ({ repository, logger = console } = {}) => {
  const router = express.Router();
  router.use((req, res, next) => canUseBria(req.user) ? next()
    : res.status(403).json({ message: 'Bria no está activada para tu cuenta.', error: 'BRIA_DISABLED' }));
  const handle = (action) => async (req, res) => {
    try { return res.json(await action(req, repository || await getBriaLivingRepository())); }
    catch (error) {
      if (!error.status) logger.error('[BriaLiving] Falló la consulta:', error.message);
      return res.status(error.status || 500).json({ message: error.status ? error.message : 'No se pudo consultar la memoria.' });
    }
  };
  router.get('/overview', handle((req, repo) => repo.overview(req.user)));
  router.get('/search', handle((req, repo) => {
    const query = String(req.query.q || '').trim();
    if (!query || query.length > 1000) throw Object.assign(new Error('Escribe una consulta de hasta 1.000 caracteres.'), { status: 400 });
    return repo.search(req.user, query);
  }));
  router.get('/inbox', handle((req, repo) => repo.inbox(req.user)));
  router.patch('/inbox/:id', handle((req, repo) => {
    if (!SIGNAL_STATES.includes(req.body?.status)) throw Object.assign(new Error('Estado de seguimiento inválido.'), { status: 400 });
    return repo.review(req.user, req.params.id, req.body.status);
  }));
  return router;
};
