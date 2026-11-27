import express from 'express';
import multer from 'multer';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { MAX_ANNOUNCEMENT_IMAGE_BYTES, uploadAnnouncementImage } from '../../services/announcementImageService.js';
import { createAnnouncementDeliveryRouter } from './announcementDelivery.js';
import {
  assignClientOwnerHandler,
  createDashboardAnnouncementHandler,
  deleteDashboardAnnouncementHandler,
  getPersonalDashboardHandler,
  updateDashboardAnnouncementHandler
} from '../../controllers/personalDashboardController.js';
import { getOperationalHealthHandler } from '../../controllers/operationalHealthController.js';
import { getOperationalTraceHandler } from '../../controllers/operationalTraceController.js';
import { requireRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();
const imageUpload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: MAX_ANNOUNCEMENT_IMAGE_BYTES, files: 1 } }).single('image');

// Imágenes del anuncio que se está escribiendo (quedan sueltas hasta publicar; ver announcementImageService).
router.post('/announcements/images', (req, res) => imageUpload(req, res, async (uploadError) => {
  if (uploadError) {
    const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'La imagen pesa más de 10 MB. Expórtala más liviana y vuelve a subirla.' : 'No se pudo leer la imagen.' });
  }
  try {
    return res.status(201).json(await uploadAnnouncementImage({ file: req.file, requester: req.user }));
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[Dashboard] Imagen de anuncio:', error);
    return res.status(status).json({ error: error.message || 'No se pudo subir la imagen.' });
  }
}));
router.use('/announcements', createAnnouncementDeliveryRouter());

router.get('/personal', getPersonalDashboardHandler);
router.get('/personal/:userId', getPersonalDashboardHandler);
router.get('/operational-health', requireRole('ADMIN'), getOperationalHealthHandler);
router.get('/operational-trace', requireRole('ADMIN'), getOperationalTraceHandler);
router.post('/announcements', createDashboardAnnouncementHandler);
router.patch('/announcements/:scope/:id', updateDashboardAnnouncementHandler);
router.delete('/announcements/:scope/:id', deleteDashboardAnnouncementHandler);
router.patch('/clients/:clientId/responsible', assignClientOwnerHandler);

export default router;
