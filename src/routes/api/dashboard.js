import express from 'express';
import multer from 'multer';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { MAX_ANNOUNCEMENT_FILE_BYTES, uploadAnnouncementFile } from '../../services/announcementFileService.js';
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
const fileUpload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: MAX_ANNOUNCEMENT_FILE_BYTES, files: 1 } }).single('file');

// Archivos del anuncio que se está escribiendo (quedan sueltos hasta publicar; ver announcementFileService).
router.post('/announcements/files', (req, res) => fileUpload(req, res, async (uploadError) => {
  if (uploadError) {
    const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'El archivo pesa más de 25 MB. Compártelo por Drive y pon el enlace en el anuncio.' : 'No se pudo leer el archivo.' });
  }
  try {
    return res.status(201).json(await uploadAnnouncementFile({ file: req.file, requester: req.user }));
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[Dashboard] Archivo de anuncio:', error);
    return res.status(status).json({ error: error.message || 'No se pudo subir el archivo.' });
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
