import express from 'express';
import { createPlatformHealthScoreService } from '../../services/platformHealthScoreService.js';

// El health score de la plataforma en Salud operativa (14 de noviembre de 2026). Solo administradores, como el
// semáforo de servicios: dice qué le falta a la plataforma por dentro, y eso no es información para todo el equipo.
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

export const createPlatformHealthRouter = ({ service = null, routes = null, logger = console } = {}) => {
  const router = express.Router();
  let instance = service;
  const resolve = () => { instance ||= createPlatformHealthScoreService({ routes: routes || undefined, logger }); return instance; };

  const adminsOnly = (req, res, next) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'La salud de la plataforma está disponible solo para administradores.' });
    return next();
  };
  adminsOnly.permission = { role: 'ADMIN' }; // Lo lee el mapa de la plataforma de Bria.
  router.use(adminsOnly);

  router.get('/', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await resolve().read());
    } catch (error) {
      logger.error('[HealthScore] No se pudo armar el informe:', error.message);
      return res.status(500).json({ error: 'No fue posible leer la salud de la plataforma.' });
    }
  });

  return router;
};
