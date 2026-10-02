import express from 'express';
import { isManagerRole } from '../../config/security.js';
import { clientOperationsService } from '../../services/clientOperationsService.js';

// Operación de clientes (2 de octubre de 2026): el tablero global, la página de cada cliente, su ficha
// operativa y el informe del mes. Solo administradores y project managers (Rodny, 1 de octubre de 2026).

const PROFILE_FIELDS = ['description', 'instagramUrl', 'agency', 'complexity', 'projectManagerId', 'communityManagerId', 'contract', 'renew'];

const requireManager = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (!isManagerRole(req.user.role)) return res.status(403).json({ error: 'La operación de clientes es de administradores y project managers.' });
  return next();
};

const reply = (res, error, logger) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) {
    logger.error('[ClientOperations] Error de ruta:', error.response?.data || error.message || error);
    return res.status(status).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' });
  }
  return res.status(status).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.errors ? { errors: error.errors } : {}) });
};

export const createClientOperationsRouter = ({ service = clientOperationsService, logger = console } = {}) => {
  const router = express.Router();
  router.use(requireManager);

  router.get('/', async (_req, res) => {
    try { return res.json(await service.listOperations()); } catch (error) { return reply(res, error, logger); }
  });

  router.get('/:slug', async (req, res) => {
    try { return res.json(await service.getOperation(req.params.slug)); } catch (error) { return reply(res, error, logger); }
  });

  router.put('/:clientId/profile', async (req, res) => {
    try {
      const body = req.body || {};
      const input = Object.fromEntries(PROFILE_FIELDS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
      return res.json(await service.saveProfile({ clientId: req.params.clientId, actorUserId: req.user.userId, input }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.put('/:clientId/reports/:year/:month', async (req, res) => {
    try {
      if (typeof req.body?.delivered !== 'boolean') return res.status(400).json({ error: 'Falta indicar si el informe se entregó.' });
      return res.json(await service.setMonthlyReport({
        clientId: req.params.clientId, year: Number(req.params.year), month: Number(req.params.month), delivered: req.body.delivered, actorUserId: req.user.userId,
      }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.post('/:clientId/pieces/:itemId/published', async (req, res) => {
    try { return res.json(await service.markPiecePublished({ clientId: req.params.clientId, itemId: req.params.itemId })); } catch (error) { return reply(res, error, logger); }
  });

  return router;
};

export default createClientOperationsRouter();
