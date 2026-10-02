import express from 'express';
import { isManagerRole } from '../../config/security.js';
import { metaReportService } from '../../services/metaReportService.js';

// Cifras de Meta para los informes (2 de octubre de 2026). Se monta bajo `/api/reports/meta`, así que
// todo exige el permiso de Reportes. Ver qué puede traer un cliente es de cualquiera con el módulo;
// elegir su cuenta publicitaria es de administradores y project managers, como conectar sus páginas.

const requireManager = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (!isManagerRole(req.user.role)) return res.status(403).json({ error: 'Solo administradores y project managers eligen la cuenta publicitaria de un cliente.' });
  return next();
};

const reply = (res, error, logger) => {
  const status = Number(error?.status) || 500;
  const opaque = status >= 500 && !error?.code;
  if (opaque) logger.error('[Reports Meta] Error de ruta:', error.response?.data || error.message || error);
  const body = opaque
    ? { error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' }
    : { error: error.message, ...(error.code ? { code: error.code } : {}) };
  return res.status(status).json(body);
};

export const createReportMetaRouter = ({ meta = metaReportService, logger = console } = {}) => {
  const router = express.Router();

  router.get('/sources', async (req, res) => {
    try {
      const clientId = String(req.query.clientId || '').trim();
      if (!clientId) return res.status(400).json({ error: 'Falta clientId.' });
      return res.json(await meta.listClientSources(clientId));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.get('/ad-accounts/available', requireManager, async (_req, res) => {
    try {
      return res.json({ accounts: await meta.listAvailableAdAccounts() });
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.post('/ad-accounts', requireManager, async (req, res) => {
    try {
      const clientId = String(req.body?.clientId || '').trim();
      const adAccountId = String(req.body?.adAccountId || '').trim();
      if (!clientId || !adAccountId) return res.status(400).json({ error: 'Faltan clientId y adAccountId.' });
      const campaignFilter = String(req.body?.campaignFilter || '');
      return res.status(201).json(await meta.linkAdAccount({ clientId, adAccountId, campaignFilter, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.delete('/ad-accounts/:id', requireManager, async (req, res) => {
    try {
      return res.json(await meta.unlinkAdAccount({ id: req.params.id }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  return router;
};

export default createReportMetaRouter();
