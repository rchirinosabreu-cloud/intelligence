import express from 'express';
import { getVaultService } from '../../services/vaultService.js';
import { createRateLimiter } from '../../config/security.js';

// Bóveda de accesos (9 de octubre de 2026). Cada respuesta va sin caché: una contraseña nunca debe quedar
// guardada en el navegador ni en un intermediario. Mostrar una contraseña está limitado por persona.

const noStore = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

export const createVaultRouter = ({ service = null, logger = console, revealLimiter = null } = {}) => {
  const router = express.Router();
  const vault = () => service || getVaultService();
  const limitReveal = revealLimiter || createRateLimiter({
    windowMs: 10 * 60 * 1000, max: 30,
    keyGenerator: (req) => `vault-reveal:${req.user?.userId || req.user?.id || req.ip}`
  });
  const handle = (work) => async (req, res) => {
    try { return res.json(await work(req)); }
    catch (error) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
      logger.error('[Vault]', error.code || '', error.message);
      return res.status(500).json({ error: 'No pudimos completar la operación de la bóveda.', code: 'VAULT_ERROR' });
    }
  };
  const revision = (req) => (Number.isInteger(req.body?.expectedRevision) ? req.body.expectedRevision : null);

  router.use(noStore);
  router.get('/credentials', handle((req) => vault().list(req.user, { clientId: req.query.clientId || null, query: req.query.q || '' })));
  router.get('/credentials/:id', handle(async (req) => {
    const row = await vault().get(req.user, req.params.id);
    if (!row) throw Object.assign(new Error('No encontramos ese acceso.'), { status: 404, code: 'VAULT_NOT_FOUND' });
    return row;
  }));
  router.post('/credentials', handle((req) => vault().create(req.user, req.body || {})));
  router.patch('/credentials/:id', handle((req) => vault().update(req.user, req.params.id, revision(req), req.body?.changes || {})));
  router.post('/credentials/:id/retire', handle((req) => vault().retire(req.user, req.params.id, revision(req), req.body?.reason)));
  router.post('/credentials/:id/reveal', limitReveal, handle((req) => vault().reveal(req.user, req.params.id, req.body?.via === 'BRIA' ? 'BRIA' : 'BOVEDA')));
  router.get('/credentials/:id/reveals', handle((req) => vault().reveals(req.user, req.params.id)));
  return router;
};
