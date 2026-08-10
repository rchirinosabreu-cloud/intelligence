import express from 'express';
import {
  assignClientOwnerHandler,
  createDashboardAnnouncementHandler,
  getPersonalDashboardHandler
} from '../../controllers/personalDashboardController.js';

const router = express.Router();

router.get('/personal', getPersonalDashboardHandler);
router.get('/personal/:userId', getPersonalDashboardHandler);
router.post('/announcements', createDashboardAnnouncementHandler);
router.patch('/clients/:clientId/responsible', assignClientOwnerHandler);

export default router;
