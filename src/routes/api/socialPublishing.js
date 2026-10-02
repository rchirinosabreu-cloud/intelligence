import express from 'express';
import { isManagerRole } from '../../config/security.js';
import { socialPublishingService } from '../../services/socialPublishingService.js';
import { socialAccountService } from '../../services/socialAccountService.js';

// Publicación automática en Instagram y Facebook (29 de septiembre de 2026). Todo bajo el permiso de
// parrillas; conectar o desconectar cuentas es de administradores y project managers.

const requireManager = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (!isManagerRole(req.user.role)) return res.status(403).json({ error: 'Solo administradores y project managers conectan cuentas.' });
  return next();
};

const reply = (res, error, logger) => {
  const status = Number(error?.status) || 500;
  // Un 503 con código propio («falta META_SYSTEM_USER_TOKEN») es un mensaje deliberado; lo demás se oculta.
  const opaque = status >= 500 && !error?.code;
  if (opaque) logger.error('[SocialPublishing] Error de ruta:', error.response?.data || error.message || error);
  const body = opaque
    ? { error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' }
    : { error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.problems ? { problems: error.problems } : {}) };
  return res.status(status).json(body);
};

export const createSocialPublishingRouter = ({
  publishing = socialPublishingService,
  accounts = socialAccountService,
  logger = console
} = {}) => {
  const router = express.Router();

  router.get('/publications', async (req, res) => {
    try {
      const planId = String(req.query.planId || '').trim();
      if (!planId) return res.status(400).json({ error: 'Falta planId.' });
      return res.json(await publishing.listPlanPublications(planId));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.post('/publications', async (req, res) => {
    try {
      const itemId = String(req.body?.itemId || '').trim();
      const platforms = Array.isArray(req.body?.platforms) ? req.body.platforms.map((value) => String(value)) : [];
      if (!itemId) return res.status(400).json({ error: 'Falta itemId.' });
      // Con varias cuentas por cliente se programa por cuenta (`accountIds`); `platforms` es la forma de antes.
      const accountIds = Array.isArray(req.body?.accountIds) ? req.body.accountIds.map((value) => String(value)) : null;
      const rows = await publishing.schedulePublications({ itemId, platforms, ...(accountIds ? { accountIds } : {}), actorUserId: req.user.userId });
      return res.status(201).json(rows);
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  // A qué cuentas del cliente va una pieza (Rodny, 2 de octubre de 2026). Cancela lo programado en las que deja.
  router.put('/items/:itemId/pages', async (req, res) => {
    try {
      const pageIds = Array.isArray(req.body?.pageIds) ? req.body.pageIds.map((value) => String(value)) : [];
      return res.json(await publishing.setItemSocialPages({ itemId: req.params.itemId, pageIds, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.delete('/publications/:publicationId', async (req, res) => {
    try {
      return res.json(await publishing.cancelPublication({ publicationId: req.params.publicationId, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.post('/publications/:publicationId/retry', async (req, res) => {
    try {
      return res.json(await publishing.retryPublication({ publicationId: req.params.publicationId, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  // Volver a publicar lo que ya salió (la persona lo borró en la red): deja la fila libre para «Programar».
  router.post('/publications/:publicationId/reopen', async (req, res) => {
    try {
      return res.json(await publishing.reopenPublication({ publicationId: req.params.publicationId, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.get('/accounts', async (req, res) => {
    try {
      const clientId = String(req.query.clientId || '').trim();
      if (!clientId) return res.status(400).json({ error: 'Falta clientId.' });
      return res.json(await accounts.listClientAccounts(clientId));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.get('/accounts/available', requireManager, async (_req, res) => {
    try {
      const pages = await accounts.listAvailablePages();
      return res.json({ configured: true, pages });
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.post('/accounts/link', requireManager, async (req, res) => {
    try {
      const clientId = String(req.body?.clientId || '').trim();
      const pageId = String(req.body?.pageId || '').trim();
      if (!clientId || !pageId) return res.status(400).json({ error: 'Faltan clientId y pageId.' });
      const rows = await accounts.linkPage({ clientId, pageId, actorUserId: req.user.userId });
      return res.status(201).json(rows);
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  router.delete('/accounts/:accountId', requireManager, async (req, res) => {
    try {
      return res.json(await accounts.disconnectAccount({ accountId: req.params.accountId, actorUserId: req.user.userId }));
    } catch (error) {
      return reply(res, error, logger);
    }
  });

  return router;
};

export default createSocialPublishingRouter();
