import express from 'express';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { getBriaWaitingService } from '../../services/briaWaitingService.js';

// «Esperando por ti» (20 de noviembre de 2026): lo que espera una decisión de la persona, para el inicio de Bria.
// Solo lectura y solo conteos; qué fuentes ve cada quien lo decide el servicio. Vive bajo /api/bria, fuera del mapa
// de la plataforma.
const guard = (req, res, next) => canUseBria(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' });
guard.permission = { modules: ['bria'] };

export const createBriaWaitingRouter = ({ service } = {}) => {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(guard);
  router.get('/', async (req, res) => {
    try { res.json(await (service || getBriaWaitingService()).forUser(req.user)); }
    catch (failure) { console.error('[BriaWaiting]', failure?.message || failure); res.status(500).json({ message: 'No se pudo leer lo que espera por ti.' }); }
  });
  return router;
};
