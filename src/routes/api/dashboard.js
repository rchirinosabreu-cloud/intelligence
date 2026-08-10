import express from 'express';
import {
  assignClientOwnerHandler,
  createDashboardAnnouncementHandler,
  deleteDashboardAnnouncementHandler,
  getPersonalDashboardHandler,
  updateDashboardAnnouncementHandler
} from '../../controllers/personalDashboardController.js';

const router = express.Router();

router.get('/personal', getPersonalDashboardHandler);
router.get('/personal/:userId', getPersonalDashboardHandler);
router.post('/announcements', createDashboardAnnouncementHandler);
router.patch('/announcements/:scope/:id', updateDashboardAnnouncementHandler);
router.delete('/announcements/:scope/:id', deleteDashboardAnnouncementHandler);
router.patch('/clients/:clientId/responsible', assignClientOwnerHandler);

export default router;
