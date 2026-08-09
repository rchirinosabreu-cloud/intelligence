import express from 'express';
import { getPersonalDashboardHandler } from '../../controllers/personalDashboardController.js';

const router = express.Router();

router.get('/personal', getPersonalDashboardHandler);
router.get('/personal/:userId', getPersonalDashboardHandler);

export default router;
