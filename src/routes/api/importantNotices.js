import express from 'express';
import prisma from '../../lib/prisma.js';
import * as importantNotices from '../../services/importantNoticeService.js';

/**
 * Avisos importantes (26 de octubre de 2026): la banda de abajo. Montada para todo el equipo autenticado; cada aviso
 * es de una persona y el servicio comprueba que sea suyo. Registrar la gestión o cerrar la oportunidad pide además el
 * permiso del CRM, también en el servicio.
 */
export function createImportantNoticeRouter({ service = importantNotices, db = prisma, clock = () => new Date() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.userId) return res.status(401).json({ error: 'Inicia sesión.' });
    next();
  });
  const handle = (fallback, run) => async (req, res) => {
    try {
      res.json(await run(req));
    } catch (error) {
      if (error?.statusCode && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message });
      console.error('[Avisos importantes]', fallback, error?.response?.data || error?.message || error);
      res.status(500).json({ error: fallback });
    }
  };
  router.get('/current', handle('No pudimos cargar el aviso.', (req) => service.currentImportantNotice(db, req.user.userId, clock(), { who: req.user.name || null })));
  // Señal de la pantalla: el aviso está a la vista. Queda en la trazabilidad una vez por aparición.
  router.post('/:id/shown', handle('No pudimos registrar el aviso.', (req) => service.markNoticeShown(db, req.params.id, req.user, { now: clock() })));
  router.post('/:id/follow-up', handle('No pudimos registrar el seguimiento.', (req) => service.followUpNotice(db, req.params.id, req.body || {}, req.user, { now: clock() })));
  router.post('/:id/snooze', handle('No pudimos posponer el aviso.', (req) => service.snoozeNotice(db, req.params.id, req.body || {}, req.user, { now: clock() })));
  router.post('/:id/close', handle('No pudimos cerrar la oportunidad.', (req) => service.closeReviewNotice(db, req.params.id, req.body || {}, req.user, { now: clock() })));
  return router;
}
