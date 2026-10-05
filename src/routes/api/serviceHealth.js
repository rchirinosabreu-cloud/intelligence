import express from 'express';
import { serviceHealthService } from '../../services/serviceHealthService.js';

// Semáforo de servicios (4 de octubre de 2026). Solo administradores: dice qué credencial falla y de
// qué proveedor depende cada cosa, y eso no es información para todo el equipo. La comprobación
// manual existe para confirmar al momento que algo volvió; no se deja pedir más de una vez cada 30 s.
const MANUAL_RUN_COOLDOWN_MS = 30 * 1000;

const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

export const createServiceHealthRouter = ({ service = null, logger = console, clock = () => Date.now() } = {}) => {
  const router = express.Router();
  const resolve = () => service || serviceHealthService();
  let lastManualRunAt = 0;

  router.use((req, res, next) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'El estado de los servicios está disponible solo para administradores.' });
    return next();
  });

  router.get('/', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await resolve().getBoard());
    } catch (error) {
      logger.error('[ServiceHealth] No se pudo armar el tablero:', error.message);
      return res.status(500).json({ error: 'No fue posible leer el estado de los servicios.' });
    }
  });

  // El punto de color de la barra superior (5 de octubre de 2026): solo el color y lo que falla.
  router.get('/summary', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await resolve().getSummary());
    } catch (error) {
      logger.error('[ServiceHealth] No se pudo leer el resumen:', error.message);
      return res.status(500).json({ error: 'No fue posible leer el estado de los servicios.' });
    }
  });

  router.post('/run', async (_req, res) => {
    if (clock() - lastManualRunAt < MANUAL_RUN_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Se acaba de comprobar: espera unos segundos antes de volver a intentarlo.' });
    }
    lastManualRunAt = clock();
    try {
      await resolve().runDueChecks({ force: true });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await resolve().getBoard());
    } catch (error) {
      logger.error('[ServiceHealth] Falló la comprobación manual:', error.message);
      return res.status(500).json({ error: 'No fue posible comprobar los servicios en este momento.' });
    }
  });

  return router;
};
