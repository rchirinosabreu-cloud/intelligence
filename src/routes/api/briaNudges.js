import express from 'express';
import { canSeeNudges, getBriaNudgeService } from '../../services/briaNudgeService.js';
import { getPermissionRequestService } from '../../services/permissionRequestService.js';

// «Bria se adelanta» (10 de octubre de 2026): los avisos de hoy para quien dirige y «ocultar por hoy».
// Vive bajo /api/bria, que el mapa de la plataforma excluye entero: Bria no se consulta a sí misma.
const guard = (req, res, next) => canSeeNudges(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' });
guard.permission = { role: 'MANAGER', modules: ['bria'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createBriaNudgeRouter = ({ service, permissions = null } = {}) => {
  const router = express.Router();
  const resolve = () => service || getBriaNudgeService();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(guard);
  const handle = (work) => async (req, res) => {
    try { res.json(await work(req, resolve())); }
    catch (failure) {
      const status = Number.isInteger(failure.status) ? failure.status : 500;
      if (status === 500) console.error('[BriaNudges]', failure?.message || failure);
      res.status(status).json({ message: status === 500 ? 'No se pudieron leer los avisos de Bria.' : failure.message });
    }
  };
  router.get('/', handle((req, instance) => instance.list(req.user)));
  router.post('/dismiss', handle((req, instance) => instance.dismiss(req.user, req.body?.key)));
  // Pedir acceso a un módulo (15 de octubre de 2026): un administrador da acceso o lo deniega desde el aviso.
  router.post('/permission-requests/:id/decision', (req, res, next) => (UUID.test(req.params.id) ? next() : res.status(400).json({ message: 'Pedido no válido.' })),
    handle((req) => (permissions || getPermissionRequestService()).decide(req.user, req.params.id, req.body?.decision)));
  return router;
};
