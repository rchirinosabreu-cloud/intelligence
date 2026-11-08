import express from 'express';
import prisma from '../../lib/prisma.js';
import * as announcements from '../../services/announcementDeliveryService.js';

export function createAnnouncementDeliveryRouter({ db = prisma, service = announcements } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.userId) return res.status(401).json({ error: 'Inicia sesión.' });
    next();
  });
  const handle = run => async (req, res) => {
    try { res.json(await run(req)); }
    catch (error) {
      if (!error.statusCode || error.statusCode >= 500) console.error('[Anuncios]', error.message);
      res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No pudimos guardar o consultar el anuncio.' });
    }
  };
  router.get('/:id/preview', handle(req => service.previewAnnouncement(db, req.params.id, req.user)));
  router.get('/:id/history', handle(req => service.announcementHistory(db, req.params.id, req.user)));
  router.post('/:id/response', handle(req => service.respondAnnouncement(db, req.params.id, req.body || {}, req.user)));
  return router;
}
