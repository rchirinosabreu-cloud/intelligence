import express from 'express';
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

router.get('/personal', getPersonalDashboardHandler);
router.get('/personal/:userId', getPersonalDashboardHandler);
router.get('/operational-health', requireRole('ADMIN'), getOperationalHealthHandler);
router.get('/operational-trace', requireRole('ADMIN'), getOperationalTraceHandler);
router.post('/announcements', createDashboardAnnouncementHandler);
router.patch('/announcements/:scope/:id', updateDashboardAnnouncementHandler);
router.delete('/announcements/:scope/:id', deleteDashboardAnnouncementHandler);
router.patch('/clients/:clientId/responsible', assignClientOwnerHandler);

export default router;
